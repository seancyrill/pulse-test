// Prevent Next.js fast-refresh from clearing the cache map during local development
const globalForRateLimit = globalThis as unknown as {
  ipCache?: Map<string, number[]>
}

const ipCache = globalForRateLimit.ipCache ?? new Map<string, number[]>()
if (process.env.NODE_ENV !== "production") globalForRateLimit.ipCache = ipCache

interface RateLimitOptions {
  limit: number
  windowMs: number
}

export function isRateLimited(
  ip: string,
  options: RateLimitOptions = { limit: 5, windowMs: 60_000 },
): boolean {
  const now = Date.now()

  if (!ipCache.has(ip)) {
    ipCache.set(ip, [now])
    return false // Not limited
  }

  const timestamps = ipCache.get(ip)!

  // Clean up and keep only timestamps that fall inside the current active window
  const validTimestamps = timestamps.filter(
    (time) => now - time < options.windowMs,
  )

  if (validTimestamps.length >= options.limit) {
    // Memory housekeeping: update with filtered timestamps even if failing
    ipCache.set(ip, validTimestamps)
    return true // Rate limited!
  }

  // Record the current successful hit
  validTimestamps.push(now)
  ipCache.set(ip, validTimestamps)
  return false // Not limited
}
