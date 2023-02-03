FROM node:18.12
ENV NODE_ENV production

WORKDIR /app
COPY src /app/src
COPY metrics.yml package.json package-lock.json /app/
RUN npm ci --production

RUN addgroup allusers && adduser bitswap --ingroup allusers --shell /bin/sh

USER bitswap

CMD [ "node", "src/index.js" ]
