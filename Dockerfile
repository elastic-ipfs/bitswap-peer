FROM node:16-alpine
ENV NODE_ENV production

WORKDIR /app
COPY src /app/src
COPY .npmrc bitswap.proto metrics.yml package.json /app/
RUN npm install --production

CMD [ "node", "src/index.js" ]
