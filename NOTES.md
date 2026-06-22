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

#### Every route trusts whatever **id** the client sends. Especially when id is displayed on url.

- This can be abused by:
  - **/api/signal** : anyone can send signals as that peer. accept connections, send **end** to kick someone, fake **offer/answer/ice** payloads into an active session
  - **/api/poll** : anyone can get the pending signals. can even steal the offer or answer it themselves.
  - **/api/leave** : anyone can boot any known id offline
  - **/api/join** : anyone can overwrite another ids location or presense
- These are fixed by replacing id with a server issued token, which is stored in memory, to verify identity.

#### Signal types **offer/answer/ice/end** are are accepted in signal route whoever sends it.

- This is fixed by having a relation check, these types of signal now only goes through if it came from the two parties who actually have an active connection.

## Phase 4: Improvements

- Some empty catch blocks are better not silently swallowed
  - Failing the poll tick: Added some notice for the user to let the know when disconnect and reconnect
  - HandleSignal json parsing: added trycatch block to guard the parse
- Added a bunch of new timeouts:
  - connect: after user B accepts the invite from user A, this timer limits it to prevent both user staring at "Connecting..." forever.
  - disconnection: when the chat/video disconnects for a certain amount of time, prevents killing a call on network blips.
  - video request: when A request for a video call, then B never chooses any option, A waits forever.
  - getUserMedia: not a timeout but it guards against asking for camera permission when video request is stale.

### plans

- bigger button for dots. is smol
- shows request declined even if the recipient is busy
- show peers who are busy
- users can just spam call one guy even if they kept declining
- on load, u have to scroll alot to see the dots
- chat not closing when failed to connect
- add some error messages on catch blocks
- retry call when failed
- maybe convert class contructors into contexts or functions instead, with proper type checkings
- should idle chat participant be kicked, idk if this would be better
- video cam settings on chat
- video crops it into portrait mode
- should be able to bring out chat during video call
- should clicking other dots during chat ask the user to leave chat and ask other stranger?
- location error message improvement, maybe try saying their location/gps is off

- make the poll clean up more efficient, running everytime anyone updates active status
