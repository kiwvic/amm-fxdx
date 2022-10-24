source .env
export $(cat .env | grep -vE '^$|^#' | cut -d= -f1) 

yarn make-market \
    --tradingKey=$TRADE_KEY \
    --symbol=$SYMBOL \
    --apiUrl=$API_URL \
    --address=$ADDRESS \
    --baseQuantity=$BASE_QUANTITY \
    --quoteQuantity=$QUOTE_QUANTITY \
    --orderDelayMs=$ORDER_DELAY_MS \
    --configUrl=$CONFIG_URL \
    --tokenId=$TOKEN_ID_REF_FINANCE
