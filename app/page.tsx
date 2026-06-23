"use client"

import { join, leave, poll, sendSignal } from "@/lib/api"
import { POLL_INTERVAL_MS } from "@/lib/presence"
import { type PeerDot, type SignalMsg } from "@/lib/types"
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc"
import { useEffect, useRef, useState } from "react"
import ChatPanel, { type ChatMessage } from "./components/ChatPanel"
import ConnectionPrompt from "./components/ConnectionPrompt"
import EntryGate from "./components/EntryGate"
import VideoPanel from "./components/VideoPanel"
import VideoPreview from "./components/VideoPreview"
import WorldMap from "./components/WorldMap"

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string }

type VideoState = "none" | "previewing" | "requesting" | "incoming" | "active"

const REQUEST_TIMEOUT_MS = 30_000

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [peers, setPeers] = useState<PeerDot[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [connectionTrouble, _setConnectionTrouble] = useState(false)
  const connectionTroubleRef = useRef(connectionTrouble)
  const setConnectionTrouble = (v: boolean) => {
    connectionTroubleRef.current = v
    _setConnectionTrouble(v)
  }
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [myLocation, setMyLocation] = useState<{
    lat: number
    lng: number
  } | null>(null)

  const [conn, _setConn] = useState<Conn>({ kind: "idle" })
  const connRef = useRef<Conn>(conn)
  const setConn = (c: Conn) => {
    connRef.current = c
    _setConn(c)
  }

  const [video, _setVideo] = useState<VideoState>("none")
  const videoRef = useRef<VideoState>(video)
  const setVideo = (v: VideoState) => {
    videoRef.current = v
    _setVideo(v)
  }

  const peerRef = useRef<PeerSession | null>(null)
  const msgId = useRef(0)
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const DISCONNECT_GRACE_MS = 5_000

  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const CONNECT_TIMEOUT_MS = 20_000

  const videoRequestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const VIDEO_REQUEST_TIMEOUT_MS = 20_000
  // Whether WE started this video request (true) or are responding to one
  // (false). Decides what handleVideoReady does once preview finishes —
  // send video-request vs video-accept.
  const videoInitiator = useRef(false)

  function showNotice(text: string) {
    setNotice(text)
    window.setTimeout(() => setNotice(null), 3500)
  }

  function addMessage(mine: boolean, text: string) {
    setMessages((prev) => [...prev, { id: msgId.current++, mine, text }])
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current)
    if (disconnectTimer.current) clearTimeout(disconnectTimer.current)
    disconnectTimer.current = null
    if (connectTimer.current) clearTimeout(connectTimer.current)
    connectTimer.current = null
    if (videoRequestTimer.current) clearTimeout(videoRequestTimer.current)
    videoRequestTimer.current = null
    videoInitiator.current = false
    peerRef.current?.close()
    peerRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
    setVideo("none")
    setMessages([])
    setConn({ kind: "idle" })
    if (message) showNotice(message)
  }

  function startPeer(peerId: string, initiator: boolean) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void sendSignal(peerId, type, payload)
      },
      onChat: (text) => addMessage(false, text),
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (state === "connected") {
          if (disconnectTimer.current) {
            clearTimeout(disconnectTimer.current)
            disconnectTimer.current = null
          }
          return
        }
        if (state === "failed") {
          void sendSignal(peerId, "end")
          teardown("Connection failed (network).")
          return
        }
        if (state === "disconnected") {
          if (disconnectTimer.current) return // already waiting
          disconnectTimer.current = setTimeout(() => {
            disconnectTimer.current = null
            void sendSignal(peerId, "end")
            teardown("Stranger disconnected.")
          }, DISCONNECT_GRACE_MS)
        }
      },
      onChannelOpen: () => {
        if (connectTimer.current) {
          clearTimeout(connectTimer.current)
          connectTimer.current = null
        }
        setConn({ kind: "connected", peerId })
      },
    })
    peerRef.current = ps
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming")
        break
      case "video-acknowledge":
        // The other side accepted and is now previewing their camera —
        // give them a fresh window instead of racing our original timer
        // against however long they take to finish setup.
        if (videoRef.current === "requesting") {
          if (videoRequestTimer.current) clearTimeout(videoRequestTimer.current)
          videoRequestTimer.current = setTimeout(() => {
            videoRequestTimer.current = null
            ps?.sendControl("video-cancel")
            setVideo("none")
            showNotice("No response.")
          }, VIDEO_REQUEST_TIMEOUT_MS)
        }
        break
      case "video-accept":
        // By this point OUR stream is already attached (we attached it
        // the moment we hit Ready in our own preview, before sending
        // video-request) — nothing left to grab here.
        if (videoRequestTimer.current) {
          clearTimeout(videoRequestTimer.current)
          videoRequestTimer.current = null
        }
        if (videoRef.current === "requesting") {
          setVideo("active")
        }
        break
      case "video-decline":
        if (videoRequestTimer.current) {
          clearTimeout(videoRequestTimer.current)
          videoRequestTimer.current = null
        }
        if (videoRef.current === "requesting") {
          setVideo("none")
          showNotice("Video declined.")
        }
        break
      case "video-cancel":
        // The other side gave up waiting — could be while we're still on
        // the accept/decline prompt, or already previewing our own camera.
        if (
          videoRef.current === "incoming" ||
          videoRef.current === "previewing"
        ) {
          setVideo("none")
          showNotice("Video request expired.")
        }
        break
      case "video-end":
        teardownVideo()
        break
    }
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return
    setConn({ kind: "requesting", peerId })
    void sendSignal(peerId, "request")
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        void sendSignal(peerId, "end")
        teardown("No answer.")
      }
    }, REQUEST_TIMEOUT_MS)
  }

  function cancelRequest() {
    if (connRef.current.kind === "requesting") {
      void sendSignal(connRef.current.peerId, "end")
    }
    teardown()
  }

  function acceptIncoming() {
    if (connRef.current.kind !== "incoming") return
    const peerId = connRef.current.peerId
    startPeer(peerId, false)
    void sendSignal(peerId, "accept")
    setConn({ kind: "connecting", peerId })
    connectTimer.current = setTimeout(() => {
      connectTimer.current = null
      void sendSignal(peerId, "end")
      teardown("Couldn't establish connection (network).")
    }, CONNECT_TIMEOUT_MS)
  }

  function declineIncoming() {
    if (connRef.current.kind !== "incoming") return
    void sendSignal(connRef.current.peerId, "decline")
    setConn({ kind: "idle" })
  }

  function endConnection() {
    const c = connRef.current
    if (c.kind === "connecting" || c.kind === "connected") {
      void sendSignal(c.peerId, "end")
    }
    teardown()
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return
    videoInitiator.current = true
    setVideo("previewing")
    // No signal sent yet — the other side doesn't know about this until
    // we finish previewing and hit Ready (handleVideoReady).
  }

  function acceptIncomingVideo() {
    if (videoRef.current !== "incoming" || !peerRef.current) return
    videoInitiator.current = false
    peerRef.current.sendControl("video-acknowledge")
    setVideo("previewing")
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline")
    setVideo("none")
  }

  // Called by VideoPreview's onReady once the user has previewed their
  // camera/mic and tapped Ready. `stream` is the SAME MediaStream that's
  // been live during preview — we attach it directly rather than asking
  // for a new one, so what they previewed is exactly what gets sent.
  function handleVideoReady(stream: MediaStream) {
    const ps = peerRef.current
    if (!ps) {
      for (const track of stream.getTracks()) track.stop()
      setVideo("none")
      return
    }
    ps.attachStream(stream)
    setLocalStream(stream)

    if (videoInitiator.current) {
      ps.sendControl("video-request")
      setVideo("requesting")
      videoRequestTimer.current = setTimeout(() => {
        videoRequestTimer.current = null
        ps.sendControl("video-cancel")
        teardownVideo()
        showNotice("No response.")
      }, VIDEO_REQUEST_TIMEOUT_MS)
    } else {
      ps.sendControl("video-accept")
      setVideo("active")
    }
  }

  // Called by VideoPreview's onCancel — either side, while still in the
  // previewing step (i.e. before video-request/video-accept actually
  // went out). VideoPreview has already released its own camera/mic by
  // the time this fires.
  //
  // Only the RESPONDER needs to tell the peer anything here: they already
  // sent video-acknowledge when they hit Accept, so backing out now means
  // sending video-decline to undo that. The INITIATOR hasn't told the
  // peer anything yet at this point (video-request only goes out once
  // Ready is pressed, in handleVideoReady) — so there's nothing to
  // un-send, and sending video-decline anyway would be a stray signal
  // with no real request behind it.
  function cancelVideoPreview() {
    if (!videoInitiator.current) {
      peerRef.current?.sendControl("video-decline")
    }
    setVideo("none")
  }

  // Shared teardown for the local video pieces only — used when a video
  // call ends or fails without ending the underlying chat connection.
  function teardownVideo() {
    peerRef.current?.stopVideo()
    setLocalStream(null)
    setRemoteStream(null)
    setVideo("none")
  }

  function endVideo() {
    peerRef.current?.sendControl("video-end")
    teardownVideo()
  }

  function processSignal(sig: SignalMsg) {
    switch (sig.type) {
      case "request": {
        if (connRef.current.kind === "idle") {
          setConn({ kind: "incoming", peerId: sig.fromId })
        } else {
          void sendSignal(sig.fromId, "decline")
        }
        break
      }
      case "accept": {
        const c = connRef.current
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current)
          startPeer(sig.fromId, true)
          setConn({ kind: "connecting", peerId: sig.fromId })
          connectTimer.current = setTimeout(() => {
            connectTimer.current = null
            void sendSignal(sig.fromId, "end")
            teardown("Couldn't establish connection (network).")
          }, CONNECT_TIMEOUT_MS)
        }
        break
      }
      case "decline": {
        const c = connRef.current
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current)
          // payload carries the auto-decline reason ("busy" / "offline")
          // when the server declined on the target's behalf — see
          // sendDecline in /api/signal. No payload means a real decline.
          const message =
            sig.payload === "busy"
              ? "Stranger is busy."
              : sig.payload === "offline"
                ? "Stranger went offline."
                : "Request declined."
          teardown(message)
        }
        break
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current
        const peerId =
          c.kind === "connecting" || c.kind === "connected" ? c.peerId : null
        if (peerRef.current && peerId === sig.fromId) {
          void peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          )
        }
        break
      }
      case "end": {
        const c = connRef.current
        if (
          (c.kind === "incoming" ||
            c.kind === "connecting" ||
            c.kind === "connected") &&
          c.peerId === sig.fromId
        ) {
          if (c.kind === "incoming") setConn({ kind: "idle" })
          else teardown("Stranger disconnected.")
        }
        break
      }
    }
  }

  const processSignalRef = useRef(processSignal)
  useEffect(() => {
    processSignalRef.current = processSignal
  })

  useEffect(() => {
    if (phase !== "live" || !sessionId) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let consecutiveFailures = 0

    const FAILURE_NOTICE_THRESHOLD = 3

    const tick = async () => {
      try {
        const data = await poll()
        if (!active) return
        consecutiveFailures = 0
        if (connectionTroubleRef.current) {
          setConnectionTrouble(false)
          showNotice("Back online")
        }
        setPeers(data.peers)
        for (const s of data.signals) processSignalRef.current(s)
      } catch (err) {
        if (!active) return
        // any failure to reach our own backend (network blip, server error, expired, session) would inform the user.
        consecutiveFailures += 1

        if (consecutiveFailures >= FAILURE_NOTICE_THRESHOLD) {
          setConnectionTrouble(true)
        }
      }
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS)
    }
    tick()

    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [phase, sessionId])

  useEffect(() => {
    if (!sessionId || phase !== "live") return
    const onLeave = () => leave()
    window.addEventListener("pagehide", onLeave)
    window.addEventListener("beforeunload", onLeave)
    return () => {
      window.removeEventListener("pagehide", onLeave)
      window.removeEventListener("beforeunload", onLeave)
    }
  }, [sessionId, phase])

  async function handleReady(lat: number, lng: number, turnstileToken: string) {
    const {
      id,
      lat: offsetLat,
      lng: offsetLng,
    } = await join(lat, lng, turnstileToken)
    setMyLocation({ lat: offsetLat, lng: offsetLng })
    setSessionId(id)
    setPhase("live")
  }

  if (phase === "gate") {
    return <EntryGate onReady={handleReady} />
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected"

  return (
    <main className="fixed inset-0 overflow-hidden">
      <WorldMap
        peers={peers}
        me={myLocation}
        onPeerClick={requestConnection}
        canConnect={conn.kind === "idle"}
      />

      {connectionTrouble && (
        <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          Connection trouble — retrying…
        </div>
      )}

      {notice && (
        <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          {notice}
        </div>
      )}

      {conn.kind === "requesting" && (
        <div className="absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          <span>Requesting connection…</span>
          <button
            onClick={cancelRequest}
            className="rounded-full bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600"
          >
            Cancel
          </button>
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="A stranger wants to connect"
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}

      {inChat && (
        <ChatPanel
          messages={messages}
          connected={conn.kind === "connected"}
          videoBusy={video !== "none"}
          onSend={(text) => {
            peerRef.current?.sendChat(text)
            addMessage(true, text)
          }}
          onStartVideo={startVideoRequest}
          onEnd={endConnection}
        />
      )}

      {video === "requesting" && (
        <div className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          Waiting for stranger to accept video…
        </div>
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          title="Start video call?"
          subtitle="The stranger wants to turn on video."
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptIncomingVideo}
          onDecline={declineVideo}
        />
      )}

      {video === "previewing" && (
        <VideoPreview
          onReady={handleVideoReady}
          onCancel={cancelVideoPreview}
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          onEnd={endVideo}
        />
      )}
    </main>
  )
}
