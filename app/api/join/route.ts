import { issueSession } from "@/lib/auth"
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo"
import { prisma } from "@/lib/prisma"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/join — body { id, lat, lng } (raw coords).
// Applies a 1–3 km privacy offset and upserts the presence row. Raw
// coordinates are never stored.
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 })
  }

  const { lat, lng } = (body ?? {}) as Record<string, unknown>

  if (!isValidLatLng(lat, lng)) {
    return Response.json({ error: "invalid coordinates" }, { status: 400 })
  }

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

  return Response.json({ ok: true, id, token })
}
