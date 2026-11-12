# Floor plan f1: the inside of the harness

Drawn in `plan-f1.svg` / `plan-f1.png` (a plan from above, and a front section). This page says why each thing is
where it is. Claude Code's room; the other harnesses change parts, not places.

## The idea in one sentence

**The floor reads left to right, like a line of text; the model's round trip is the carriage return.** The tray reads
left to right. The reply lands at the left and slides right. The tool call goes right along the front, through the
gate, to the ports on the right wall, and its result comes back onto the tray's right end. Then the request goes up
on the right, the reply comes down on the left, and the next line starts. Nothing on the floor ever flows right to
left.

And **each wall means one thing**, so a newcomer can place anything new without a label:

| Surface | Means | What is in it |
| --- | --- | --- |
| Left wall | You | your screen (a window), your hooks (a port) |
| Right wall | Your machine's programs | your files, your shell, MCP servers (three ports) |
| Back wall | Where the parts come from, and where everything is kept | the four drawers, the skill shelf, the slot to your disk |
| Ceiling | The model, far away | the send hatch and the reply chute's top |
| Floor | The harness itself | the tray, the gate, the rail, the subagent's room |

Nothing from outside stands inside. The subagent stands inside, because it is the harness.

## The path of one turn, and why each station is where it is

**0. The tray (hero), at the back, under its drawers.** `x −4.6..4.2, z −4.0..−2.8`. The parts of the request come out
of the back wall, so the tray's start sits right under the drawers: packing is a short tip, not a journey, and card 3
("packed fresh") frames drawers, shelf and tray's start in one close shot. The tray is the longest, brightest thing in
the room (8.8 of 14.4); it reads left to right like the header gauge, with a ruler on its back edge (0 to 1,000,000)
and a brass end stop at the right. Turn one fills about 2% of it: the tray starts nearly empty, which is the honest
picture. The **lip** runs along its front: every new tile arrives on the lip and slides to the open end. The **frosted
cover** lies over the part unchanged since last turn.

**1. The drawers, in the back wall over the tray's start.** Stacked as on the cabinet's front: Instructions,
Environment, Tools, Conversation. They are *where things come from*; the tray is *the order they are read in*, so
the drawers keep the cabinet's order and open in the tray's order (Tools first, then Instructions, then
Environment). The section labels each drawer with its reading rank so this small surprise is explained where it
happens.

**2. The skill shelf, in the back wall right of the drawers.** Closed cards (name and one line) are in the context
from the start; when one is invoked its body enters the conversation, so the unfolded card drops into the tray's open
end, not its start.

**3. Send ↑, over the tray's right end.** The hatch is in the ceiling and the capsule comes *down* to the tray, takes a
copy of the whole tray, and goes up. Three reasons: it makes "a copy" literal (the capsule hovers over what it
copies); it keeps the floor at the tray's end free for the end stop, the writer and the arriving results; and it puts
"up" on the right, over the tray, where the frontal view wants it. The tray stays; the model keeps nothing.

**4. Reply ↓, down the left wall, onto the lip's start.** The chute hugs the left wall by the tray's left end and lands
tiles on a small pad that is the lip's start. From there the model's words slide right to the open end; the
**amber card** (a tool call) also puts its tile on the lip, and the card itself goes forward to the gate.

**5. Your screen, a window in the left wall beside the chute.** A short twin track joins the pad and the window: the
model's words go out to you; your prompt comes in as a blue tile and slides along the lip like anything else from the
left. Your prompt is the last tile of the prefix on turn one, so "from the left, to the open end" is exactly right.

**6. The gate, on the left, just in front of your screen.** Every tool call passes here before any port. It stands by
the screen on purpose: when the gate asks, the bell's cable to your window is one short cable, and card 4 ("asking is
not doing") can frame the gate, the bell, your screen and the chute foot in one shot. On the gate: three lamps, the
rule rack (allow / ask / deny; deny always wins), the mode dial, the bell, and a small periscope (auto mode: a second
model judges, and that model is upstairs too). Your hooks are scripts on your machine, so they plug in through the
left wall, the "you" wall, right beside the gate. The card enters from the back and leaves to the front: through the
gate means through.

**A refusal** turns the card red and sends it back up a second slide to the lip's start, where it enters the tray as a
red tile. It never reaches a port. It comes from the left, with the things that come from you, because a refusal is
your "no" (your rules, or your answer to the bell).

**7. The rail, along the front and up the right wall.** An allowed card rides from the gate to its port; the result
rides back to the open end. One path, no doubling back: east along the front, north along the right wall past the
three benches, into the lip's right end.

**8. The ports, on the right wall: files, shell, MCP.** Three benches on the floor against the wall, each with a short
cable into a brass port in the wall; the thing reached stands outside (your files, your shell, MCP servers as separate
programs). Three benches because one reply can hold several calls that run side by side. The **sandbox fence** is a
glass U round the shell's bench and the small block inside it (everything the shell starts); the hooks and the MCP
bench stand outside the fence, as the docs say. Files are nearest the tray because most calls are reads.

**9. Write down, at the tray's open end and the back-right corner.** A small writer head sits on the tray's back
edge at the open end, where every new tile arrives, so "every tile is copied" is one head in one place. Its tape runs
back to a desk in the corner that holds the record (reel) and the checkpoints (a stack of file copies, taken before
each prompt through a cable from the files bench), and the desk's slot goes out through the back wall to your disk.
One slot, because both live in the same place on your disk. The transcript and the press are different things: the
record keeps everything; the tray gets the summary.

**10. The press is the end stop.** When the tray reaches its limit, the end stop pushes in like a ram and squeezes the
conversation into one orange block against the prefix, which does not move; then it goes back to its place and a few
recently touched files are read in again through the files bench. No gantry over the hero, and the cause (the limit
was reached) and the effect (the squeeze) are the same object.

**11. The subagent's room, front right, inside the room.** The same room in miniature with its own small tray, its own
up and down and its own small gate, with a door onto the rail: a brief goes in as an amber card off the rail, and only
its summary comes out, riding the rail to the open end like any result. It stands at the front right because that is
the free, visible floor nearest the ports, and because it is the one station that the wide shot should show *after*
the loop is understood.

**The turn marker** rests on the lip's start and hops: tray, up, down, pad, gate, bench, open end, round again. It
stops at the pad when a reply arrives without an amber card.

## The six cards

1. **Bigger on the inside.** The drop through the roof lands on the wide shot from the front. The tray is the first
   thing read (longest, brightest, centre back); the four walls each hold their one kind of thing; the loop is a
   circuit round the floor.
2. **Round and round.** The camera follows the marker round the perimeter: tray's end (capsule up), left corner (tiles
   down, words to the screen), gate, a bench on the right wall, back to the open end. Two quick turns grow the tray;
   then a reply with no amber card stops the marker at the pad.
3. **Packed fresh, every turn.** Close on the back-left quarter: drawers, shelf, tray's start, all within three units
   of each other. The frosted cover over the prefix; one skill card drops from the shelf.
4. **Asking is not doing.** Close on the gate from the front-right (today's GATE shot), with your screen and the chute
   foot in the frame behind it. One card allowed (green lamp, rides the rail), one asks (bell, cable to the screen),
   one refused (red, back up the slide). The dial turns; the same card goes through alone. A hook plugs in on the
   left post and changes a card.
5. **Everything is written down.** Close on the back-right corner: writer, tape, desk, slot; the checkpoint cable
   from the files bench. Then the end stop pushes in and the conversation becomes one block; the desk's reel keeps
   turning.
6. **A loop inside the loop.** Close on the front-right room: a brief goes in by the door; the small loop runs; a
   summary comes out onto the rail and into the tray.

## The Conversation drawer

Inside the room the tray already *is* the conversation and your prompt arrives through your screen, so the fourth
drawer had no job. Resolution: **it is the drawer the record refills.** On a fresh start it is empty. On `--continue`,
`--resume`, `/branch` or a rewind of the conversation, the transcript on your disk is read back into it, and it tips
its tiles onto the lip's start like the other three. This is true to how Claude Code works (the session is rebuilt
from its JSONL file), it gives the drawer a real, visible state (empty or full), and it ties the back wall together:
the parts come from the drawers at the left, everything is kept at the right, and a dashed line outside the wall
joins the disk to the fourth drawer. The main road's four drawers keep their names and order.

The alternative, renaming the main road's drawer, is not needed: the cabinet's front says what a request is made of
(instructions, environment, tools, conversation), and that stays true.

## Collisions and cables

Every path was placed so that none crosses another on the floor:

- pad → gate (card, south) and gate → pad (refusal, north) are parallel, 0.2 apart;
- pad ↔ screen is one twin track along the wall, north of the gate's cables;
- the bell cable leaves the gate's west post north-west, the hook cable south-west; both end in wall fittings;
- the rail runs along the front and the right wall with nothing on it but the benches' hand-offs;
- the checkpoint cable runs along the right wall between the files bench and the desk, behind the rail's end;
- the writer's tape runs behind the end stop's ram housing, 0.3 clear;
- the drawers' slides and the skill's slide enter the tray from behind; the capsule enters from above, 1.4 above the
  lip; the only crossing in the room is in the air.

Every cable ends in a fitting: brass sockets on the gate and benches, rings in the walls, the slot in the back wall.

## What changed from plan-r1, and why

- **Ports moved from the front edge to the right wall.** The room has no front wall; things "outside the front edge"
  would stand between the room and the reader, in the card's third, and would not be reached *through a wall*.
  On the right wall they are where the floor's reading order ends, and the results' way back is short.
- **The send tube is a hatch in the ceiling, not a column on the floor.** The back-right corner in r1 held the tube,
  the tray's end, the end stop and the records all at once. Taking the capsule from above frees the corner and makes
  the copy literal.
- **The gate moved beside your screen.** In r1 the asking line crossed the room. Here it is one short cable, and the
  left side is the whole "you" cluster: words out, prompt in, bell, hooks.
- **Hooks moved from the front edge to the left wall**: they are yours, and they must come through a wall.
- **One writer at the open end** instead of "a copy of every tile" drawn as a long line to the back wall; and the
  checkpoints get a real source (a cable from the files bench) and a real destination (the same slot).
- **The press is the end stop**, not a separate machine parked beside it.
- **Three benches** instead of three ports in a row: several calls from one reply can run side by side, and a bench
  is where a card is slotted and a jade tile comes out.
- **The subagent is a small room on the floor** with a door onto the rail, not "the last port".
- **The walls got meanings**, and the floor got one direction.
- Kept from r1, because it was right: the tray under the drawers reading left to right with the lip along its front;
  the chute at the left and the tube at the right; your screen as a window in the left wall; the frosted cover; the
  refusal going straight back to the lip with nothing run.

## Coordinates for the build (room units; x right, z toward the camera)

| Thing | x | z | Note |
| --- | --- | --- | --- |
| Tray | −4.6..4.2 | −4.0..−2.8 | end stop at x 4.2; lip at z −2.72..−2.5 |
| Drawers (back wall) | −4.6..−1.6 | in the wall | four, y 1.3..5.1 |
| Skill shelf (back wall) | 1.6..4.2 | in the wall | y 2.0 |
| Send hatch | centre 3.4 | centre −3.4 | r 0.56, mouth hangs 1.4 above the floor |
| Press ram housing | 4.28..5.0 | −4.0..−2.8 | the end stop's back |
| Writer | 3.45..4.15 | −4.36..−4.03 | on the tray's back edge |
| Desk (write down) | 5.2..6.45 | −5.8..−4.4 | slot in the back wall at x 5.45..6.25 |
| Reply chute | −7.2..−6.45 | −3.85..−3.05 | on the left wall |
| Pad (lip's start) | −5.95..−4.6 | −3.3..−2.5 | turn marker rests here |
| Your screen (window, left wall) | in the wall | −2.2..−0.6 | y 1.4..3.0 |
| Hook port (left wall) | in the wall | 2.55 | |
| Gate | −5.65..−3.95 | 1.0..1.85 | passage x −5.25..−4.35, cards enter from the back |
| Rail | −4.8 → 5.4 | 2.6, then north to −2.6 | corner radius 0.4 |
| Benches (right wall) | 6.2..6.85 | files −2.2..−1.2; shell −0.5..0.5; MCP 1.2..2.2 | ports at x 7.35 |
| Sandbox fence | 5.85..7.2 | −1.0..1.0 | door on the west side |
| Subagent's room | 0.8..4.4 | 3.6..5.7 | open to the front; door in its back wall at x 2.3..2.9 |

## Open questions

1. **The right wall is seen at a grazing angle** (camera 16° to the right): the port rings are edge-on, so the
   benches on the floor and the cables through the wall carry the reading. If that is too thin in the wide shot, the
   wide shot's azimuth can come in to about 8°, or the three ports can move to the back wall's right third (between the
   shelf and the desk), which keeps the reading order.
2. **The capsule from the ceiling** versus a standing tube: the main road's Send should echo whichever the room uses.
3. **The subagent's own small gate.** Its tool calls obey the same rules and run at the same ports; the plan gives it
   a miniature gate for legibility and one door onto the rail. The honest alternative (its cards walk to the big gate)
   makes a long path across the floor.
4. **The refusal enters from the left.** The design page says "results from the right"; a refusal is a tool result
   to the model, but it is made by the gate, not a port, and it is your "no". Left reads better; confirm.
5. **Provider-side tools** (web search, fetch, code execution) run upstairs, not at a port. Not in the six cards; r1
   mentioned them in the sky. A note in the section, or nothing?
6. **The classifier periscope.** It is a second model call, so it really goes up. A small tube from the gate to the
   ceiling would be more honest than a window on the post; drawn as a periscope for now.
7. **The desk's two outputs through one slot** (record and checkpoints to `~/.claude`): fine, or should checkpoints be
   drawn as copies of the files going back through the files port?
