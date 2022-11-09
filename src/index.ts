import {
  sleep,
  getOrderBookFromConfig,
  openOrdersToOrderBook_
} from "./util";
import {parse} from "ts-command-line-args";
import axios from "axios";
import {CONFIG_URL, QUERY_ORDERS_FROM, QUERY_ORDERS_PENDING, FIXED_NUMBER} from "./consts";
import {isMakeMarketNeeded} from "./checks";
import {MarketMakerParams, ProgramOptions, Fxdx, FxDxBuy, FxDxSell, FxdxQueryOrder} from "./types";

const client = axios.create({
  baseURL: "https://indexer.ref.finance/",
});

export const getPrice = async (tokenId: string) => {
  return client.get("get-token-price", {params: {token_id: tokenId}})
    .then((res) => {return res.data.price}) as unknown as number;
};

export const getConfig = async () => {
  return (await axios.get(CONFIG_URL!)).data;
};


async function makeMarket(params: MarketMakerParams) {
  while (true) {
    const { symbol, fxdx, orderDelayMs, baseQuantity, quoteQuantity, tokenId } = params;

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
        console.log(batchOpsResponse);
      } catch (e) {
        console.log("Order failed", e);
      }
    }

    console.log(`Waiting ${orderDelayMs}ms`);
    await sleep(orderDelayMs);
  }
} 


async function main() {
  const args = parse<ProgramOptions>({
    tradingKey: String,
    symbol: String,
    apiUrl: String,
    address: String,
    baseQuantity: Number,
    quoteQuantity: Number,
    orderDelayMs: Number,
    configUrl: String,
    tokenId: String,
  });

  const fxdx = new Fxdx({...args});

  await makeMarket({fxdx: fxdx, ...args});
}

main();
