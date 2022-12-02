import {Config, Order, FxDxBuy, FxDxSell, FxdxQueryOrder, OrderTypeStreak, ProgramOptions} from "./types";
import { readFileSync, writeFileSync, promises as fsPromises, appendFileSync } from 'fs';
import {FIXED_NUMBER, LOGFILE} from "./consts"
import { join } from 'path';


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


export const getRandomArbitrary = (min: number, max: number) => {
  return Math.round(Math.random() * (max - min) + min);
}


export const getRandomDecimal = (min: number, max: number) => {
  return Math.random() * (max - min) + min;
}


export const toFixedNoRound = (number: number, precision: number): number => {
  const factor = Math.pow(10, precision);
  return Math.floor(number * factor) / factor;
}


export const orderTypeChangeIsNeeded = (orderType: number, orderTypeStreak: OrderTypeStreak) => {
  const config = getProgramConfig()

  if (orderTypeStreak.type == orderType && orderTypeStreak.counter >= config.sameOrderStreak) {
    orderTypeStreak.counter = 0;
    return true;
  } else if (orderTypeStreak.type != orderType || orderTypeStreak.counter >= config.sameOrderStreak) {
    orderTypeStreak.type = orderType;
    orderTypeStreak.counter = 0;
  } else {
    orderTypeStreak.counter += 1;
  }

  return false;
}

export const calculateBestPrice = (orderType: number, bestBid: number, bestAsk: number) => {
  const config = getProgramConfig()

  // TODO
  let price = orderType == FxDxBuy ? bestAsk : bestBid;
  if (orderType == FxDxBuy) {
      price -= price * (getRandomDecimal(0, config.orderPricePercentHft) / 100);
  } else {
      price += price * (getRandomDecimal(0, config.orderPricePercentHft) / 100);
  }

  return toFixedNoRound(price, FIXED_NUMBER);
}
  
export const getOrderConfig = async () => {
  return require("../order-config.json");
};

export const getProgramConfig = (): ProgramOptions => {
  return require("../config.json");
};


export function log(data: any) {
  appendFileSync(
    join(__dirname, LOGFILE), 
    `[${(new Date()).toLocaleString()}] ${data}\n`
  );
}


export function relDiff(a: any, b: any) {
  return  100 * ( ( a - b ) / ( (a+b)/2 ) );
 }
