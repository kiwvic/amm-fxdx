source .env
export $(cat .env | grep -vE '^$|^#' | cut -d= -f1) 

yarn make-market \
    --tradingKey=$TRADE_KEY \
    --tradingKeyHFT=$TRADE_KEY_HFT \
    --symbol=$SYMBOL \
    --apiUrl=$API_URL \
    --address=$ADDRESS \
    --addressHFT=$ADDRESS_HFT \
    --baseQuantity=$BASE_QUANTITY \
    --quoteQuantity=$QUOTE_QUANTITY \
    --orderDelayMs=$ORDER_DELAY_MS \
    --configUrl=$CONFIG_URL \
    --tokenId=$TOKEN_ID_REF_FINANCE
