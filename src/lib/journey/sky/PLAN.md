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
