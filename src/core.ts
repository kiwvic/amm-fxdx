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
  MandatoryHFTIter,
  OrderTypeStreak,
} from "./types";
import {
  QUERY_ORDERS_FROM,
  QUERY_ORDERS_PENDING,
  FIXED_NUMBER,
  CANCEL_LAST_HFT_ORDERS,
  AXIOS_TIMEOUT_MS,
  ERROR_TIMEOUT_MS
} from "./consts";
import axios, { AxiosResponse } from "axios";
import { isMakeMarketNeeded, notEnoughFunds } from "./checks";


async function getPrice(tokenId: string) {
    const client = axios.create({baseURL: "https://indexer.ref.finance/", timeout: AXIOS_TIMEOUT_MS});

    return client.get("get-token-price", {params: {token_id: tokenId}})
        .then((res: AxiosResponse) => {
            log(`getPrice. ${res.status}, ${res.data}`);
            if (res.status >= 300) { throw new Error(`getPrice. status != 200. ${res.data}`); }
            if (isNaN(res.data.price)) { throw new Error(`getPrice. price is NaN. ${res.data}`); }

            return Number(res.data.price);
        });
};


function changeIndexPrice(price: number, newPrice: number) { 
    const config = getProgramConfig();

    let priceDiff = relDiff(newPrice, price);
    log(`changeIndexPrice. priceDiff: ${priceDiff}`);

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
    log(`makeHFT. start`);
    const config = getProgramConfig();

    if (!config.hft) return 0;
    
    let randomSleepTimeMs = 0;
    const skip = Math.random() > config.hftChance;
    log(`makeHFT. before if statements`);
    if (!mandatoryHftIter.appeared && mandatoryHftIter.counter >= config.mandatoryIterationRecharge) {
        log("makeHFT. !mandatoryHftIter.appeared && mandatoryHftIter.counter >= MANDATORY_ITERATION_RECHARGE");
        mandatoryHftIter.counter = 0;
    } else if (mandatoryHftIter.appeared && mandatoryHftIter.counter >= config.mandatoryIterationRecharge) {
        log("makeHFT. mandatoryHftIter.appeared && mandatoryHftIter.counter >= MANDATORY_ITERATION_RECHARGE");
        mandatoryHftIter.counter = 0;
        mandatoryHftIter.appeared = false;
        return randomSleepTimeMs;
    } else if (mandatoryHftIter.appeared) {
        log("makeHFT. mandatoryHftIter.appeared");
        mandatoryHftIter.counter += 1;
        return randomSleepTimeMs;
    } else if (skip) {
        log("makeHFT. skip");
        mandatoryHftIter.counter += 1;
        return randomSleepTimeMs;
    } 

    mandatoryHftIter.appeared = true;
    mandatoryHftIter.counter += 1;

    let randomAmount = getRandomArbitrary(config.randomTokenMin, config.randomTokenMax);
    let orderType = getRandomArbitrary(1, 2) - 1;

    const balances = await fxdx.getBalances(config.baseTag, config.quoteTag);
    const balancesHFT = await fxdxHFT.getBalances(config.baseTag, config.quoteTag);
    log(`makeHFT. balances: ${JSON.stringify(balances)}`);
    log(`makeHFT. balancesHFT: ${JSON.stringify(balancesHFT)}`);
    let orderBook;
    try {
        orderBook = (await fxdxHFT.getOrderbook(symbol)).data;
        log(`makeHFT. orderBook: ${orderBook}`);
    } catch (e) {
        return randomSleepTimeMs; 
    }

    const bestAskPrice = parseFloat(Number(orderBook.asks[0][0]).toFixed(FIXED_NUMBER));
    const bestBidPrice = parseFloat(Number(orderBook.bids[0][0]).toFixed(FIXED_NUMBER));
    log(`makeHFT. bestAsk/BIdPrice: ${bestAskPrice}/${bestBidPrice}`);
    let price = calculateBestPrice(orderType, bestBidPrice, bestAskPrice);
    log(`makeHFT. bestPrice: ${price}`);

    if (notEnoughFunds(balances, randomAmount, price) && notEnoughFunds(balancesHFT, randomAmount, price)) {
        log(`Not enough funds on each balance!`);
        return randomSleepTimeMs;
    }

    log(`makeHFT. before if order swap`);
    let forceChangeOrderType = false;
    if (orderType == FxDxBuy) {
        if (balancesHFT.quote.available < randomAmount * price || balances.base.available < randomAmount) {
            orderType = orderType == FxDxBuy ? FxDxSell : FxDxBuy;
            price = calculateBestPrice(orderType, bestBidPrice, bestAskPrice);
            forceChangeOrderType = true;
            log(`makeHFT. orderswap price: ${price}`);
        }
    } else {
        if (balancesHFT.base.available < randomAmount || balances.quote.available < randomAmount * price) {
            orderType = orderType == FxDxBuy ? FxDxSell : FxDxBuy;
            price = calculateBestPrice(orderType, bestBidPrice, bestAskPrice);
            forceChangeOrderType = true;
            log(`makeHFT. orderswap price: ${price}`);
        }
    }
    
    if (orderTypeChangeIsNeeded(orderType, orderTypeStreak) && !forceChangeOrderType) {
        orderType = orderType == FxDxBuy ? FxDxSell : FxDxBuy;
        randomAmount += 100;
        log(`makeHFT. orderswap type`);
    }

    log(`makeHFT. before makeorders`);
    // TODO cancel first order if something wrong with second
    try {
        await fxdx.makeOrder({
            type: orderType == FxDxBuy ? FxDxSell : FxDxBuy,
            symbol: symbol,
            price: price, 
            amount: randomAmount
        });
        await fxdxHFT.makeOrder({
            type: orderType,
            symbol: symbol,
            price: price, 
            amount: randomAmount
        });
    } catch (e) {
        return randomSleepTimeMs;
    }
    log(`makeHFT. after makeorders`);

    const userOrdersRaw = await fxdxHFT.getQueryOrders(symbol, QUERY_ORDERS_FROM, CANCEL_LAST_HFT_ORDERS, QUERY_ORDERS_PENDING);
    const userOrdersIds = userOrdersRaw.map((o: FxdxQueryOrder) => o.order_id);
    await fxdxHFT.batchCancelOrders(symbol, userOrdersIds);

    randomSleepTimeMs = getRandomArbitrary(1, 20) * 1000;
    await sleep(randomSleepTimeMs);

    log(`makeHFT. end`);

    return randomSleepTimeMs;
}


export async function makeMarket(params: MarketMakerParams) {
    let mandatoryHftIter: MandatoryHFTIter = {counter: 0, appeared: false};
    let orderTypeStreak: OrderTypeStreak = {counter: 0, type: 0};
    let indexPrice = await getPrice(params.tokenId);

    while (true) {
        log("makeMarket. start");
        const { fxdxHFT, symbol, fxdx, orderDelayMs, baseQuantity, quoteQuantity, tokenId } = params;
        let randomSleepTimeMs = 0;
        const config = await getOrderConfig()
        const queryOrdersSize = config.bids.length + config.asks.length;
        
        let newPrice;
        try {
            newPrice = await getPrice(tokenId);
            log(`makeMarket. newPrice: ${newPrice}`);
        } catch(e: any) {
            log(e.message);
            await sleep(orderDelayMs);
            continue;
        }
        indexPrice = changeIndexPrice(indexPrice, newPrice);
        log(`makeMarket. indexPrice: ${indexPrice}`);
        
        let userOrdersRaw;
        let userOrdersIds;
        try {
            userOrdersRaw = await fxdx.getQueryOrders(symbol, QUERY_ORDERS_FROM, queryOrdersSize, QUERY_ORDERS_PENDING);
            userOrdersIds = userOrdersRaw.map((o: FxdxQueryOrder) => o.order_id);
            log(`makeMarket. userOrdersIds`);
        } catch (e: any) {
            log(e.message);
            await sleep(orderDelayMs);
            continue;
        }

        const orderBook = openOrdersToOrderBook_(userOrdersRaw);
        log(`makeMarket. userOrdersIds: ${userOrdersIds}`);
        let configOrders = getOrderBookFromConfig(config, indexPrice, baseQuantity, quoteQuantity);
        log(`makeMarket. configOrders: ${configOrders}`);

        if (userOrdersRaw.length > 0) {
            try {
                randomSleepTimeMs = await makeHFT(fxdx, fxdxHFT, symbol, mandatoryHftIter, orderTypeStreak);
            } catch (e: any) {
                log(e.message);
                await sleep(orderDelayMs);
                continue;
            }
        }

        log(`makeMarket. before makeMarket`);
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
            log(`makeMarket. orders ${orders}`);

            try {
                log(`makeMarket. cancelOrders`);
                await fxdx.batchCancelOrders(symbol, userOrdersIds);

                const batchOpsResponse = await fxdx.batchOrders(orders);
                log(`makeMarket. ${batchOpsResponse.data}`);
                if (batchOpsResponse.data.code != 200) {
                    log(`makeMarket ${JSON.stringify(batchOpsResponse.data)}`);
                }
                log(`makeMarket. cancelOrders end`);
            } catch (e: any) {
                log(`makeMarket LAST ${e.message}`);
            }
        }
        log(`makeMarket. after`);

        console.log(`Waiting ${orderDelayMs}ms`);
        await sleep(orderDelayMs - randomSleepTimeMs);
        log("makeMarket. end");
    }
}