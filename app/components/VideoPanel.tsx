"use client"
import { useEffect, useRef } from "react"

export default function VideoPanel({
  localStream,
  remoteStream,
  onEnd,
}: {
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  onEnd: () => void
}) {
  const localRef = useRef<HTMLVideoElement>(null)
  const remoteRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black h-dvh w-screen overflow-hidden">
      <div className="relative flex-1 w-full max-w-2xl mx-auto bg-zinc-900">
        {/* Remote (full screen) */}
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />

        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
            Waiting for stranger’s video…
          </div>
        )}

        {/* Local (picture-in-picture) */}
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-4 right-4 h-40 w-28 rounded-lg border border-zinc-700 bg-zinc-800 object-cover z-10"
        />
      </div>

      <div className="shrink-0 flex justify-center bg-zinc-950 p-4 w-full pb-safe">
        <button
          onClick={onEnd}
          className="rounded-full bg-red-500 px-8 py-3 font-semibold text-white hover:bg-red-400"
        >
          End video
        </button>
      </div>
    </div>
  )
}
