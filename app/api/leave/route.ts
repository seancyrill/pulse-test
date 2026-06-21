import { verifyToken } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/leave — body { token }. Removes the presence row and any
// pending signals to/from this user. Called via navigator.sendBeacon on tab
// close, so the body may arrive as text — parse defensively.
export async function POST(request: NextRequest) {
  let token: string | undefined
  try {
    const text = await request.text()
    token = text ? (JSON.parse(text)?.token as string | undefined) : undefined
  } catch {
    token = undefined
  }

  const id = verifyToken(token ?? null)
  if (!id) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }

  // Independent cleanup deletes — no atomicity needed (and interactive
  // transactions are unreliable over a PgBouncer pooler).
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, { fromId: id }] },
  })
  await prisma.presence.deleteMany({ where: { id } })

  return Response.json({ ok: true })
}
