# Direction

Each conversation can direct the picture. `narration/direction/<id>.json` lists a few moments: at a phrase of the
script, the camera flies to a thing in the 3D scene, the thing glows, and sometimes something happens there. Once the
moment has had its time, the camera comes back to the card's own shot. `node scripts/narration/direct.mjs [ids]` finds
when each phrase is said and writes the moments into `static/narration/<id>.json`. It reads the voices' own timing,
kept from making the audio, so it records nothing and costs nothing.

The point is to show what the words are about as they're said. This works best for things the card's shot doesn't
already frame, and for actions the voices describe: "Go on, open the first one" pulls out the first drawer. Done well,
it feels like a friend with a pointer who knows when to use it. Done badly, it's a camera lurching at every noun.

## A moment

```json
{ "at": "open the first one", "show": ["drawer:Instructions"], "do": "pull", "index": 0, "hold": 9 }
```

- `at`: words of the script, exactly as written there (case doesn't matter), inside one turn and outside the `[cue]`
  brackets. Phrases are found in order, each after the last, so a phrase that comes more than once means the next
  time after the previous moment. Pick a few distinctive words where the thing is named or the action is described.
  The camera sets off about a third of a second before, and takes 1.5 seconds to get there.
- `show`: names of things in the scene (see below). If several are given, the biggest one in view is used, unless
  `"together": true`, which frames and lights all of them as one.
- `do` (optional): something to happen once the camera has arrived:
  - `"pull"` with `"index"` 0 to 3 slides out the harness's drawer: Instructions, Environment, Tools, Conversation.
    Only for the harness on the island, on cards where it's in the world.
  - `"flip"` turns over the token tiles, between their words and their numbers: once the card has played, they show
    numbers, so the first flip shows the words again. Only on "Now it is a token".
  - `"excite"` lights up the model, the brain in the sky. Only where it's in view: "Thousands more behind it", and the
    last chapter.
  - `"spin"` spins the odds wheel. Only on "One token is chosen".
- `hold` (optional): seconds to stay, 3.6 by default. Use 2 to 2.5 for quick runs through a list, 3 to 4 usually, and
  6 to 9 while a pulled-out drawer is still being talked about.
- `in` (optional): the title of a card to show the thing at, when it isn't in this card's world or is meant to be seen
  as it was there. The picture cuts there, the camera shows it, and it cuts back while the card stays. This is a peek.
  Only on the main road, never from inside a side trip, and rare: two in the whole story at the moment.
- `wide` (optional): pulls back to show a whole: the loop from your laptop up to the model and back. The one kind of
  moment that goes further away than the card's shot. Frame it with several names and `"together": true`.
- `front` (optional): sees the thing from the side it faces, for a screen or a sign whose words are the point, however
  the card's own shot looks at it. A far flight takes a little longer by itself, so it never lurches.

## Names

`narration-lab/catalog.json` (made by `node scripts/narration/catalog.mjs` with the dev server running) lists, for
every card, the named things in the world at that moment (`all`) and those the card's shot frames (`onScreen`). Side
trips are listed card by card with `trip` set. A conversation's id is its card's title through `slug()`. A side trip's
id has the trip's id in front: `harness-round-and-round`.

- Machines and signs go by their words: `Harness`, `MCP`, `Laptop`, `Skills`, `Front door`, `Tokenizer`,
  `KV cache`, `Router`, `Your hooks`, `Subagent`, `Git host`, `sign:Proxy`, `sign:Saved transcript`.
- Labels go by their text: `label:Accelerator`, `label:HBM`, `label:Layer 1`.
- Built parts go by their build name: `tunnel-frame`, `kv-cabinet`, `loop`, `reel`, `glass-frame`, `gate`,
  `checkpoint-stand`, `check-Deny`, `check-Ask`, `check-Allow`, `wheel`, `nvlink`, `attention`, `block-table`.
  (The catalog leaves out names ending in `-stand`, but `checkpoint-stand` and `table-stand` are there to be shown.
  A sign that has shrunk away at that moment is listed but counts as absent, so its moment is skipped.)
- `drawer:Instructions` is the whole drawer. `front:Instructions` is just its front, the same as the harness room's
  hatch. Same for Environment, Tools and Conversation. The MCP box's drawers are `mcp:Tools`, `mcp:Resources`,
  `mcp:Prompts`.

Prefer whole, meaningful things over small parts no one would recognise. Long thin things (a rail, a cable, a glass
tube) frame badly, since the camera backs off to fit their length: show the sign at their head instead. When unsure
whether a name frames well, leave the moment out.

## Taste

- One to three moments for a story conversation, one or two for a side trip. Every move of the camera takes the
  picture away from the card, so each one has to earn it: fewer, well chosen, beats more.
- When the words run through a list, don't follow every item: one longer look that holds while the list is said, or
  `"together": true` over the parts, reads better than a hop per word.
- Go where the words go. Something named that's outside the card's shot is worth the most: the harness when the card
  shows the laptop, the front door on a card about the request.
- Act out what's described. A drawer opened, a wheel spun, the tiles flipped.
- Never the same thing twice in a row, and rarely twice in one conversation. If it does come back, the second time
  should add something: pulled rather than shown, say.
- Peeks cut the picture to another chapter and back, so they're kept for the rare moment worth the trip: the model,
  far off in its data center, or the loop as it was in the very first frame.
- Don't start with what the card's shot is already about, and don't follow every mention of the harness.
- No moment while the voices are mid-joke or summing up the whole card. The last line of a conversation usually needs
  nothing.

See `how-a-coding-agent-works.json`, `it-starts-as-a-sentence.json` and `the-harness-wakes-up.json`.
