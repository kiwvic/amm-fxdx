import {
    sleep,
    getOrderBookFromConfig,
    openOrdersToOrderBook_,
    getRandomArbitrary,
    getLowestPrices,
    orderTypeChangeIsNeeded,
    getConfig, 
    syncWriteFile
} from "./util";
import {
    MarketMakerParams, 
    Fxdx, FxDxBuy, FxDxSell, FxdxQueryOrder, FxdxOrder, 
    MandatoryHFTIter, OrderTypeStreak
} from "./types";
import {
    QUERY_ORDERS_FROM, QUERY_ORDERS_PENDING, 
    RANDOM_TOKEN_MIN, RANDOM_TOKEN_MAX, 
    HFT, MANDATORY_ITERATION_RECHARGE, HFT_CHANCE,
    FIXED_NUMBER
} from "./consts";
import axios from "axios";
import {isMakeMarketNeeded} from "./checks";

const client = axios.create({
baseURL: "https://indexer.ref.finance/",
});

export const getPrice = async (tokenId: string) => {
return client.get("get-token-price", {params: {token_id: tokenId}})
    .then((res) => {return res.data.price}) as unknown as number;
};


// TODO
async function makeHFT(
    fxdxMock: Fxdx, symbol: string, 
    buyLowestPrice: number, sellLowestPrice: number, 
    mandatoryHftIter: MandatoryHFTIter,
    orderTypeStreak: OrderTypeStreak
    ) {
    let randomSleepTimeMs = 0;

    const rand = Math.random();
    console.log(`rand: ${rand}`)
    console.log(`mandatoryHftIter: ${mandatoryHftIter.appeared}, ${mandatoryHftIter.counter}`)
    const skip = rand > HFT_CHANCE;

    // TODO :(
    if (HFT) {
        if (!mandatoryHftIter.appeared && mandatoryHftIter.counter >= MANDATORY_ITERATION_RECHARGE) {
            console.log("!mandatoryHftIter.appeared && mandatoryHftIter.counter >= MANDATORY_ITERATION_RECHARGE");
            mandatoryHftIter.counter = 0;
        } else if (mandatoryHftIter.appeared && mandatoryHftIter.counter >= MANDATORY_ITERATION_RECHARGE) {
            console.log("mandatoryHftIter.appeared && mandatoryHftIter.counter >= MANDATORY_ITERATION_RECHARGE");
            mandatoryHftIter.counter = 0;
            mandatoryHftIter.appeared = false;
            return randomSleepTimeMs;
        } else if (mandatoryHftIter.appeared) {
            console.log("mandatoryHftIter.appeared");
            mandatoryHftIter.counter += 1;
            return randomSleepTimeMs;
        } else if (!skip) {
            console.log("!skip")
            mandatoryHftIter.appeared = true;
            mandatoryHftIter.counter += 1;
        } else if (skip) {
            mandatoryHftIter.counter += 1;
            return randomSleepTimeMs;
        } 
    }

    let randomAmount = getRandomArbitrary(RANDOM_TOKEN_MIN, RANDOM_TOKEN_MAX);
    let orderType = getRandomArbitrary(1, 2) - 1;

    if (orderTypeChangeIsNeeded(orderType, orderTypeStreak)) {
        orderType = orderType == FxDxBuy ? FxDxSell : FxDxBuy;
        randomAmount += 100;
    }

    console.log(JSON.stringify(orderTypeStreak))

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
    console.log(`order:  ${JSON.stringify(order)}`);

    const response = await fxdxMock.makeOrder(order);
    if (response.data.code != 200) {
        syncWriteFile(JSON.stringify(response.data));
    }

    return randomSleepTimeMs
}


export async function makeMarket(params: MarketMakerParams) {
    let mandatoryHftIter: MandatoryHFTIter = {counter: 0, appeared: false};
    let orderTypeStreak: OrderTypeStreak = {counter: 0, type: 0};
    let firstIter = true;

    while (true) {
        const { fxdxHFT, symbol, fxdx, orderDelayMs, baseQuantity, quoteQuantity, tokenId } = params;
        let randomSleepTimeMs = 0;

        const config = await getConfig()

        const queryOrdersSize = config.bids.length + config.asks.length;

        let indexPrice = await getPrice(tokenId); 

        if (isNaN(indexPrice)) {
            console.log("indexPrice is NaN. Skipping iteration.")
            console.log(`Waiting ${orderDelayMs}ms`);
            await sleep(orderDelayMs);
            continue;
        }

        const userOrdersRaw = await fxdx.getQueryOrders(symbol, QUERY_ORDERS_FROM, queryOrdersSize, QUERY_ORDERS_PENDING);
        const userOrdersIds = userOrdersRaw.map((o: FxdxQueryOrder) => o.order_id);

        const orderBook = openOrdersToOrderBook_(userOrdersRaw);
        let configOrders = getOrderBookFromConfig(config, indexPrice, baseQuantity, quoteQuantity);
        
        if (firstIter) {
            firstIter = false;
        } else {
            try {
                if (userOrdersRaw.length > 0) {
                    const {buyPrice, sellPrice} = getLowestPrices(userOrdersRaw)
                    randomSleepTimeMs = await makeHFT(fxdxHFT, symbol, buyPrice, sellPrice, mandatoryHftIter, orderTypeStreak);
                    console.log(`randomSleepTimeMs:  ${randomSleepTimeMs}`);
                    console.log("")
                } else {
                    console.log("userOrdersRaw.length = 0");
                }
            } catch (e) {
                syncWriteFile(e)
            }
        }

        if (isMakeMarketNeeded(orderBook, configOrders, config.priceThreshold, config.quantityThreshold)) {
            const bidOrders = configOrders.buy.map((o) => ({
                type: FxDxBuy,
                symbol: symbol,
                price: Number.parseFloat(o.price.toFixed(FIXED_NUMBER)), 
                amount: Number.parseFloat(o.quantity.toFixed(FIXED_NUMBER))
            }));

            const askOrders = configOrders.sell.map((o) => ({
                type: FxDxSell,
                symbol: symbol,
                price: Number.parseFloat(o.price.toFixed(FIXED_NUMBER)), 
                amount: Number.parseFloat(o.quantity.toFixed(FIXED_NUMBER))
            }));

            try {
                await fxdx.batchCancelOrders(symbol, userOrdersIds);

                const batchOpsResponse = await fxdx.batchOrders([...bidOrders, ...askOrders]);
                if (batchOpsResponse.data.code != 200) {
                    syncWriteFile(JSON.stringify(batchOpsResponse.data));
                }
            } catch (e) {
                syncWriteFile(e)
            }
        }

        console.log(`Waiting ${orderDelayMs}ms`);
        await sleep(orderDelayMs - randomSleepTimeMs);
    }
}