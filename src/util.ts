import {Config, Order, FxDxBuy, FxDxSell, FxdxQueryOrder} from "./types";
import {FIXED_NUMBER} from "./consts"

export async function sleep(n: number) {
  return new Promise((resolve) => setTimeout(resolve, n));
}

export const openOrdersToOrderBook_ = (openOrders: FxdxQueryOrder[]) => {
  let sell = [];
  let buy = [];

  for (let order of openOrders) {
    if (order.order_type === FxDxSell) {
      sell.push({
        quantity: Number(order.amount) - Number(order.filled_base),
        price: Number(order.price),
        id: order.order_id
      });
    } else if (order.order_type === FxDxBuy) {
      buy.push({
        quantity: Number(order.amount) - Number(order.filled_base),
        price: Number(order.price),
        id: order.order_id
      });
    }
  }

  return {sell, buy};
};


export const getOrderBookFromConfig = (
  config: Config,
  indexPrice: number,
  baseQuantityToken: number,
  baseQuantityUSDC: number
) => {
  let buy: Order[] = [];
  let sell: Order[] = [];

  config.bids.forEach(item => {
    const bidQuantity = baseQuantityToken * item.quantity;
    const bidPrice = Number.parseFloat((indexPrice * (1 + item.spread)).toFixed(FIXED_NUMBER));
    sell.push({quantity: bidQuantity, price: bidPrice, id: ""});
  });

  config.asks.forEach(item => {
    const totalUSDC = baseQuantityUSDC * item.quantity;
    const askPrice = Number.parseFloat((indexPrice * (1 - item.spread)).toFixed(FIXED_NUMBER)); // price per token
    const askQuantity = parseFloat((totalUSDC / askPrice).toFixed(1));

    buy.push({quantity: askQuantity, price: askPrice, id: ""});
  });

  return {buy, sell};
};
