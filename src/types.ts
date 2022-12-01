import axios from "axios";
import CryptoJS from "crypto-js";
import {AXIOS_TIMEOUT_MS} from "./consts";

export interface ProgramOptions {
  address: string;
  addressHFT: string
  tradekey: string;
  tradeKeyHFT: string;

  baseTag: string;
  quoteTag: string;
  symbol: string;
  tokenId: string;
  apiUrl: string;

  baseQuantity: number;
  quoteQuantity: number;
  orderDelayMs: number;

  hft: boolean;
  hftChance: number;
  orderPricePercentHft: number;
  randomTokenMin: number;
  randomTokenMax: number;
  mandatoryIterationRecharge: number;
  sameOrderStreak: number;
  priceChangeThresholdPercent: number;
}

export interface MarketMakerParams extends ProgramOptions {
  fxdx: Fxdx;
  fxdxHFT: Fxdx;
}

interface OrderConfig {
  quantity: number;
  spread: number;
}

export interface Config {
  bids: Array<OrderConfig>;
  asks: Array<OrderConfig>;
  priceThreshold: number;
  quantityThreshold: number;
}

export interface Order {
  quantity: number;
  price: number;
  id: string;
}

export interface OrderBook {
  buy: Array<Order>;
  sell: Array<Order>;
}

export const FxDxSell = 0;
export const FxDxBuy = 1;

export interface FxdxOrder {
    amount: number;
    price: number;
    symbol: string;
    type: number;
}

export interface FxdxQueryOrder {
    symbol: string;
    amount: string;
    price: string;
    status: number;
    trades: any[];
    fee: string;
    fee_unit: string;
    order_id: string;
    order_type: number;
    create_timestamp: number;
    filled_quote: string;
    filled_base: string;
    avg_price: string;
}

export interface FxDxParameters {
    tradingKey: string;
    address: string;
    apiUrl: string;
}

export interface MandatoryHFTIter {
    counter: number,
    appeared: boolean
}

export interface OrderTypeStreak {
    counter: number,
    type: number
}

export class Fxdx {
    public readonly BALANCES = "/v3/balances";
    public readonly ORDERS = "/v3/orders";
    public readonly ORDER = "/v3/order";
    public readonly ORDERBOOK = "/v3/depth";

    private readonly tradingKey: string;
    private readonly address: string;
    private readonly apiUrl: string;

    constructor(params: FxDxParameters) {
        const {tradingKey, address, apiUrl} = params;

        this.tradingKey = tradingKey;
        this.address = address;
        this.apiUrl = apiUrl;
    }

    async post(headers: any, data: any, query: string) {
        const client = axios.create({
            baseURL: this.apiUrl,
            headers: headers,
            timeout: AXIOS_TIMEOUT_MS
        });
        
        return await client.post(query, JSON.stringify(data));
    }

    async authGet(headers: any, query: string, queryParams: any={}) {
        const client = axios.create({
            baseURL: this.apiUrl,
            headers: headers,
            timeout: AXIOS_TIMEOUT_MS,
        });

        return await client.get(query, {params: queryParams});
    }

    async authDelete(headers: any, query: string, queryParams: any={}) {
        delete headers["Content-Type"]

        const client = axios.create({
            baseURL: this.apiUrl,
            headers: headers,
            timeout: AXIOS_TIMEOUT_MS
        });

        return await client.delete(query, {params: queryParams});
    }

    async batchOrders(orders: FxdxOrder[]) {
        const apiPath = this.ORDERS;
        
        const {headers, body} = (new FxdxRequest(
            this.tradingKey, 
            this.address,
            apiPath,
            orders
        )).get();

        const client = axios.create({
            baseURL: this.apiUrl,
            headers: headers,
            timeout: AXIOS_TIMEOUT_MS
        });

        return await client.post(apiPath, body);
    }

    async makeOrder(order: FxdxOrder) {
        const apiPath = this.ORDER;

        const {headers, body} = (new FxdxRequest(
            this.tradingKey, 
            this.address,
            apiPath,
            [order]
        )).get();

        const client = axios.create({
            baseURL: this.apiUrl,
            headers: headers,
            timeout: AXIOS_TIMEOUT_MS
        });

        const response = await client.post(apiPath, body);

        if (response.status >= 300) { throw new Error(`makeOrder. status != 200. ${response.data}`); }
    }

    async batchCancelOrders(symbol: string, ids: string[]) {
        // for (const id of ids) {
        //     const apiPath = `/v3/order/${symbol}/${id}`;
        //     const apiPathEncoded = encodeURI(apiPath);

        //     const {headers} = (new FxdxRequest(
        //         this.tradingKey, 
        //         this.address, 
        //         apiPath
        //     )).get();

        //     await this.authDelete(headers, apiPathEncoded);
        // }

        let apiPath = `${this.ORDERS}/${symbol}/${ids.join("_")}`;
        const apiPathEncoded = encodeURI(apiPath);

        const {headers} = (new FxdxRequest(
            this.tradingKey, 
            this.address, 
            apiPathEncoded
        )).get();

        return await this.authDelete(headers, apiPathEncoded);
    }

    async getBalances(base_: string, quote_: string) {
        const apiPath = this.BALANCES;

        const {headers} = (new FxdxRequest(
            this.tradingKey, 
            this.address, 
            apiPath
        )).get();
        
        const response = await this.authGet(headers, apiPath);

        if (response.status >= 300) { throw new Error(`getBalances. status != 200. ${response.data}`); }

        const balances = (response).data.data;

        return {
            base: balances.find((el: any) => el.name == base_),
            quote: balances.find((el: any) => el.name == quote_)
        }
    }

    async getQueryOrders(symbol: string, from: number, size: number, pending: boolean) {
        const queryParams = { from: from, size: size, pending: pending }

        const apiPath = `${this.ORDERS}/${symbol}`;

        const {headers} = (new FxdxRequest(
            this.tradingKey, 
            this.address, 
            apiPath
        )).get();

        const response = await this.authGet(headers, apiPath, queryParams);

        if (response.status >= 300) { throw new Error(`getQueryOrders. status != 200. ${response.data}`); }

        return (response).data.data;
    }

    async getOrderbook(symbol: string) {
        const client = axios.create({baseURL: this.apiUrl, timeout: AXIOS_TIMEOUT_MS});
        const response = await client.get(`${this.ORDERBOOK}/${symbol}`);

        if (response.status >= 300) { throw new Error(`getOrderbook. status != 200. ${response.data}`); }

        return response.data;
    }
}

export class FxdxRequest {
    private readonly trading_key: string;
    private query: string;
    private address: string;
    private parameters: FxdxOrder[];

    constructor(trading_key: string, address: string, query: string, parameters: any=[]) {
        this.trading_key = trading_key;
        this.address = address;
        this.query = query;
        this.parameters = parameters;
    }

    private getSignature(current_timestamp: number): string {
        const elementsToSign: any = [this.trading_key, current_timestamp, this.query]

        if (this.parameters.length > 0) {
            for (const o of this.parameters) {
                elementsToSign.push(`${o.amount},${o.price},${o.symbol},${o.type}`);
            }
        }

        const msg = elementsToSign.join(",");

        return CryptoJS.HmacSHA256(msg, this.trading_key).toString(CryptoJS.enc.Hex);
    }

    public get(): any {
        const current_timestamp = Math.floor(Date.now() / 1000);
        
        return {
            headers: {
                "X-Signature": this.getSignature(current_timestamp),
                "X-Address": this.address,
                "X-Timestamp": current_timestamp,
                "Content-Type": "application/json"
            },
            body: this.parameters.length > 1 ? this.parameters : this.parameters[0]
        };
    }
}
