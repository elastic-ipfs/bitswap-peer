FROM node:18.12
ENV NODE_ENV production

WORKDIR /app
COPY src /app/src
COPY bitswap.proto metrics.yml package.json package-lock.json /app/
RUN npm ci --production

CMD [ "node", "src/index.js" ]
