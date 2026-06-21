import { requireAuth } from "@/lib/auth"
import { SIGNAL_TTL_MS, STALE_MS } from "@/lib/presence"
import { prisma } from "@/lib/prisma"
import type { PollResponse } from "@/lib/types"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/poll — the single endpoint that drives the live map.
// It (1) heartbeats the caller, (2) reaps stale presence + orphan signals,
// (3) returns the filtered online peers, and (4) drains this user's mailbox.
export async function GET(request: NextRequest) {
  const id = requireAuth(request)
  if (!id) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }

  const now = Date.now()
  const staleCutoff = new Date(now - STALE_MS)
  const signalCutoff = new Date(now - SIGNAL_TTL_MS)

  // 1) Heartbeat — refresh lastSeen for the caller.
  // If the row doesn't exist (e.g. server restarted / presence was reaped
  // out from under a still-open tab), don't 500 — tell the client to
  // rejoin instead of leaking a Prisma error.
  try {
    await prisma.presence.update({
      where: { id },
      data: { lastSeen: new Date(now) },
    })
  } catch {
    return Response.json({ error: "session expired" }, { status: 410 })
  }

  // 2) Reap stale presence rows and orphaned signals (independent deletes —
  // no atomicity needed, and avoids transactions over a PgBouncer pooler).
  await prisma.presence.deleteMany({ where: { lastSeen: { lt: staleCutoff } } })
  await prisma.signal.deleteMany({ where: { createdAt: { lt: signalCutoff } } })

  // 3) Online peers, excluding self.
  const peers = await prisma.presence.findMany({
    where: {
      id: { not: id },
      lastSeen: { gte: staleCutoff },
    },
    select: { id: true, lat: true, lng: true, busy: true },
  })

  // 4) Drain this user's mailbox: read, then delete exactly what we read so a
  // concurrently-inserted signal is never lost.
  const inbox = await prisma.signal.findMany({
    where: { toId: id },
    orderBy: { createdAt: "asc" },
  })
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({
      where: { id: { in: inbox.map((s) => s.id) } },
    })
  }

  const response: PollResponse = {
    peers: peers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      busy: p.busy,
    })),
    signals: inbox.map((s) => ({
      id: s.id,
      fromId: s.fromId,
      toId: s.toId,
      type: s.type as PollResponse["signals"][number]["type"],
      payload: s.payload,
      createdAt: s.createdAt.toISOString(),
    })),
  }

  return Response.json(response)
}
