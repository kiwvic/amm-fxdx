import * as dotenv from "dotenv";

dotenv.config();

export const CONFIG_URL = process.env.CONFIG_URL;
export const LOGFILE = "../fxdx.log";

export const QUERY_ORDERS_FROM = 0;
export const QUERY_ORDERS_PENDING = true;

export const FIXED_NUMBER = 4;

export const CANCEL_LAST_HFT_ORDERS = 3;

export const AXIOS_TIMEOUT_MS = 20000;
