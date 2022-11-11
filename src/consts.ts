import * as dotenv from "dotenv";

dotenv.config();

export const CONFIG_URL = process.env.CONFIG_URL;

export const QUERY_ORDERS_FROM = 0;
export const QUERY_ORDERS_PENDING = true;

export const FIXED_NUMBER = 4;

export const SAME_ORDER_MAX_STREAK = 5;

export const HFT = true;
export const HFT_CHANCE = 0.5;
export const RANDOM_TOKEN_MIN = 100;
export const RANDOM_TOKEN_MAX = 300;
export const MANDATORY_ITERATION_RECHARGE = 2  // to be sure that every 2 min HFT will work
                                                // 10min / 30 sec = 5
