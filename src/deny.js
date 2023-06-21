import retry from 'p-retry'
import { fetch } from 'undici'
import LRUCache from 'mnemonist/lru-cache.js'
import { cidToKey } from 'e-ipfs-core-lib'
import { CID } from 'multiformats/cid'

/**
 * 46 bytes per multihash * 200k = ~9.2MB (nodes have 2-4GB available)
 * @type {LRUCache<string, boolean>}
 */
const denylistCache = new LRUCache(200_000)

/**
 * Remove items that should not be served, determined by the denylist api
 * @param {{cancel: boolean, cid: CID}[]} wantlist
 * @param {{error: () => void}} logger
 * @param {URL} denylistUrl - e.g https://denylist.dag.haus
 */
export async function denylistFilter (wantlist, logger, denylistUrl) {
  /**
   * cids to ask the denylist about
   * @type {string[]}
   */
  const batch = []

  // skip cancels and thing we already know are denied.
  for (const entry of wantlist) {
    if (entry.cancel || denylistCache.get(cidToKey(entry.cid))) {
      continue
    }
    batch.push(entry.cid.toString())
  }

  try {
    const res = await retry(() => fetch(denylistUrl, {
      body: JSON.stringify(batch),
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      }
    }), {
      retries: 5, // try once then 5 more times
      factor: 1.2, // scaling factor so total wait is 10s see: https://www.wolframalpha.com/input?i=Sum%5B1000*x%5Ek,+%7Bk,+0,+5%7D%5D+%3D+10+*+1000
      minTimeout: 1000 // ms to wait before first retry
    })

    if (res.ok) {
      const denylist = new Set(await res.json())
      for (const cidStr of denylist.values()) {
        denylistCache.set(cidToKey(CID.parse(cidStr)), true)
      }
      // all `cancel`s go through, and items not on the denylist
      return wantlist.filter(entry => entry.cancel || !denylist.has(entry.cid.toString()))
    }
  } catch (err) {
    logger.error({ err }, 'denylist check failed')
  }
  console.log('from cache')

  // we know the denylist api can hit rate limits so we 'fail open' here,
  // with a fallback to our local cache.
  return wantlist.filter(entry => entry.cancel || !denylistCache.get(cidToKey(entry.cid)))
}
