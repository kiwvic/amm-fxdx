import {ProgramOptions, Fxdx} from "./types";
import {makeMarket} from "./core";
import {getProgramConfig} from "./util";


async function main() {
  const args: ProgramOptions = getProgramConfig();

  const fxdx = new Fxdx({tradingKey: args.tradekey, address: args.address, apiUrl: args.apiUrl});
  const fxdxHFT = new Fxdx({tradingKey: args.tradeKeyHFT, address: args.addressHFT, apiUrl: args.apiUrl});

  await makeMarket({fxdx: fxdx, fxdxHFT: fxdxHFT, ...args});
}

main();
