import { issueSession } from "@/lib/auth"
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo"
import { prisma } from "@/lib/prisma"
import { isRateLimited } from "@/lib/rate-limit"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  // Extract client IP address
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1"

  // Rate Limiter Check (e.g., Max 5 requests per 60 seconds)
  if (isRateLimited(ip, { limit: 5, windowMs: 60_000 })) {
    return Response.json(
      { error: "Too many access attempts. Please wait a minute." },
      { status: 429 }, // 429 Too Many Requests
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 })
  }

  const { lat, lng, turnstileToken } = (body ?? {}) as Record<string, unknown>

  if (!turnstileToken || typeof turnstileToken !== "string") {
    return Response.json(
      { error: "Missing security verification" },
      { status: 400 },
    )
  }

  if (!isValidLatLng(lat, lng)) {
    return Response.json({ error: "invalid coordinates" }, { status: 400 })
  }

  // Verify with Cloudflare directly
  try {
    const cfResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: turnstileToken,
          remoteip: ip,
        }),
      },
    )

    const cfData = await cfResponse.json()
    if (!cfData.success) {
      return Response.json(
        { error: "Security validation failed" },
        { status: 403 },
      )
    }
  } catch (err) {
    return Response.json({ error: "Security check timed out" }, { status: 500 })
  }

  // Safe zone! Proceed with your exact native logic
  const { id, token } = issueSession()
  const offset = applyPrivacyOffset(lat as number, lng as number)

  await prisma.presence.create({
    data: {
      id,
      lat: offset.lat,
      lng: offset.lng,
      busy: false,
      lastSeen: new Date(),
    },
  })

  return Response.json({
    ok: true,
    id,
    token,
    lat: offset.lat,
    lng: offset.lng,
  })
}
