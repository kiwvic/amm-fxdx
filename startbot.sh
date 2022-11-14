source .env
export $(cat .env | grep -vE '^$|^#' | cut -d= -f1) 

yarn make-market \
    --tradingKey=$TRADE_KEY \
    --tradingKeyHFT=$TRADE_KEY_HFT
