import {
  sleep, 
  getOrderBookFromConfig,
  openOrdersToOrderBook_,
  getRandomArbitrary,
  orderTypeChangeIsNeeded,
  getOrderConfig,
  relDiff,
  log,
  getProgramConfig,
  calculateBestPrice,
} from "./util";
import {
  MarketMakerParams,
  Fxdx,
  FxDxBuy,
  FxDxSell,
  FxdxQueryOrder,
  FxdxOrder,
  MandatoryHFTIter,
  OrderTypeStreak,
} from "./types";
import {
  QUERY_ORDERS_FROM,
  QUERY_ORDERS_PENDING,
  FIXED_NUMBER,
  CANCEL_LAST_HFT_ORDERS,
  AXIOS_TIMEOUT_MS
} from "./consts";
import axios from "axios";
import { isMakeMarketNeeded, notEnoughFunds } from "./checks";


async function getPrice(tokenId: string) {
    const client = axios.create({baseURL: "https://indexer.ref.finance/", timeout: AXIOS_TIMEOUT_MS});

    return client.get("get-token-price", {params: {token_id: tokenId}})
        .then((res) => {return Number(res.data.price)}) as unknown as number;
};


function changeIndexPrice(price: number, newPrice: number) { 
    const config = getProgramConfig()

    let priceDiff = relDiff(newPrice, price);

    if (priceDiff > 0 && priceDiff > config.priceChangeThresholdPercent) {
        price += (price * (config.priceChangeThresholdPercent / 100));
    } else if (priceDiff < 0 && priceDiff < (-1) * config.priceChangeThresholdPercent) {
        price -= (price * (config.priceChangeThresholdPercent / 100));
    }

    return price;
}


async function makeHFT(
        fxdx : Fxdx,
        fxdxHFT: Fxdx, 
        symbol: string, 
        mandatoryHftIter: MandatoryHFTIter,
        orderTypeStreak: OrderTypeStreak
    ) {
    const config = getProgramConfig();

    if (!config.hft) return 0;
    
    let randomSleepTimeMs = 0;
    const skip = Math.random() > config.hftChance;

    if (!mandatoryHftIter.appeared && mandatoryHftIter.counter >= config.mandatoryIterationRecharge) {
        console.log("!mandatoryHftIter.appeared && mandatoryHftIter.counter >= MANDATORY_ITERATION_RECHARGE");
        mandatoryHftIter.counter = 0;
    } else if (mandatoryHftIter.appeared && mandatoryHftIter.counter >= config.mandatoryIterationRecharge) {
        console.log("mandatoryHftIter.appeared && mandatoryHftIter.counter >= MANDATORY_ITERATION_RECHARGE");
        mandatoryHftIter.counter = 0;
        mandatoryHftIter.appeared = false;
        return randomSleepTimeMs;
    } else if (mandatoryHftIter.appeared) {
        console.log("mandatoryHftIter.appeared");
        mandatoryHftIter.counter += 1;
        return randomSleepTimeMs;
    } else if (skip) {
        console.log("skip");
        mandatoryHftIter.counter += 1;
        return randomSleepTimeMs;
    } 

    mandatoryHftIter.appeared = true;
    mandatoryHftIter.counter += 1;

    let randomAmount = getRandomArbitrary(config.randomTokenMin, config.randomTokenMax);
    let orderType = getRandomArbitrary(1, 2) - 1;

    const balances = await fxdx.getBalances(config.baseTag, config.quoteTag);
    const balancesHFT = await fxdxHFT.getBalances(config.baseTag, config.quoteTag);

    const orderBookResponse = (await fxdxHFT.getOrderbook(symbol));
    if (orderBookResponse.data.code != 200) { return randomSleepTimeMs; } 

    const orderBook = orderBookResponse.data.data;
    const bestAskPrice = parseFloat(Number(orderBook.asks[0][0]).toFixed(FIXED_NUMBER));
    const bestBidPrice = parseFloat(Number(orderBook.bids[0][0]).toFixed(FIXED_NUMBER));

    let price = calculateBestPrice(orderType, bestBidPrice, bestAskPrice);

    if (notEnoughFunds(balances, randomAmount, price) && notEnoughFunds(balancesHFT, randomAmount, price)) {
        log(`Not enough funds on each balance!`);
        return randomSleepTimeMs;
    }

    let forceChangeOrderType = false;
    if (orderType == FxDxBuy) {
        if (balancesHFT.quote.available < randomAmount * price || balances.base.available < randomAmount) {
            orderType = orderType == FxDxBuy ? FxDxSell : FxDxBuy;
            price = calculateBestPrice(orderType, bestBidPrice, bestAskPrice);
            forceChangeOrderType = true;
        }
    } else {
        if (balancesHFT.base.available < randomAmount || balances.quote.available < randomAmount * price) {
            orderType = orderType == FxDxBuy ? FxDxSell : FxDxBuy;
            price = calculateBestPrice(orderType, bestBidPrice, bestAskPrice);
            forceChangeOrderType = true;
        }
    }
    
    if (orderTypeChangeIsNeeded(orderType, orderTypeStreak) && !forceChangeOrderType) {
        orderType = orderType == FxDxBuy ? FxDxSell : FxDxBuy;
        randomAmount += 100;
    }

    let response = await fxdx.makeOrder({
        type: orderType == FxDxBuy ? FxDxSell : FxDxBuy,
        symbol: symbol,
        price: price, 
        amount: randomAmount
    });

    if (response.data.code != 200) { return randomSleepTimeMs; }

    response = await fxdxHFT.makeOrder({
            type: orderType,
            symbol: symbol,
            price: price, 
            amount: randomAmount
    });

    if (response.data.code != 200) { log(`HFT ${JSON.stringify(response.data)}`); }

    // TODO
    const userOrdersRaw = await fxdxHFT.getQueryOrders(symbol, QUERY_ORDERS_FROM, CANCEL_LAST_HFT_ORDERS, QUERY_ORDERS_PENDING);
    const userOrdersIds = userOrdersRaw.map((o: FxdxQueryOrder) => o.order_id);
    await fxdxHFT.batchCancelOrders(symbol, userOrdersIds);

    randomSleepTimeMs = getRandomArbitrary(1, 20) * 1000;
    await sleep(randomSleepTimeMs);

    return randomSleepTimeMs;
}


export async function makeMarket(params: MarketMakerParams) {
    let mandatoryHftIter: MandatoryHFTIter = {counter: 0, appeared: false};
    let orderTypeStreak: OrderTypeStreak = {counter: 0, type: 0};
    let indexPrice = await getPrice(params.tokenId);

    while (true) {
        try {
            const { fxdxHFT, symbol, fxdx, orderDelayMs, baseQuantity, quoteQuantity, tokenId } = params;
            let randomSleepTimeMs = 0;
            const config = await getOrderConfig()
            const queryOrdersSize = config.bids.length + config.asks.length;
            
            indexPrice = changeIndexPrice(indexPrice, await getPrice(tokenId));
            if (isNaN(indexPrice)) {
                await sleep(orderDelayMs);
                continue;
            }

            const userOrdersRaw = await fxdx.getQueryOrders(symbol, QUERY_ORDERS_FROM, queryOrdersSize, QUERY_ORDERS_PENDING);
            const userOrdersIds = userOrdersRaw.map((o: FxdxQueryOrder) => o.order_id);

            const orderBook = openOrdersToOrderBook_(userOrdersRaw);
            let configOrders = getOrderBookFromConfig(config, indexPrice, baseQuantity, quoteQuantity);

            if (userOrdersRaw.length > 0) {
                randomSleepTimeMs = await makeHFT(fxdx, fxdxHFT, symbol, mandatoryHftIter, orderTypeStreak);
            }

            if (isMakeMarketNeeded(orderBook, configOrders, config.priceThreshold, config.quantityThreshold)) {
                const orders = [
                    ...configOrders.buy.map((o) => ({
                        type: FxDxBuy, symbol: symbol,
                        price: Number.parseFloat(o.price.toFixed(FIXED_NUMBER)), 
                        amount: Number.parseFloat(o.quantity.toFixed(FIXED_NUMBER))
                    })),
                    ...configOrders.sell.map((o) => ({
                        type: FxDxSell, symbol: symbol,
                        price: Number.parseFloat(o.price.toFixed(FIXED_NUMBER)), 
                        amount: Number.parseFloat(o.quantity.toFixed(FIXED_NUMBER))
                    }))
                ];

                try {
                    await fxdx.batchCancelOrders(symbol, userOrdersIds);

                    const batchOpsResponse = await fxdx.batchOrders(orders);
                    if (batchOpsResponse.data.code != 200) {
                        log(`makeMarket ${JSON.stringify(batchOpsResponse.data)}`);
                    }
                } catch (e) {
                    log(`makeMarket ${e}`);
                }
            }

            console.log(`Waiting ${orderDelayMs}ms`);
            await sleep(orderDelayMs - randomSleepTimeMs);
        } catch (e) {
            log(`main ${e}`);
        }
    }
}