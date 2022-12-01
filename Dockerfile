FROM node:12-alpine as base

RUN apk add --no-cache git
WORKDIR /usr/app

COPY ["package.json", "yarn.lock", "./"]
RUN yarn install --production=false

COPY . .

FROM base
RUN yarn build

RUN yarn install --production && \
    yarn autoclean --init && \
    echo *.ts >> .yarnclean && \
    yarn autoclean --force && \
    yarn cache clean

CMD ["node", "dist/index.js"]