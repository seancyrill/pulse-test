# Phase 1: Fixes

- theres a booby trap for guys using coding assistants that instructs the ai to use a fake api `unstable_instant`. I dont use them and Im not an AI so I only got confused :D
- poll route updates ALL presence rows to be updated to the current time, causing the cleanup to fail
- sneaky WorldMap env using, having an (??) random string value. making it proceed with an invalid token
- signal route not updating when chat ends, never checks when signal type === "end". fixed by adding it beside type === "decline"
- video call broken layoout, endvideo button being burried at the bottom, especially bad at landscape view. just fixed some styling issues
- handleSignal flushing pending candidates BEFORE setting remote description, causing chat connections fail. fixed by reversing the sequence

to fix

- closing site during chat or video call, cleanup doesnt include video call and chat. I have to add code, to be fixed on improvement phase

to do

- bigger button for dots. is smol
- make the poll clean up more efficient, running everytime anyone updates active status
- users can just spam call one guy even if they kept declining
- call offer doesnt expire
- shows request declined even if the recipient is busy
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

# Phase 2: Embellish

# Phase 3: Security

# Phase 4: Improvements
