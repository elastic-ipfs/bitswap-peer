FROM node:16-alpine
ENV NODE_ENV production

WORKDIR /app
COPY src /app/src
COPY bitswap.proto package.json /app/
RUN npm install --production

CMD [ "node", "src/index.js" ]
