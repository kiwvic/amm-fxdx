#!/bin/bash

source .env

yarn make-market \
    --tradingKey=$TRADE_KEY \
    --tradingKeyHFT=$TRADE_KEY_HFT
