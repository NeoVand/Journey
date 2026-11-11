# Next phase: notes for whoever picks this up

Written 2026-11-10 at the user's request, before a reset into a new thread that will review the whole journey and push it
to "the world's best AI engineering demo". Everything below is the user's direction unless marked as a suggestion.

## The user's goals for the next phase

1. **A real harness running in the browser**, so people can see an agent loop act live, not only the illustrated one.
2. **More harnesses, modelled realistically.** Beyond Claude Code, Codex and Copilot: LangChain's deep agents and
   opencode. The harness selector should become richer, and each harness should have **its own guts**: the inside of
   the harness looks different per harness.
3. **Say clearly what runs where.** What is "the harness", and does everything happen inside it? It doesn't: there are
   programs outside it we never show. We show the tokenizer, but not the program the loop runs in, nor the
   **classifiers before the model** (and after it). The whole system, not only the loop, should be legible.
4. **Inside the harness must make sense at a glance.** Cute props are not enough: no artifacts that don't mean
   something. Think about what is really in there. In particular, **visualize the context as an object** (what is in
   it, in what order, how full it is).
5. **A context bar** somewhere on the page, like the minimap, showing what the context holds and how full it is.
6. **Minimap redesign.** The user doesn't like how it looks. It should blend into the picture: a little bigger but not
   in the way, no hard border, fading to transparent with a *spatial* fade (edges more transparent than the centre),
   as if seen through a gap in the clouds below. On hover it comes up clearly.
7. **The top toolbar should extend** (across the window, as one band), and **the row of progress dots goes**: the
   minimap already says where you are.
8. **The attention/worldline visualization** is innovative and should stay, but it reads as tacky and plasticky now.
   Clean it up: better colours, materials and arcs. Use image generation (style transfer from screenshots) and climb
   the hill until both the user and the assistant like it.
9. The whole thing should feel like one artwork: every part, and how the parts mix with each other.

## Image generation workflow (works now)

- Model: `gpt-image-2.6-sunburst` (precision, editing, references). `gpt-image-2.6-flare` is the fast one.
- Key: `OPENAI_API_KEY` in `.env.local` (git-ignored, next to `ELEVENLABS_API_KEY`; each on its own line).
- Script: `node scripts/imagine.mjs <out-prefix> <prompt.txt> [ref.png,ref.png]`. With references it calls
  `/v1/images/edits` (multiple `image[]`), else `/v1/images/generations`. Env: `SIZE` (1536x1024), `QUALITY` (medium;
  low/medium/high/xhigh/max), `N` (2), `COMPLEXITY` (low/medium/high). About 45 s and $0.07 per pair at medium.
- Always pass `concepts/poster-01/C-the-token-playground.png` (the agreed look) plus a screenshot of the current scene.
- The model renders text badly: keep concepts label-free and add words in the build.
- It also outputs SVG (generations only) and short GIFs (`output_format: "gif"`, `frame_count` 2-16) for motion ideas.

## Concepts so far

Prompts are next to each set in `prompts/`; references in `refs/`.

### Harness (`concepts/harness/`)
- `outside-r1-*`: a toy springs out of each drawer (rulebook, snow globe with a tiny desk-world, Swiss-army knife of
  tools with an MCP adapter, speech bubble beside a file marked "no code"). Delightful, but the user found this round
  cute rather than meaningful.
- `inside-r1-*`, `inside-r2-*`: a workshop where a suitcase rides a track past a packing table, pneumatic tube, ticker
  tape, turnstile with a robot bouncer, arms through a porthole, typewriter scroll. Rejected as "many artifacts that
  don't make sense".
- **`cutaway-r3-*` (strongest):** the cabinet cut open. The four drawers feed the bottom four layers of a glass
  **context column**; tool calls (amber) and results (green) pile up on it turn by turn; a brass ruler marks the
  window's limit; a tube carries the request up to the model and a ribbon of tiles brings the reply down; the loop's
  gate, tool arms and the archive (transcript on disk) sit beside it. This one makes sense at a glance and ties the
  outside to the inside.
- **`inside-r3-*`:** the same idea from inside: the context column in the centre, one conveyor round it (send a copy
  up, stream the reply down, check at a gate with your hook plugged in, run through ports in the wall to files,
  terminal and an MCP server outside), arms placing the new result layer on top, archive cabinet keeping copies.
- Suggestion: the layer order should match the real request (system and instructions, tools, environment,
  conversation), each layer's thickness proportional to tokens, and the same column could become the page-wide
  context bar (item 5) and the compaction scene's pile, so one object explains context everywhere.

### Transformer (`concepts/transformer/`)
- `worldlines-r1-*`: thin frosted-glass layer plates in deep navy, faint watercolour meaning-maps printed in the glass,
  fourteen bead tokens with hair-thin luminous worldlines climbing and converging into one gold region. Elegant; a
  strong target for the restyle.
- `attention-r1-*`: one glass plate, beads in a row, delicate arcs from the reading word back to earlier ones (two
  strong in gold, the rest cobalt hairlines), later beads dark because a token only looks back.

### Page interface (`concepts/ui/`)
- `page-r1-*`: full-width frosted toolbar, no dots; minimap as a borderless view feathering into cloud; a slim
  segmented context bar along the bottom (`page-r1-2` is the better one).

## Known open items

- The flash bug is fixed by making the bloom ignore NaN pixels (7d47520); the shader that produces the NaN on the
  harness card while moving was not found. `tmp/blank.mjs` (git-ignored scratch) detected it.
- Pages deploys sometimes stall at "syncing_files"; a fresh commit gets through.
