# Desk to sky, built as the aqueduct: the plan to the end

The user chose the world (Desk to sky) and its architecture (the aqueduct), and on 2026-11-24 said: keep going until
the whole thing is complete, without stopping for approvals; my quality standard is known (the brain's). The one step
that still needs asking: merging `world` into `main` and pushing, which replaces the live site.

Drawings to build from live in the main checkout, `/Users/neo/repos/Journey/concepts/aqueduct/` (untracked):
the four whole-world views (establishing, plan, section, reader), `tower/`, `door/`, and one folder per district as it
comes. Every district is drawn first (four matching views, gpt-image via `scripts/imagine.mjs`, run from the main
checkout where `.env.local` lives), then built, then checked against its drawings in the lab (`/lab/world`, dev server
"world" on port 5271) from matching cameras.

The rules every part obeys (see memory journey-world-feedback): it makes complete sense; simple, not busy; each place
its own colour, material, light and outline, the colours meaning something (yours warm, the provider's jewel enamels,
other companies' their own); nothing floating, every part seated; the brain is fed from below.

## Status

Done (branch `world`):
- Masterplan (`masterplan.ts`), palette, blocking of every place, the lab with the four views.
- The tower and the stem-fed brain (`tower.ts`, `Brain('stem')`).
- The gatehouse and the hall (`gatehouse.ts`, `hall.ts`), today's tokenizer kept, a new detokenizer.
- Lanes: one centre line, two sides; sealed capsules outside the provider, tokens inside.
- The aqueduct, its masts and the platform's arcades (`aqueduct.ts`), with a height haze the piers fade into.
- The desk (`desk.ts`): zones, the harness, the easel and page, skills, local MCP, controls, the sandbox with its
  gates and chute, the archive, the five finishing stations, posts.
- The foundry and its rail (`foundry.ts`), the proving ground (`proving.ts`), the remote towers and cables
  (`remote.ts`).

## The story moving in (log)

- T 0 to 8, done (see world.ts, sky/scenery.ts, sky/capsule.ts): the site stands `Scenery` (all places, the hall
  without its own tokenizer) and places the story's own props by `placeOnDesk` and `placeModel`. The harness prop is
  restyled (butter, barrel roof, brass) and carried at 1.3 by a holder. The page rolls up into a glass `Capsule` behind
  the harness's roof, which locks, fills with ciphertext, rides the left lane (resting under the last mast at 4.648),
  is decrypted under the gatehouse's five labelled tumblers (5.04 to 5.62) and opened at the template. The tokenizer
  is today's, placed in its own coordinates by the TOKENIZER matrix (on the request lane, front to the lanes' middle);
  its shots are composed in those coordinates and turned with `turned()`. The token path runs on through the hall's end
  wall into the tower, steps in to the pedestal's lane, climbs the shaft (tokens turn to face the slot) and ends in
  the brainstem's seat. The hall is open to the sky (the vault hid the tokenizer from the long lens). Three masts, none
  in the last stretch before the door. Lanes spread to ±1.1 through the hall (HALL_LANE).
- T 19 on, done: the reply comes home in a pearl `Capsule('reply')` down the right lane and drops its text through
  the harness's roof hatch. The gates and the workshop keep their own coordinates and stand on the desk's right wing,
  a fifth of their size, by layout.ts' `TOOLS` frame and `low()`; the cables (cables.ts) lie on the desk. The chapter
  islands stand on piers in a rising arc left of the desk at 0.55 (back.ts `ISLES`, `relW`); the finishing steps on
  the desk's front right at 0.33. The finale's lap follows the new routes (finale.ts `Route`). The map, the MCP trip,
  the ways into the side trips and the sound's places point at the new world. The old tunnel, gateway, islands and
  pinwheel anchors are gone.
- Verified (2026-11-25): unit tests pass (pointer.spec needs the project config, the rest the long-timeout one);
  collision scans over 1.5-8, 18.9-26.2 and 29.5-32.4 are clean but for mechanisms that always touched (padlock
  shackles, the press's ram, cables in fittings when the harness squashes, the slug inside its pipe, the capsule's
  hinge) and tokens inside the glass pedestal, which the scan counts as inside the open chrome cap; the harness and
  MCP trips and the sandbox's way in work; the phone frames every beat checked; every name the narration shows exists.
  Geometry is ~98 MB against the phone test's 100 (Batch keeps indexes; rbox defaults to 2 segments): little room,
  so welding the batches' non-indexed parts (mergeVertices) is the next lever if anything is added.
- The lab is prerendered as an empty shell at /lab/world so the static build passes; it ships unlinked.
- e2e on the GPU against a served build: all 27 pass (the arrow-key test failed once, a flake).
- Left: the user's look, and their word before merging `world` into `main` and pushing.

## Districts still to build

1. The aqueduct, its masts and the provider's arches: fair round arches on piers that fade into haze, the deck with
   two lane troughs (dark belt, brass kerbs), lamps along it, the relay masts as real routers (red and white, beacons,
   dishes), the platform's arcades. The internet's story: sealed capsules, hops at the masts.
2. The desk: honey wood, the laptop and the harness wired into it, the permission gate, the hands (shell, files) with
   room for the workshop and its sandbox, the local MCP gadgets, the archive drawer (transcripts, memory), the posts.
   It must host today's story beats on the desk: the request being packed, the gates, the workshop, compaction and
   memory.
3. The foundry and its rail; the proving ground and observatory; the remote MCP towers and their cables.
4. The sky: a few soft clouds far below, the light, the haze the piers fade into.

## Then the story moves in

Today's story (see `tmp/world-code-map.md` in the main checkout for what depends on positions) is placed at absolute
coordinates. Move it chapter by chapter onto the new places, each verified with screenshots, the narration's sync and
the collision scan, committing on `world` as each lands:
- the desk (T 0 to 3.7), the wire (4) onto the aqueduct, the door (5) into the gatehouse, the tokenizer (6 to 6.9) into
  the hall, the lift and the model (7 to 8) up the tower's shaft to the brain;
- the cluster (8 to 14), the transformer (14 to 15) and decoding (15 to 19) inside the tower's floors;
- the way home (19) down the reply lane, the gates (20) and the workshop (21 to 25) on the desk;
- the loop's chapter islands (26 to 30) and the finale and whole-world view (31 to 32.3);
- the side trips' ways in, the maps (LoopMap's camera and route), the sound's places, the trip thumbnails.

## Then verify, and ask

Type checks, lint, unit tests (the brain's need a long hook timeout under load), e2e on the GPU against a served build,
collision scans, narration sync, phone. Then ask before merging into `main` and pushing.

## Polish, night of 2026-11-25 (log)

Neo's notes: geometry standing in geometry; the reply's way home from the brain unseen; a crowded landing; every place
below the brain's craft. What was done, round by round:

- **Landing.** The whole world from out in the sky, desk to brain, title in open sky beside it; the dolly down to the
  laptop reads. Two story props from the back half were waiting visible in the haze under the desk: placed properly.
- **The way home (19.0 to 19.1, seven seconds).** Out of the brainstem's seat, down the lit reply column in the shaft,
  out of the tower's foot, along the hall seen from high over the door, through the Encrypt press (an open portal over
  the reply's lane: the hall's duplicate detokenizer went, since token IDs never leave the data center), out of the
  door as a string of small pearl capsules, down the aqueduct past the readers (which flare), each opening behind the
  harness and its text flying in at the hatch. Sounds for the pour, each seal and each landing. sky/stream.ts.
- **Rig.** A shot can follow a moving thing (`follow`), so the camera keeps it in place between shots. The capsule's
  ride across the aqueduct is one following shot, always on the side away from the mast it passes.
- **Crafted again.** The crown (thin gold and brass blades leaning out, banded, in a stepped collar); the relay masts
  (white pylons, red bands near the top, three dishes and a whip; readers are small lamps over each lane on a slim
  beam); the deck's start (capped, rollers, a plate); the desk's control console and the local MCP servers.
- **Interference.** scripts/overlap.mjs (things standing in each other at a moment) and scripts/camera.mjs (anything
  between the camera and its subject). Fixed: the ten turns' chart hanging in the air before its chapter, the evil.sh
  pole in the green pipe, the door's tumblers in its arch, the capsule dipping into the belt over the deck's crest, the
  camera swinging through the gatehouse's tower, the harness squashing through its own cables.
- **Budget.** Tiles and lamps share their shapes: 97 to 91 MB of geometry on the phone.
- **Second batch.** The call card goes round the harness instead of through the aqueduct's start; the finale's Stream and
  Authorize signs stand clear; its token rides on top of tracks and pipes. The gatehouse's cupola is jade with a lit
  lantern. On a short screen (660 px or less) the words shrink a little so the longest card keeps its heading. The
  desk's cables lie on the desk; the local MCP servers plug into two new ports on the laptop's left side; the prompt's
  slip clears the lid. The archive is a filing cabinet (Transcripts, and Memory pulled out). The card for "The model has
  no hands" says the reply streams home in small pieces, as the scene and its conversation do. Verified: types, lint,
  unit, collision and overlap scans, 27 of 27 e2e on the GPU, phone geometry 91 MB.
- **Third batch.** The way home's camera: the hall seen from its right so the Encrypt press is in view; over the
  gatehouse, not through its tower; up the lane at the capsules so no mast crosses them. The reply's column runs deep
  blue and lit while the reply pours down it, so the slot shows both lanes. The map's Stream stop is on the way home.
  Moves between the islands rise over the one they leave. The whole-timeline collision scan went from 180 pairs to 163,
  none new; the line-of-sight scan leaves only the intended fly-over of the gatehouse and the dive into the brainstem.
  Verified again: types, lint, unit, 27 of 27 e2e on the GPU.

## The inside, crafted (2026-11-25, branch `inside`)

The user: the inside still looked the same, "blue, boring boxes", next to the brain. Every machine in the cluster and
the forward pass is rebuilt from one kit, kit/craft.ts, so they read as one family: cream bodies with chrome trim and
guards, glass cases in chrome frames with lit work inside, cobalt loaf hoods with chrome beads, fans that turn, fins,
louvres, coolant in clamps, an orange fabric cable into the back.

- **Pools.** Base, glass case, hood. Prefill: two fans, lit dies on gunmetal packages. Decode: one fan and fins, memory
  cells and a reading head that sweeps per token. The KV cache crosses through a port and sleeve, not a wall.
- **KV cache and Attention.** A chrome-rimmed cabinet with runners and roof fins; Attention a cream body under a cobalt
  hood with a lens turret that lights when it reads.
- **The node.** Cream chassis with chrome cap and handles, chips in chrome frames, a fan wall, coolant along its back.
  The weights are blocks of deep cobalt glass with their numbers lit, in chrome, with a lit seam.
- **Tray, router, lanes.** Prefill's hopper is hollow (the block goes down into it and comes up out of it); the router's
  copies are small pools; the lanes' Finished block is built round real tunnels; the sweep rolls on rails.
- **Detokenizer.** Base the belt runs into, a glass case with the vocabulary on a drum that turns a row per tile, a hood
  the tube rises from, and a screen in its base that spells the text out as it streams. Slips grow out of the throat.
- **Logits board.** Chrome bezel, cobalt crown. machine() and archBlock() (used across the journey) got chrome rims,
  guards, screws and louvres.
- **Clashes cleared.** Old: the lanes' heads in the Finished block, E through the Prefill press. New ones caught and
  fixed: status lamps where the fabric plugs in, NVLink through the chip frames, fans sunk in their housings, the new
  block crossing inside the hopper's walls, the sweep's wheels in its rails, a tube band in the camera's line. Intended
  and left: KV read pulses inside the read pipe, "Not here" posts seated in the copies' roofs.
- **Budget.** The kit was finer than anyone can see (a bezel was 190 KB). Coarser trim, plain boxes for tiny parts,
  shared rotors and slices: phone geometry 105 to 94.8 MB. Verified: types, lint, svelte-check, unit, collision, overlap
  and camera scans across the inside, 27 of 27 e2e on the GPU.

## Round two (2026-11-26, branch `round-two`)

The user's list after riding the whole tour, and what each became.

- **Map and trips.** From inside a side trip, picking another on the map only closed the map (a trip wouldn't start while
  one was open); now the open one ends and the next begins. The sandbox's glass, the memory cabinet and the laptop's
  screen open their trips when pressed, as the MCP server and harness did, with a tip by the pointer naming the trip.
  The tour (Play) plays the main road; side trips stay detours, reached from their cards, the map or their props.
- **Streaming capsules.** Their cipher texture was wrapped over the rounded ends and pinched into a pinwheel; it now
  goes round the middle only, between the brass bands.
- **The wheel.** It no longer stands ready-painted: blank until the long shots drop, then each kept bar sends its share
  across in its slice's colour and its slice sweeps open (a shader masks the face). 15.092 to 15.42 plays 3.6 s.
- **One score for every word.** Every word now has a column, coloured by score (deep blue, teal, amber), and the top
  floor dims to dusk as they rise.
- **Tokenizer hall.** Persian tile (persian.ts): a Kashan star-and-cross field in cobalt and turquoise over a lozenge
  dado, red and yellow friezes, a floor of larger stars; pointed windows cut through a sandstone core holding orosi
  stained glass with a sunburst head and a clear middle column; a rose window in the end wall; the gatehouse's windows
  in the same glass.
- **Seven things called memory** (concepts/memory-r1, chapters/memory.ts). A cabinet whose drawers step down onto a deep
  base; each holds a small scene that rises as it opens (transcript spools and disk; the slice under glass; claim
  ticket and calendar; cache blocks and an hourglass; laptop, folders and gear; a branch with its PR flag and server).
  The red drawer stays padlocked, the weights glowing through its porthole. Named or pressed, a drawer comes out and acts.
- **When the answer gets lost** (concepts/lost-r1, chapters/lost.ts). No harness box: the file on a lectern under a tube
  to the model; the edit comes down, its receipt goes up, the tube snaps, "Did it happen?"; a loupe on a two-joint arm
  looks; the same edit bounces off finding nothing to change; your console's four controls each act on a gadget of its
  own (plan, word stream, running process, a copy of the file). Pressable.
- Verified: types, lint, svelte-check, unit, collision and overlap scans on every changed scene, 27 of 27 e2e on the
  GPU, phone geometry 97.2 MB.

## More Persian (2026-11-26, branch `persian`)

The user picked three of nine suggestions; concepts in the main checkout's `concepts/persian-r1/` (door-2 with
door-1's hood, sandbox-2, ice-2). The rule kept: tile and jewel enamel on the provider's side, warm woodcraft on yours.
- The front door is an iwan: a pointed arch in a jade pishtaq faced in the hall's tile (one shared set of glazes,
  `glazed()` in persian.ts), a gold rim and mirrored frieze round the arch, a turquoise border whose repeat goes a
  whole number of times up each side and across, the star field set out from the arch's middle. Over the tumblers, a
  muqarnas of three tiers of gold-rimmed niches. The rose windows moved onto the towers. The camera's climb over the
  door is a little steeper (S at T 5.8).
- The sandbox's glass is held in walnut, gereh-chini lattice bands (coloured glass in the stars) along the top and
  foot of the back and sides; the front stays open. The trip's stage matches, leaving the slot and the proxy's door
  clear; Copilot's ghost sandbox has no lattice. `static/trips/sandbox.webp` remade.
- The cache is a yakhchal on the ten-turns island: a clay cone over a tiled drum, ice stacked in its porch, a tiled
  channel from its flank over the bars with a spout over each bar but the first. Ice drops into a bar while its green
  grows; switch the cache off and its door swings shut. A block by the door is half melted.
- Phone geometry 98.2 MB after trimming small detail (rivets, niches, rounded boxes at one segment).

## Carpets and mirror work (2026-11-26, branch `carpets`)

The user found the Persian pieces starting to look Islamic and religious rather than Persian, and asked for carpets and
mirror work instead. Concepts in concepts/carpets-r1 (door, hall, desk). Rule from here: Persian life, not faith:
carpets, aineh-kari, palace rooms, Qajar painted tile of flowers and birds, gardens; no domes, niche hoods, pishtaqs or
star tile on the buildings.

- sky/crafts.ts: hand-knotted rugs drawn to scale (medallion, quarter medallions, boteh, vine border; runners get a file
  of small medallions), fringes, aineh-kari mirror work (a normal map tilts every piece; the red of its rough-and-metal
  map gives each piece its own moment to glint, driven by `glint(time)`), painted panels and friezes of roses and
  nightingales, flower and tulip wall tile, a brick floor, a faceted mirror shaft.
- Your desk: a rug under the laptop and the harness (P.RUG), a glass of tea by your left hand. Cables crossing it lie on
  it and drape over its edge (P.deskFloor).
- The hall: flower tile and a rose frieze on the long walls, walnut sash windows, a brick floor laid with a medallion
  carpet and two runners, and in place of the domed end wall and its rose window, a wall of mirror work with a gold
  lintel and a wide sash window.
- The front door: a palace gate. A talar on two mirror-clad columns with a coffered mirror ceiling, the tumblers on a
  rail between the columns, the door's walnut leaves open under a sash window, painted panels over a brick footing,
  windcatchers at the corners, a jade roof terrace with a skylight. No iwan, no domes, no cupola.
- The ice house wears the rose frieze instead of star tile.
- Phone: textures 274 MB of 280, geometry 97.4 MB of 100. Rug faces are drawn at most 512 wide and 1536 tall.

## The harness, grown (2026-11-26, branch `harness`)

The user found the harness far too small for how important it is, when the room inside it (the side trip) is so much
bigger. Concepts in concepts/harness-r2. Also on this branch: the hall windows' borders no longer fight the tile, and
a quiet red gabbeh lies under the tokenizer in place of the medallion carpet (the user didn't like it).

- props/harness.ts: HW 4.5 by HD 3.6 (was 2.7 by 2.2), the same height, at HS 1.3, placed at (-0.55, 0, -3.0) so the
  gates keep room on its right. Front: the four drawers (DRAWER_X 1.0) and a window into the room, a picture baked by
  scripts/harness-window.mjs into static/harness/room.webp (re-run it when the room changes). Left flank: your screen,
  the MCP lead's port under it. Front: the laptop's port (PORT_KEYS_X/Y, low, clear of the lowest drawer). Right flank:
  PORT_CALLS (orange, to the gates' riser) and PORT_RESULTS (green, from the sandbox), so cables.ts no longer goes round
  the back.
- The loop's ends outside: the send tube at the back-left corner, the request's lane starting just behind its top (the
  capsule's cradle); the chute at the back-right, the reply's lane ending just behind its funnel and the reply's words
  dropping in (the stream's hatch). The lanes reach the deck on spurs (P.spur, built in aqueduct.ts); the deck now starts
  at z -9.6 on a pier of its own.
- The room inside had its tube back-right and chute back-left, the mirror of the lanes outside: mirrored since (see
  "The room's loop, mirrored" below).
- Moved: the easel to (-6.4, -1.4), the rug to the laptop only. Retuned: ASSEMBLY, the page's flight (3.78), the home
  shots onto the chute, 19.13 and 19.86, the call card (out by the calls port, across to the riser), the "From the
  provider" sign, the finale's harness sign, the MCP trip's drawer shots.
- Phone: geometry 97.9 MB of 100, textures 276 MB of 280.

## The room's loop, mirrored (2026-11-26)

The room inside the harness now agrees with the lanes outside: up on the left, down on the right.

- tracks/room/layout.ts: TUBE in the back-left corner (x -6.4), its door facing the tray (loop.ts REST_YAW). The capsule
  runs east along the back wall and round into READER, a block behind the tray's start under the drawers, where it is
  loaded (DOCK). The press keeps its housing at the tray's end, as the end stop. CHUTE in the back-right corner; its
  slide curves down the wall and round to the left onto PAD, now at the lip's right end past the press. The lip runs
  from pad to pad (LIP.x0, LIP.x1).
- The tray still fills left to right. The reply's tiles ride left from REPLY_LIP_X; your prompt and a refusal ride right
  (PROMPT_LIP_X, REFUSAL_LIP_X). GATE_PAD, behind the gate, is where each call's card pops up as the call comes down
  (same timing as before) and where a refused card is thrown back to (THROWN in play.ts): the words say "thrown back out
  onto the pad, and slides into the tray".
- The longer ride left made card 2's last reply land after its stop, so card 2's two quick turns run at pace 0.35 (was
  0.38). tray.spec.ts checks every card ends in time.
- Signs: "To the model" on the left wall in front of the tube, "From the model" high on the back wall beside the chute.
  Sound: the reader and the gate's pad (sound/room.ts). The subagent's small rooms mirrored the same way.
- Cameras: card 3 opens on the back-left corner (PACK: tube, reader, drawers) while the request is packed and the
  capsule comes back empty, then moves along to the shelf (BACK) before the skill is fetched. TOUR's tube and chute
  stops mirrored and retuned. Narration direction names poses only, so nothing there changed.

