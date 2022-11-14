import {ProgramOptions, Fxdx} from "./types";
import {parse} from "ts-command-line-args";
import {makeMarket} from "./core";
import {getProgramConfig} from "./util";


async function main() {
  const keys = parse<ProgramOptions>({
    tradingKey: String,
    tradingKeyHFT: String
  });
  const args = getProgramConfig();

  const fxdx = new Fxdx({tradingKey: keys.tradingKey, address: args.address, apiUrl: args.apiUrl});
  const fxdxHFT = new Fxdx({tradingKey: keys.tradingKeyHFT, address: args.addressHFT, apiUrl: args.apiUrl});

  await makeMarket({fxdx: fxdx, fxdxHFT: fxdxHFT, ...keys, ...args});
}

main();
