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
- Left: the e2e suite's arrow-key test (failed once, rerunning), a last look over every beat, then ask before merging.

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
