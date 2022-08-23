FROM node:18.7
ENV NODE_ENV production

WORKDIR /app
COPY src /app/src
COPY .npmrc bitswap.proto metrics.yml package.json package-lock.json /app/
RUN npm ci --production

CMD [ "node", "src/index.js" ]
