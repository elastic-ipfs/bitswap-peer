import retry from 'p-retry'
import { fetch } from 'undici'
import LRUCache from 'mnemonist/lru-cache.js'

/**
 * 46 bytes per multihash * 200k = ~9.2MB (nodes have 2-4GB available)
 * @type {LRUCache<string, boolean>}
 */
const denyCache = new LRUCache(200_000)

/**
 * Check if we already know a CID to be on the denylist
 * TODO: purge cached items if removed from denylist.
 * @param {import('multiformats/cid').CID} cid
 **/
function inDenyCache (cid) {
  // use .get here to update the last used time in the LRU cache
  return !!denyCache.get(cid.toString())
}

/**
 * Add a cid to the denylist cache
 * NOTE: we could set the reason as the cache value if we need it.
 * @param {string} cidStr
 */
function cacheDeniedCid (cidStr) {
  denyCache.set(cidStr, true)
}

/**
 * Remove items that should not be served, determined by the denylist api
 * @param {{cancel: boolean, cid: CID}[]} entries
 * @param {{error: () => void}} logger
 * @param {URL?} denylistUrl - https://denylist.dag.haus or undefined to disable denylist filtering
 */
export async function denylistFilter (entries, logger, denylistUrl) {
  if (!denylistUrl) {
    return entries
  }

  // skip cancels and things we already know are denied.
  const filtered = entries.filter(entry => entry.cancel || !inDenyCache(entry.cid))

  try {
    const res = await retry(() => fetch(denylistUrl, {
      body: JSON.stringify(filtered.map(e => e.cid.toString())),
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
      const denySet = new Set(await res.json())
      for (const cidStr of denySet.values()) {
        cacheDeniedCid(cidStr)
      }
      // filter again to remove any items the api says are denied
      return filtered.filter(entry => !denySet.has(entry.cid.toString()))
    }
  } catch (err) {
    logger.error({ err }, 'denylist check failed')
  }

  // we know the denylist api can hit rate limits so we 'fail open' here,
  // with a fallback to our local cache.
  return filtered
}
