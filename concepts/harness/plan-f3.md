# Plan f3: coordinates for the build

The agreed room (hill rounds 3 and 4): the model asks; the harness remembers (back), checks (left, by you) and
acts (right, by your machine); up the right corner, down the left. Drawn in `plan-f3.svg` / `plan-f3.png`. Changed from f2: the subagent's room moved to the middle of the front, and
it nests.
Room units; x right, z toward the camera, y up. Walls 6.1 tall; the wide shot stands at about (8.9, 26, 30.6).

| Thing | x | z | Note |
| --- | --- | --- | --- |
| Tray | −4.6..4.2 | −4.0..−2.8 | top at y 0.5; ruler 0..1M along the front edge; end stop at x 4.2 |
| Lip | −4.6..4.2 | −2.72..−2.5 | carries words, your prompt and refusals from the left to the open end |
| Record channel | writer..4.2 | tray's back edge | the writer rides the open end on the back edge; the record runs in a channel to the end, then out |
| Press ram housing | 4.28..5.0 | −4.0..−2.8 | the end stop is the ram |
| Slot to your disk (back wall) | 4.7..5.5 | in the wall | y 1.2..1.5; the record goes in here |
| Drawers (back wall) | −4.6..−1.6 | in the wall | stacked, y 1.3..5.1; tipped into the tray's start |
| Skill shelf (back wall) | 1.4..3.9 | in the wall | y 2.0; one card drops into the tray |
| Send tube | centre 6.4, r 0.6 | centre −5.3 | standing, floor to 7.0; a pneumatic tube. Its capsule rests in its foot, rides a feeder south out of its door and round to a socket in the press housing's east face (dock at x 5.44, z −3.4) to be loaded, and comes back to go up |
| Reply chute | −7.2..−6.45 | −6.0..−4.95 | on the left wall, foot sliding to the pad |
| Pad (lip's start) | −5.95..−4.6 | −3.3..−2.5 | |
| Your screen (window, left wall) | in the wall | −2.5..−0.3 | wide, facing the gate; y 1.4..3.2 |
| Hook port (left wall) | in the wall | 0.6 | just forward of the window |
| Gate | −5.95..−4.45 | −2.1..−1.1 | an arch facing you, two slabs deep; the cart drives in from the east between the slabs and stops under the bell; refusals leave by the back onto the pad. Lamps across its face, beacon on top, mode dial and rule rack on the west leg, hooks socket on the west side |
| Cart rail | −5.2 (inside the gate)..5.45 at z −1.6 | then south along x 5.45, then west along z 5.39 into the subagent's doorway | both ways; the cart is the turn marker |
| Benches (right wall) | 5.95..6.6 | files −2.2..−1.2; shell −0.2..0.8; MCP 1.8..2.8 | boards on the front; a slot on top on the rail's side; each wire rises from the top and arcs into a port high in the wall (y 1.05) |
| Ledge (outside the right wall) | 7.62..8.92 | −3.0..3.6 | a step down. Pedestals at x 8.1..8.76 in line with their benches, each plugged on its wall side by a short low lead from the wall (y 0.2): your files and their checkpoints; your shell in its fence (7.86..8.86, −0.25..0.92), its lead through a grommet; an MCP server |
| Subagent's room (layer 1) | −2.4..2.55 | 2.75..5.65 | open to the front; its doorway is the right wall's front corner (z 5.24..5.56), where the rail comes in. Inside, the same layout by parts of its width and depth (layout.ts `CHILD`, `DOOR`) |
| Layer 2, inside it | −0.75..0.95 | 4.15..5.5 | the same room again |
| Layer 3, inside that | −0.18..0.4 | 4.82..5.38 | no room inside: its rail stops at a red buffer, because the last layer has no subagent tool |

## Changed while building (slice 2)

- The subagent's doorway moved from the middle of its right wall to its front corner, so a small room's benches can
  stand along its right wall like the big room's, and every room's rail turns west on the same line: the doors of all
  three layers line up.
- The rail's south leg moved in to x 5.45 and the benches to 5.95..6.6, to leave room for each bench's wire to arc
  softly into the wall instead of a straight stub.
- The send tube's capsule docks at a socket on the press housing's east face: that's where it is loaded with the copy.

## Open questions

1. The record channel runs along the tray's back edge so that the drawers' and the shelf's drops land in the tray
   without crossing it; confirm the writer can ride that edge as the open end moves.
2. The subagent's own small gate and benches stay in the drawing (legibility); in fact its tool calls run on the
   same machine as everyone's.
3. The shell's fence is round the shell on the ledge (the OS sandbox is outside the harness), not round the bench.

## Slice 3: the motion and the cameras

One script, `src/lib/journey/tracks/room/turns.ts`, says when everything happens: each turn's copy going up, each
reply tile coming down, each call's card, the gate's verdicts, the cart's moves, each bench's run and each result tipped
in. The tray (`tray.ts`), the motion (`play.ts`), the cameras (`shots.ts`), the sound (`sound/room.ts`) and your
screen all read it, so they can't drift apart; `tray.spec.ts` checks that every card's work ends before its stop, that
no refused call reaches a bench, and that the rooms nest.

- Card 1: you type the prompt; it comes out of your screen, round the front of the gate and along the lip.
- Card 2: one slow turn (Read on the files bench), one quicker (Bash on the shell bench), then a reply with no call.
- Card 3: you answer "yes, fix it"; the copy is made (a ripple runs along the tray and each drawer lights as its part
  passes); the model asks for the debugging skill: the call card goes up to the shelf and the skill's copy comes down
  onto the cart in three tiles.
- Card 4: three calls: allowed; asked (the bell rings, your screen asks, you say yes); refused (the card turns red,
  is thrown back onto the pad as a red tile, and goes in after the results, in call order).
- Card 5: two turns sped up until the tray is full; the press; the files touched last brought back from your files.
- Card 6: the brief goes through the subagent's door; the camera follows it in, room by room, to the last one, whose
  rail ends at a red buffer; each room runs its own loop; the reports come back out, and the main cart brings the
  last one home.

Changed while building:
- The frosted cover now shows what was in the last request sent, not "everything but the newest tile".
- Your prompt joins the lip past the gate (the lip's start is hidden behind the gate from every camera).
- The carts stop short of the subagent's doors, which are a small room's doors and too narrow for them.
- The capsule comes back down empty after each send: the model kept nothing.

Not yet: the mode dial and the auto-mode reviewer in card 4; the card words and narration for the new room.
