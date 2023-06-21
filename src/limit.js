/** @typedef {{priority: number, cancel: boolean}} Entry */

/**
 * @param {Entry[]} entries
 * @param {number} max
 */
export function truncateWantlist (entries, max = 500) {
  // boxo aims to send less than 16KiB messages...
  if (entries.length <= max) { return entries }

  // Prefer high priority and cancel messages. Copy before mutating.
  const sorted = [...entries].sort(entryPrioritySort)
  return sorted.slice(0, max)
}

/**
 * Compare function to sort highest priority messages first
 * @param {Entry} a
 * @param {Entry} b
 */
export function entryPrioritySort (a, b) {
  const score = priority(b) - priority(a)
  if (score === 0) {
    if (a.cancel && !b.cancel) { return -1 }
    if (!a.cancel && b.cancel) { return 1 }
    return 0
  }
  return score
}

/**
 * Safely get priority
 * @param {Entry} entry
 */
function priority (entry = {}) {
  if (Number.isSafeInteger(entry.priority)) {
    return entry.priority
  }
  return 0
}
