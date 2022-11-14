import {
    sleep,
    getOrderBookFromConfig,
    openOrdersToOrderBook_,
    getRandomArbitrary,
    getLowestPrices,
    orderTypeChangeIsNeeded,
    getOrderConfig,
    relDiff,
    log,
    getProgramConfig,
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
  } from "./consts";
  import axios from "axios";
  import { isMakeMarketNeeded } from "./checks";
import { stringify } from "querystring";


async function getPrice(tokenId: string) {
    const client = axios.create({baseURL: "https://indexer.ref.finance/"});

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
        fxdxMock: Fxdx, 
        symbol: string, 
        buyLowestPrice: number, sellLowestPrice: number, 
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

    if (orderTypeChangeIsNeeded(orderType, orderTypeStreak)) {
        orderType = orderType == FxDxBuy ? FxDxSell : FxDxBuy;
        randomAmount += 100;
    }

    const price = orderType == FxDxBuy ? sellLowestPrice : buyLowestPrice;
    const parsedPrice = Number.parseFloat(price.toFixed(FIXED_NUMBER));

    const order: FxdxOrder = {
        type: orderType,
        symbol: symbol,
        price: parsedPrice, 
        amount: randomAmount
    }

    randomSleepTimeMs = getRandomArbitrary(1, 20) * 1000;
    await sleep(randomSleepTimeMs);

    console.log(JSON.stringify(orderTypeStreak));
    console.log(`order:  ${JSON.stringify(order)}`);

    const response = await fxdxMock.makeOrder(order);
    if (response.data.code != 200) {
        log(`HFT ${JSON.stringify(response.data)}\n${JSON.stringify(order)}`);
    }

    return randomSleepTimeMs
}


export async function makeMarket(params: MarketMakerParams) {
    let mandatoryHftIter: MandatoryHFTIter = {counter: 0, appeared: false};
    let orderTypeStreak: OrderTypeStreak = {counter: 0, type: 0};
    let indexPrice = await getPrice(params.tokenId);

    while (true) {
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
            const {buyPrice, sellPrice} = getLowestPrices(userOrdersRaw);
            randomSleepTimeMs = await makeHFT(fxdxHFT, symbol, buyPrice, sellPrice, mandatoryHftIter, orderTypeStreak);
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
    }
}