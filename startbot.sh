#!/bin/bash

source .env

screen -S amm-fxdx yarn make-market \
    --tradingKey=$TRADE_KEY \
    --tradingKeyHFT=$TRADE_KEY_HFT
