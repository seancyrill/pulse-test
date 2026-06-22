"use client"

import { Turnstile } from "@marsidev/react-turnstile"
import { useState } from "react"

export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number, turnstileToken: string) => void
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle")
  const [error, setError] = useState<string>("")
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  function enter() {
    if (!turnstileToken) {
      setStatus("error")
      setError("Security verification incomplete. Please try again.")
      return
    }

    if (!("geolocation" in navigator)) {
      setStatus("error")
      setError("Your browser doesn't support location access.")
      return
    }

    setStatus("locating")
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        onReady(pos.coords.latitude, pos.coords.longitude, turnstileToken),
      (err) => {
        setStatus("error")
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission is required to place you on the map."
            : "Couldn't get your location. Please try again.",
        )
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-8 bg-zinc-950 p-6 text-zinc-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Pulse</h1>
        <p className="mt-2 max-w-sm text-zinc-400">
          A living globe of anonymous strangers. Drop onto the map and connect.
        </p>
      </div>

      {/* Cloudflare turnstile challenge widget */}
      <div className="my-2 text-zinc-950">
        <Turnstile
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
          onSuccess={(token) => setTurnstileToken(token)}
          onExpire={() => setTurnstileToken(null)}
          onError={() => {
            setStatus("error")
            setError("Security check failed. Refresh the page.")
          }}
        />
      </div>

      <button
        onClick={enter}
        // wait for turnstile to finish
        disabled={status === "locating" || !turnstileToken}
        className="rounded-full bg-emerald-400 px-8 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-60"
      >
        {status === "locating" ? "Locating…" : "Enter Pulse"}
      </button>

      {status === "error" && (
        <p className="max-w-sm text-center text-sm text-red-400">{error}</p>
      )}

      <p className="max-w-sm text-center text-xs text-zinc-500">
        No sign-up. Your dot is placed 2–5&nbsp;km from your real location.
        Nothing is stored — closing the tab ends everything.
      </p>
    </div>
  )
}
