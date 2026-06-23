"use client"

import { useEffect, useRef, useState } from "react"

function useStreamRef(stream: MediaStream | null) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream
    }
  }, [stream])

  return ref
}

export default function VideoPanel({
  localStream,
  remoteStream,
  onEnd,
}: {
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  onEnd: () => void
}) {
  const localRef = useStreamRef(localStream)
  const remoteRef = useStreamRef(remoteStream)

  const [muted, setMuted] = useState(() => {
    const audioTrack = localStream?.getAudioTracks()[0]
    return audioTrack ? !audioTrack.enabled : false
  })

  const [cameraOff, setCameraOff] = useState(() => {
    const videoTrack = localStream?.getVideoTracks()[0]
    return videoTrack ? !videoTrack.enabled : false
  })

  function toggleMute() {
    if (!localStream) return
    const next = !muted
    for (const track of localStream.getAudioTracks()) track.enabled = !next
    setMuted(next)
  }

  function toggleCamera() {
    if (!localStream) return
    const next = !cameraOff
    for (const track of localStream.getVideoTracks()) track.enabled = !next
    setCameraOff(next)
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black h-dvh w-screen overflow-hidden">
      <div className="relative flex-1 w-full max-w-2xl mx-auto bg-zinc-900">
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />

        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
            Waiting for stranger&apos;s video…
          </div>
        )}

        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className={`absolute bottom-4 right-4 h-40 w-28 rounded-lg border border-zinc-700 bg-zinc-800 object-cover z-10 ${
            cameraOff ? "invisible" : ""
          }`}
        />

        <div className="absolute bottom-4 left-0 right-0 z-10 flex justify-center gap-4">
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
