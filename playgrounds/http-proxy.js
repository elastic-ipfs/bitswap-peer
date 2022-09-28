'use strict'

const helper = require('../test/e2e/helper')
const config = require('../src/config')

process.env.TARGET = process.env.TARGET ?? 'local'

const targets = {
  local: '/ip4/127.0.0.1/tcp/3000/ws/p2p/bafzbeia6mfzohhrwcvr3eaebk3gjqdwsidtfxhpnuwwxlpbwcx5z7sepei',
  prod: '/dns4/elastic.dag.house/tcp/443/wss/p2p/bafzbeibhqavlasjc7dvbiopygwncnrtvjd2xmryk5laib7zyjor6kf3avm',
  staging: '/dns4/elastic-staging.dag.house/tcp/443/wss/p2p/bafzbeigjqot6fm3i3yv37wiyybsfblrlsmib7bzlbnkpjxde6fw6b4fvei',
  dev: '/dns4/elastic-dev.dag.house/tcp/443/wss/p2p/bafzbeia6mfzohhrwcvr3eaebk3gjqdwsidtfxhpnuwwxlpbwcx5z7sepei'
}

async function main() {
  await helper.startProxy({
    config,
    target: targets[process.env.TARGET],
    startPeer: process.env.TARGET === 'local'
  })
}

main()

/*

HOW TO USE

// 1 found

curl -X POST -H "Content-Type: application/json" \
-d '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"}]}' \
http://localhost:3002/

// 2 found same cid i+d

curl -X POST -H "Content-Type: application/json" \
-d '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"i","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbM"},{"type":"d","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"d","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbM"}]}' \
http://localhost:3002/

// 1 not found

curl -X POST -H "Content-Type: application/json" \
-d '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBX"}]}' \
http://localhost:3002/

// 1 found, 1 not found

curl -X POST -H "Content-Type: application/json" \
-d '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"i","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbX"}]}' \
http://localhost:3002/

autocannon -m POST \
-H "Content-Type":"application/json" \
-b '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"i","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbM"},{"type":"d","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"d","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbM"}]}' \
http://localhost:3002/

*/
