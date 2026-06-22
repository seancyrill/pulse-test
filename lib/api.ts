// Client-side helpers for talking to the coordination API.
import type { PollResponse, SignalType } from "@/lib/types"

// The session token lives in memory only (module-level var, cleared on
// refresh — a refreshed tab is a new anonymous session, consistent with
// the rest of the app's model). It's set once join() resolves and read by
// every other call below. Never persisted to localStorage/sessionStorage.
let sessionToken: string | null = null

function authHeader(): HeadersInit {
  if (!sessionToken) throw new Error("not joined yet")
  return { Authorization: `Bearer ${sessionToken}` }
}

export async function join(
  lat: number,
  lng: number,
  turnstileToken: string,
): Promise<{ id: string; lat: number; lng: number }> {
  const res = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, turnstileToken }),
  })
  if (!res.ok) throw new Error(`join failed: ${res.status}`)
  const data = await res.json()
  sessionToken = data.token
  return {
    id: data.id as string,
    lat: data.lat as number,
    lng: data.lng as number,
  }
}

export async function poll(): Promise<PollResponse> {
  const res = await fetch("/api/poll", {
    cache: "no-store",
    headers: authHeader(),
  })
  if (!res.ok) throw new Error(`poll failed: ${res.status}`)
  return res.json()
}

export async function sendSignal(
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<void> {
  await fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ toId, type, payload }),
  })
}

// Fire-and-forget leave that survives the tab closing.
//
// sendBeacon can't set custom headers, so the token rides in the body here
// instead of as a bearer header — same as the fetch+keepalive fallback.
// Verified identically server-side regardless of which path it took.
export function leave(): void {
  if (!sessionToken) return
  const body = JSON.stringify({ token: sessionToken })
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/leave", body)
  } else {
    void fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    })
  }
  sessionToken = null
}
