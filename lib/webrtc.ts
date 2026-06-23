export type DescType = "offer" | "answer" | "ice"
export type PeerControl =
  | "video-request"
  | "video-acknowledge"
  | "video-accept"
  | "video-decline"
  | "video-cancel"
  | "video-end"

interface PeerCallbacks {
  onSignal: (type: DescType, payload: string) => void
  onChat: (text: string) => void
  onControl: (ctrl: PeerControl) => void
  onRemoteStream: (stream: MediaStream | null) => void
  onConnectionState: (state: RTCPeerConnectionState) => void
  onChannelOpen: () => void
}

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
}

export class PeerSession {
  private pc: RTCPeerConnection
  private dc: RTCDataChannel | null = null
  private readonly polite: boolean
  private makingOffer = false
  private ignoreOffer = false
  private localStream: MediaStream | null = null
  private closed = false
  private readonly cb: PeerCallbacks
  private pendingCandidates: RTCIceCandidateInit[] = []

  constructor(initiator: boolean, cb: PeerCallbacks) {
    this.cb = cb
    this.polite = !initiator
    this.pc = new RTCPeerConnection(ICE_CONFIG)

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.cb.onSignal("ice", JSON.stringify(candidate.toJSON()))
      }
    }

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true
        await this.pc.setLocalDescription()
        if (this.pc.localDescription) {
          this.cb.onSignal("offer", JSON.stringify(this.pc.localDescription))
        }
      } finally {
        this.makingOffer = false
      }
    }

    this.pc.ontrack = ({ streams }) => {
      this.cb.onRemoteStream(streams[0] ?? null)
    }

    this.pc.onconnectionstatechange = () => {
      this.cb.onConnectionState(this.pc.connectionState)
    }

    if (initiator) {
      this.dc = this.pc.createDataChannel("chat")
      this.wireDataChannel(this.dc)
    } else {
      this.pc.ondatachannel = (e) => {
        this.dc = e.channel
        this.wireDataChannel(this.dc)
      }
    }
  }

  private wireDataChannel(dc: RTCDataChannel) {
    dc.onopen = () => this.cb.onChannelOpen()
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string)
        if (msg.t === "msg" && typeof msg.text === "string") {
          this.cb.onChat(msg.text)
        } else if (msg.t === "ctrl" && typeof msg.ctrl === "string") {
          this.cb.onControl(msg.ctrl as PeerControl)
        }
      } catch {}
    }
  }

  async handleSignal(type: DescType, payload: string) {
    if (this.closed) return

    // IMPROVEMENT: guard the parse. `payload` is a string straight out of
    // the Signal table — nothing upstream guarantees it's valid JSON (a
    // malformed payload, intentional or not, used to throw a SyntaxError
    // into an unhandled promise rejection here and silently wedge the
    // connection with no visible error). Bail out loudly-but-safely on
    // bad input instead.
    //
    // Typed as the union of what `type` can actually mean, rather than
    // `unknown` + blind casts below — `type` already tells us which one
    // we're holding, so the cast is narrowing within a known shape, not
    // asserting into the dark.
    let data: RTCIceCandidateInit | RTCSessionDescriptionInit
    try {
      data = JSON.parse(payload) as
        | RTCIceCandidateInit
        | RTCSessionDescriptionInit
    } catch {
      console.error("[webrtc] received malformed signal payload, ignoring", {
        type,
      })
      return
    }

    if (type === "ice") {
      const candidate = data as RTCIceCandidateInit
      if (!this.pc.remoteDescription) {
        this.pendingCandidates.push(candidate)
        return
      }
      try {
        await this.pc.addIceCandidate(candidate)
      } catch (err) {
        console.error("[webrtc] addIceCandidate FAILED:", err)
      }
      return
    }

    const desc = data as RTCSessionDescriptionInit
    const offerCollision =
      desc.type === "offer" &&
      (this.makingOffer || this.pc.signalingState !== "stable")
    this.ignoreOffer = !this.polite && offerCollision
    if (this.ignoreOffer) return

    await this.pc.setRemoteDescription(desc)
    await this.flushPendingCandidates()
    if (desc.type === "offer") {
      await this.pc.setLocalDescription()
      if (this.pc.localDescription) {
        this.cb.onSignal("answer", JSON.stringify(this.pc.localDescription))
      }
    }
  }

  private async flushPendingCandidates() {
    if (this.pendingCandidates.length === 0) return
    const queued = this.pendingCandidates
    this.pendingCandidates = []
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate)
      } catch {}
    }
  }

  sendChat(text: string) {
    this.safeSend({ t: "msg", text })
  }

  sendControl(ctrl: PeerControl) {
    this.safeSend({ t: "ctrl", ctrl })
  }

  private safeSend(obj: unknown /* change later */) {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(obj))
    }
  }

  async startVideo(): Promise<MediaStream> {
    if (!this.localStream) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })
      this.attachStream(stream)
    }
    return this.localStream!
  }

  // Attach a stream that the caller already obtained (e.g. from a preview
  // screen) instead of requesting a fresh one. Important: this must be the
  // SAME stream the user previewed — re-requesting getUserMedia here would
  // silently swap in a different camera/mic grab, breaking the "what you
  // see in preview is what they get" guarantee.
  attachStream(stream: MediaStream) {
    if (this.localStream) return // already attached, don't double up
    this.localStream = stream
    for (const track of stream.getTracks()) {
      this.pc.addTrack(track, stream)
    }
  }

  stopVideo() {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop()
      for (const sender of this.pc.getSenders()) {
        if (sender.track) {
          try {
            this.pc.removeTrack(sender)
          } catch {}
        }
      }
      this.localStream = null
    }
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.stopVideo()
    if (this.dc) {
      try {
        this.dc.close()
      } catch {}
    }
    try {
      this.pc.close()
    } catch {}
  }
}
