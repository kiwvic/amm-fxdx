import * as dotenv from "dotenv";

dotenv.config();

export const CONFIG_URL = process.env.CONFIG_URL;

export const QUERY_ORDERS_FROM = 0;
export const QUERY_ORDERS_SIZE = 12;
export const QUERY_ORDERS_PENDING = true;

export const FIXED_NUMBER = 4;
