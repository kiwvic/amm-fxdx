import {ProgramOptions, Fxdx} from "./types";
import {parse} from "ts-command-line-args";
import {makeMarket} from "./core"


async function main() {
  const args = parse<ProgramOptions>({
    tradingKey: String,
    tradingKeyHFT: String,
    symbol: String,
    apiUrl: String,
    address: String,
    addressHFT: String,
    baseQuantity: Number,
    quoteQuantity: Number,
    orderDelayMs: Number,
    configUrl: String,
    tokenId: String,
  });

  const fxdx = new Fxdx({tradingKey: args.tradingKey, address: args.address, apiUrl: args.apiUrl});
  const fxdxHFT = new Fxdx({tradingKey: args.tradingKeyHFT, address: args.addressHFT, apiUrl: args.apiUrl});

  await makeMarket({fxdx: fxdx, fxdxHFT: fxdxHFT, ...args});
}

main();
