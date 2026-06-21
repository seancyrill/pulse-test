import { createHmac, randomUUID, timingSafeEqual } from "crypto"

const SECRET = process.env.SESSION_SECRET

if (!SECRET) {
  // Make it fail at boot
  throw new Error("SESSION_SECRET env var is required")
}

function sign(id: string): string {
  return createHmac("sha256", SECRET!).update(id).digest("hex")
}

/**
 * Mint a new session: a fresh id plus a token binding that id to this server.
 * Call this once, in /api/join, when a tab first joins the map.
 */
export function issueSession(): { id: string; token: string } {
  const id = randomUUID()
  const token = `${id}.${sign(id)}`
  return { id, token }
}

/**
 * Verify a bearer token and return the id it certifies, or null if the
 * token is missing, malformed, or doesn't match our signature.
 * This is the ONLY place an `id` should be trusted from in route handlers
 * — never trust an `id` field taken straight from a request body/query.
 */
export function verifyToken(token: string | null | undefined): string | null {
  if (!token) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null

  const id = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = sign(id)

  const a = Buffer.from(sig, "hex")
  const b = Buffer.from(expected, "hex")
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null

  return id
}

/**
 * Pull the bearer token out of a request and resolve it to a verified id.
 * Returns null if there's no valid token — caller should respond 401.
 */
export function requireAuth(request: Request): string | null {
  const header = request.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return null
  return verifyToken(header.slice("Bearer ".length))
}
