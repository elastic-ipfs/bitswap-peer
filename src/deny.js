import retry from 'p-retry'
import LRUCache from 'mnemonist/lru-cache.js'
import { cidToKey } from 'e-ipfs-core-lib'

/** 
 * 46 bytes per multihash * 200k = ~9.2MB (nodes have 2-4GB available) 
 * @type {LRUCache<string, boolean>}
 */ 
const denylistCache = new LRUCache(string, boolean, 200_000)

/**
 * Remove items that should not be served, determined by the denylist api
 * @param {{cancel: boolean, cid: CID[]} wantlist
 */
export async function denylistFilter (wantlist, logger, denylistUrl) {
  /** 
   * cids to ask the denylist about
   * @type {string[]}
   */
  const batch = []

  // skip cancels and thing we already know are denied.
  for (const entry of wantlist) {
    if (entry.cancel) continue
    if (denylistCache.get(cidToKey(entry.cid))) continue
    batch.push(entry.cid.toString())
  }

  try {
    const res = await retry(() => fetch(denylistUrl, {
      body: JSON.stringify(cids),
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
    }), { 
      retries: 5,      // try once then 5 more times
      factor: 1.2,     // scaling factor so total wait is 10s see: https://www.wolframalpha.com/input?i=Sum%5B1000*x%5Ek,+%7Bk,+0,+5%7D%5D+%3D+10+*+1000
      minTimeout: 1000 // ms to wait before first retry
    })
  
    if (res.ok) {
      const denylist = new Set(await res.json())
      for (const cid of denylist.keys()) {
        denylistCache.set(cidToKey(cid), true)
      }
      // all `cancel`s go through, and items not on the denylist
      return wantlist.filter(entry => entry.cancel || !denylist.has(entry.cid))
    }
  } catch (err) {
    logger.error({ err }, 'denylist check failed')
  }

  // we know the denylist api can hit rate limits so we 'fail open' here,
  // with a fallback to our local cache.
  return wantlist.filter(entry => entry.cancel || !denylistCache.has(entry.cid))
}
