# Narration

Every card in the story and in the side trips has a conversation: two people talk the card through, slower and fuller
than a card can. The card is the summary. The conversation is the explanation a friend gives. The header's talk key, the
two people beside the sound key, plays the conversation of the card on screen and fills with amber as it goes; once
pressed, it follows the reader, so each card they step to starts its own.

- `narration/<id>.txt` is one script. `<id>` is the card's title through `slug()` in `src/lib/journey/content.ts`; a
  side-trip card is `<trip>-<slug>`, for example `sandbox-inside-the-glass`.
- `narration/voices.json` holds the model, the two voices and the `say` list: words the voices get wrong, respelled
  for the audio only. The captions keep the real words.
- `node scripts/narration/say.mjs [ids] [--dry] [--retake=id]` makes `static/narration/<id>.mp3` and `<id>.json` (the
  words, timed per turn and per sentence, kept for a transcript) and the manifest `src/lib/journey/narration.json`. With
  no ids it makes only what's missing; with ids it pays only for the parts whose words changed.
- `node scripts/narration/check.mjs [ids]` runs the audio back through speech to text and lists any words that went
  missing or were added, since nobody here can listen.

## The two voices

**Nora** knows the book closely and the three harnesses well. She explains, finds the image that makes it click, and is
precise about what is known and what isn't. Warm, with a dry sense of humour.

**Theo** is a working developer who uses a coding agent every day and has never looked inside. He asks what a listener
would ask. He tries his own comparisons, and when one is a little off Nora says where it breaks. He pushes back when
something sounds too neat, and now and then sums up in his own words. Some of his questions are sharp.

They like each other. There is no show intro, no "welcome back", no "great question", no sign-off, no hype ("magic",
"game-changer", "mind-blowing") and no "delve".

## The shape of one conversation

- **It stands alone.** A listener may start on any card, in any order. Never refer to an earlier episode. A
  reminder in a phrase is fine: "remember, the model only writes text".
- **The first line is a hook**: a question, a surprise, a concrete picture. Either voice can open.
- **The middle unpacks the card**, claim by claim, in plain words, using the running example: the prompt "Fix the race
  condition in the job scheduler.", the scheduler code, the tests. Every technical word is explained the first time it
  is used in that conversation.
- **The three agents**: where Claude Code, Codex and Copilot in VS Code differ in an interesting way, say how, briefly.
  The card shows only the reader's agent; the conversation is the same for everyone, so it may name all three. Don't
  recite every detail of the notes.
- **It ends on a landing line**, sometimes pointing in one phrase to what comes next on the journey. No goodbye.
- Turns are mostly one to three sentences. Nora sometimes takes up to five. Theo can cut in with a dash, rarely.

## Facts

- Everything said must be backed by the book (`reference/The Journey of a Token How a Coding Agent Works, End to End.md`)
  or by the card itself. Never contradict the card. Don't invent numbers, features, versions or dates.
- Keep the book's hedges: "usually", "can", "in this example". A number the book calls illustrative is an example
  number when spoken.
- Settled points to keep straight: nothing is a token until the provider tokenizes it; the model never touches your
  machine; a reply can carry structured tool calls, but it is still only a request; the cache helps only when the start
  of the request matches exactly and is still kept; an end-of-turn signal doesn't prove the task is solved.

## Length

- A story card: 450 to 620 words, about three to four minutes.
- A side-trip card: 300 to 450 words, about two to three minutes.
- Never past 680 words. The audio has to stay under five minutes, and `say.mjs` refuses anything longer.

## Writing for the ear

- The first line is `# Card title`. Then one turn per line, `NORA: ...` or `THEO: ...`, and nothing else.
- Delivery cues go in square brackets at the start of the sentence they colour, at most one per turn and about one
  turn in three or four: `[curious]`, `[laughs]`, `[chuckles]`, `[thoughtful]`, `[surprised]`, `[amused]`, `[warmly]`,
  `[skeptical]`, `[impressed]`, `[short pause]`, `[excited]`, `[sighs]`.
- Contractions and short sentences. No parentheses, lists, markdown, emoji or links. No symbols: "percent", not "%".
  Numbers as they're said: "twenty-one thousand tokens", "five to thirty turns".
- File names and code can be written as they are (CLAUDE.md, pytest, apply_patch): the `say` list respells them for the
  voice. A new word a voice could stumble on goes into that list.
- Describe code rather than reading it out. A short quoted call is fine.
