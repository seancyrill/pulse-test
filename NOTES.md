## Phase 1: Fixes

- theres a booby trap for guys using coding assistants that instructs the ai to use a fake api `unstable_instant`. I dont use them and Im not an AI so I only got confused :D
- poll route updates ALL presence rows to be updated to the current time, causing the cleanup to fail
- sneaky WorldMap env using, having an (??) random string value. making it proceed with an invalid token
- signal route not updating when chat ends, never checks when signal type === "end". fixed by adding it beside type === "decline"
- video call broken layoout, endvideo button being burried at the bottom, especially bad at landscape view. just fixed some styling issues
- handleSignal flushing pending candidates BEFORE setting remote description, causing chat connections fail. fixed by reversing the sequence
- When user A abandons chat/video (closing tab/browser), user B doesnt detect, it just sits there with the "Connected" message. Fixed by running a teardown() to end chat and video. Then send an end signal onConnectionState === failed || disconnected to enable them from taking chat/video after.
- Chat/Video request cancel doesnt inform user B, when user A cancels or timeouts, then B accepts. Thus B going into chat with no one. Fixes by adding a new option for handle PeerControl - video-cancel - tells user B that user A cancelled.

## Phase 2: Embellish

## Phase 3: Security

1. As an anonymous application, it is easy to keep making id and tokens by just opening multiple tabs. Making the app vulnerable to bots that can abuse users.

- Improved security by adding Cloudflare turnstile, cleanest way to block headless bot scripts, its invisible and analyzes browser telemetry to verify if the user is human.
- Another layer of protection by adding an IP based rate limiter.

2. Every route trusts whatever **id** the client sends. Especially when id is displayed on url.

- This can be abused by:
  - **/api/signal** : anyone can send signals as that peer. accept connections, send **end** to kick someone, fake **offer/answer/ice** payloads into an active session
  - **/api/poll** : anyone can get the pending signals. can even steal the offer or answer it themselves.
  - **/api/leave** : anyone can boot any known id offline
  - **/api/join** : anyone can overwrite another ids location or presense
- These are fixed by replacing id with a server issued token, which is stored in memory, to verify identity.

3. Signal types **offer/answer/ice/end** are are accepted in signal route whoever sends it.

- This is fixed by having a relation check, these types of signal now only goes through if it came from the two parties who actually have an active connection.

## Phase 4: Improvements

- Added video preview before going into a video call, also added toggles for mute and video.
- Some empty catch blocks are better not silently swallowed
  - Failing the poll tick: Added some notice for the user to let the know when disconnect and reconnect
  - HandleSignal json parsing: added trycatch block to guard the parse
- Added a bunch of new timeouts:
  - connect: after user B accepts the invite from user A, this timer limits it to prevent both user staring at "Connecting..." forever.
  - disconnection: when the chat/video disconnects for a certain amount of time, prevents killing a call on network blips.
  - video request: when A request for a video call, then B never chooses any option, A waits forever.
  - getUserMedia: not a timeout but it guards against asking for camera permission when video request is stale.
  - request decline: a progressive backoff everytime its declined. prevents invie spamming
- Users own pin was on their exact location, and only applies the offset on everyone else. I felt that on an anonymous app you would expect that other people see your exact location also, which feels bad on a supposed to be strangers app. I changed it so it would use the offset pin on both the user end and everywhere else. I also looked up and saw that most cities are around 8-24km in diameter, so I increased the offset radius into 2-5km, this widens the offset while keeping their pin inside their city most of the time.
- Added some missing types to make life easier.
- Moved number of online position to top left.

### plans

- video cam settings on chat
- video crops it into portrait mode
- should be able to bring out chat during video call
- location error message improvement, maybe try saying their location/gps is off
- preload map on entry gate so its ready when user clicks enter

- make the poll clean up more efficient, running everytime anyone updates active status
