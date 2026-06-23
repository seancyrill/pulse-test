"use client"

import { useEffect, useRef, useState } from "react"

interface VideoPreviewProps {
  // Called once the user taps Ready. Hands back the SAME stream that was
  // already running during preview. Mute/camera-off state isn't passed
  // separately — it's already encoded on the stream's own tracks via
  // track.enabled, set by toggleMute/toggleCamera below, and travels
  // with the stream automatically once it's attached to a connection.
  onReady: (stream: MediaStream) => void
  // Called on Cancel, or if getUserMedia itself fails. The caller is
  // responsible for resetting whatever state put them in preview mode —
  // this component only owns its own camera/mic lifecycle.
  onCancel: () => void
}

export default function VideoPreview({ onReady, onCancel }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          // Unmounted (e.g. parent already navigated away) before this
          // resolved — release immediately, nothing else will.
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setError("Camera unavailable.")
      })

    return () => {
      cancelled = true
      // If Ready was never pressed, we own this stream and must release
      // it — otherwise the camera light stays on with nothing using it.
      // handleReady clears streamRef.current before calling onReady
      // specifically so this cleanup doesn't stop a stream that's now
      // the call's responsibility.
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop()
        streamRef.current = null
      }
    }
  }, [])

  function toggleMute() {
    const stream = streamRef.current
    if (!stream) return
    const next = !muted
    for (const track of stream.getAudioTracks()) track.enabled = !next
    setMuted(next)
  }

  function toggleCamera() {
    const stream = streamRef.current
    if (!stream) return
    const next = !cameraOff
    for (const track of stream.getVideoTracks()) track.enabled = !next
    setCameraOff(next)
  }

  function handleReady() {
    const stream = streamRef.current
    if (!stream) return
    streamRef.current = null // ownership transfers to the caller now
    onReady(stream)
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black h-dvh w-screen overflow-hidden">
      <div className="relative flex-1 w-full max-w-2xl mx-auto bg-zinc-900">
        {/* Always mounted — toggling cameraOff must not remount this
            element, or srcObject is lost and the feed never recovers
            (it was set once, in the getUserMedia effect, not on every
            render). Hiding it with CSS instead keeps the same node and
            the same srcObject assignment alive across toggles. */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover ${
            cameraOff ? "invisible" : ""
          }`}
        />

        {cameraOff && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 3l18 18" />
              <path d="M10 6h5a2 2 0 0 1 2 2v3.5l4-2.5v8l-4-2.5V17a2 2 0 0 1-.34.27M16 16H6a2 2 0 0 1-2-2V8c0-.55.22-1.05.59-1.41" />
            </svg>
            <span className="text-sm">Camera is off</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
            {error}
          </div>
        )}

        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-black/60 px-3.5 py-1.5 text-sm text-zinc-200">
          This is what they’ll see
        </div>

        {ready && (
          <div className="absolute bottom-24 left-0 right-0 z-10 flex justify-center gap-4">
            <button
              onClick={toggleMute}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              className={`flex h-13 w-13 items-center justify-center rounded-full ${
                muted ? "bg-red-600" : "bg-white/15"
              } text-white`}
            >
              {muted ? <MicOffIcon /> : <MicIcon />}
            </button>
            <button
              onClick={toggleCamera}
              aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
              className={`flex h-13 w-13 items-center justify-center rounded-full ${
                cameraOff ? "bg-red-600" : "bg-white/15"
              } text-white`}
            >
              {cameraOff ? <CameraOffIcon /> : <CameraIcon />}
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0 flex justify-center gap-3 bg-zinc-950 p-4 pb-safe">
        <button
          onClick={onCancel}
          className="rounded-full bg-zinc-700 px-8 py-3 font-semibold text-white hover:bg-zinc-600"
        >
          Cancel
        </button>
        <button
          onClick={handleReady}
          disabled={!ready}
          className="rounded-full bg-green-600 px-8 py-3 font-semibold text-white hover:bg-green-500 disabled:opacity-50"
        >
          Ready
        </button>
      </div>
    </div>
  )
}

function MicIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
    </svg>
  )
}

function MicOffIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3l18 18" />
      <path d="M9 9v3a3 3 0 0 0 4.6 2.53M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M19 10v2a7 7 0 0 1-9.8 6.41M5 10v2a7 7 0 0 0 1.2 3.94" />
      <path d="M12 19v3" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 8a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
      <path d="M21 16l-4-2.5v-3L21 8v8z" />
    </svg>
  )
}

function CameraOffIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3l18 18" />
      <path d="M10 6h5a2 2 0 0 1 2 2v3.5l4-2.5v8l-4-2.5V17a2 2 0 0 1-.34.27M16 16H6a2 2 0 0 1-2-2V8c0-.55.22-1.05.59-1.41" />
    </svg>
  )
}
