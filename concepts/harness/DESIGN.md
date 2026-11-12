# The inside of the harness: design

Draft, 2026-11-11. The design comes first, then image rounds until it is correct, beautiful, playful and delightful,
and only then the build. Every image is checked against this page; the page changes when an image teaches us something.

## 1. What the picture must say

At one glance (agreed 2026-11-11 after four rounds in `hill/`):

> The model, far away, can only read and write, and forgets everything between turns. The harness is the program
> on your machine that does the rest. **It remembers**: one tray holds everything so far, and every turn a copy goes
> up. **It checks**: when the reply asks for something, your rules decide, or you do. **It acts**: it does it on your
> machine and puts what happened in the tray. Round and round, until the model asks for nothing.

Short form: **the model asks; the harness remembers, checks and acts.** The model never moves; the harness runs.

Rules (from the user's direction so far):
- Every object stands for one real thing, and every real thing the cards mention has one object. No garnish.
- Chunky, physical machines, not a diagram. Show what a mechanism does to the reader's own request, not its wiring.
- Say where the reader is. Inside the harness = inside the cabinet from the main road ("bigger on the inside").
- Spatial words stay true: requests go **up** (to the model, upstairs), replies come **down**, results come **back**.
  On the main road the request climbs on the right and the reply comes down on the left; the room keeps that.
- Things that live outside the harness (your files, your shell, MCP servers, your screen, the model) are reached
  through the room's walls and ceiling, never stand inside it.
- Soft, physical cables with a fitting at every end; nothing passes through anything.

## 2. The facts it rests on

Checked 2026-11-11 against the official docs (H = stated there, M = inferred, N = not documented).

**Claude Code**
- **Reading order.** The API lays a request out as `tools`, then `system`, then `messages`, and caches prefixes in that
  order (H, [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md)). Claude Code's
  layers: system prompt and tool definitions, then project context (CLAUDE.md, auto memory, rules) **as a user message
  after the system prompt**, then the conversation; the environment block and git status travel in the conversation
  (H, [Claude Code prompt caching](https://code.claude.com/docs/en/prompt-caching.md),
  [memory](https://code.claude.com/docs/en/memory.md)). So the tray reads: **tools, instructions (the harness's, then
  your rules), environment, your prompt, then the turns.** Exact slots inside that are not published (N).
- MCP tool definitions are **deferred**: only names and server instructions sit in the context until a tool is used.
  Skills: names and descriptions at the start; a skill's body only when it is invoked (H,
  [context window](https://code.claude.com/docs/en/context-window.md)).
- Reminders (a file changed, and so on) are appended later in the conversation, so the start stays the same (H).
- **Window.** Current models (Opus 5.x, Sonnet 5.x, Haiku 5.5, Fable) have **1,000,000 tokens** by default; older ones
  200,000 (H, [context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows.md)).
  Auto-compaction near the limit (about 967K on 1M models).
- **Loop.** One API request per turn; the model rereads everything each time. A reply that stops for `tool_use` can
  hold several tool calls, which the harness may run side by side; results go back as one message of `tool_result`s.
  `end_turn` ends it (H, [stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons.md)).
  Esc cancels the running tool (H).
- **The gate.** Modes: Manual (default), acceptEdits, plan, auto, dontAsk, bypassPermissions. Your allow / ask / deny
  rules resolve first, and **deny rules apply in every mode** (H,
  [permission modes](https://code.claude.com/docs/en/permission-modes.md)). In auto mode, reads and in-folder edits
  are approved by built-in rules and everything else goes to **a classifier: a second model** that judges the call
  (it sees your messages, the call and CLAUDE.md, not tool results); no verdict means no. A separate check on the
  provider's side scans tool results for injected instructions (auto mode) (H).
- **Hooks** (33 events): PreToolUse can allow, deny, ask or defer a call; PostToolUse can't block (the tool already
  ran); Stop, SubagentStop, PreCompact, UserPromptSubmit and others can block (H,
  [hooks](https://code.claude.com/docs/en/hooks.md)).
- **Sandbox**: off by default. When on, it fences Bash commands and every child process (Seatbelt on macOS, bubblewrap
  on Linux), with network through an allow-list proxy. Hooks, MCP servers and LSP servers run **outside** it with full
  access (H, [sandboxing](https://code.claude.com/docs/en/sandboxing.md)).
- **Transcript**: one JSONL file per session under `~/.claude/projects/<project>/`, kept 30 days; `--continue`,
  `--resume`, `/branch` (H, [sessions](https://code.claude.com/docs/en/sessions.md)). **Checkpoints** snapshot files
  before each prompt (the last 100), and rewind restores code, conversation or both; not Bash side effects, other
  sessions' edits or remote systems (H, [checkpointing](https://code.claude.com/docs/en/checkpointing.md)).
- **Compaction** replaces the history with a structured summary. What survives it: the system prompt, CLAUDE.md, auto
  memory, the plan, skill descriptions, up to five recently touched files, invoked skills, background tasks (H).
- **Subagents** (the Agent tool): own context, only the summary returns; built-in Explore and Plan (read-only),
  general-purpose and others; can run in their own git worktree. A subagent can start subagents of its own, by
  default up to three layers below the main conversation; at that limit the Agent tool is withheld, so the last one
  does its work itself (H,
  [subagents](https://code.claude.com/docs/en/sub-agents.md)).

**Codex** ([unrolling the Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop),
[app-server](https://learn.chatgpt.com/codex/app-server), [sandboxing](https://learn.chatgpt.com/codex/sandboxing),
[rules](https://learn.chatgpt.com/codex/agent-configuration/rules), [openai/codex](https://github.com/openai/codex))
- One Rust engine, the **app-server**, holds the threads; the terminal embeds it, and the editor and desktop app talk
  to it over JSON-RPC. A request is `instructions`, `tools` and `input`: a developer note with the sandbox and approval
  rules, AGENTS.md (as a user message), the environment, then your prompt. The **whole history is resent every turn**.
  Changes are appended, never edited in, to keep the cached prefix (H).
- The **sandbox is on by default** around every command it starts (Seatbelt, bwrap + seccomp, Windows' own);
  approval policies; Starlark `.rules` where the **strictest match wins**; an optional reviewer agent at the gate;
  hooks only after you trust them (H).
- Sessions: `~/.codex/sessions/…/rollout-*.jsonl`. Compaction replaces the history with **one opaque, encrypted
  item** (H). Subagents run in parallel with the parent's sandbox (H).

**Copilot in VS Code** ([Agent Host](https://code.visualstudio.com/docs/agents/concepts/agent-host),
[approvals](https://code.visualstudio.com/docs/agents/run/approvals),
[sandboxing](https://code.visualstudio.com/docs/agents/run/agent-sandboxing))
- The **Agent Host** is a process of its own, local or on another machine, that runs **several engines** (Copilot's,
  Claude's, Codex's) and owns the sessions; windows are viewers that can come and go (H).
- Approval levels Manual, Assisted (a small model judges) and Allow all; the terminal's auto-approve list is "not a
  security boundary"; a sandbox for terminal commands only; PreToolUse hooks can rewrite a call (H).
- Compaction starts in the background at about 80% and blocks at about 95% (Copilot CLI) (H).

**Deep Agents** ([overview](https://docs.langchain.com/oss/python/deepagents/overview),
[backends](https://docs.langchain.com/oss/python/deepagents/backends), [repo](https://github.com/langchain-ai/deepagents))
- A Python library in your own process: a **stack of middleware** round a two-step LangGraph loop (model, tools). Files
  can be a **virtual filesystem** in the agent's state, or disk, a store or a sandbox, swapped as backends. No OS
  sandbox; file rules only. Summarises at 85% and writes what it evicts to `/conversation_history/` (H).

**opencode** ([server](https://opencode.ai/docs/server/), [permissions](https://opencode.ai/docs/permissions/),
[repo](https://github.com/anomalyco/opencode))
- A **background server** (TypeScript on Bun) that many screens talk to over HTTP; a "Code Mode" tool runs JavaScript
  the model writes, which calls the other tools; optional **cache warming** pings; hidden helper agents write titles,
  summaries and compactions. Rules where the last match wins and no match means ask; **no OS sandbox**: the shell has
  your full authority (H).

**Across them.** Claude's and OpenAI's requests both put **the tools before the instructions**, with the
conversation last. Every one of them rereads the whole conversation each turn. Where they differ: how the loop is
housed, what stands at the gate, whether a fence stands round the shell, and what compaction leaves behind.

**Outside the harness, at the provider** (for the "what runs where" view)
- The key is checked, then the rate limits (a token bucket per organisation). Classifiers watch the traffic:
  Anthropic's can stop a reply as it streams (`stop_reason: refusal`); OpenAI sorts requests by risk and may delay a
  stream while checks run. The tokenizer is the provider's own. The prompt cache matches exact prefixes, kept 5 minutes
  to an hour (Anthropic) or 30 minutes to 12 hours (OpenAI), never shared between organisations (H,
  [rate limits](https://platform.claude.com/docs/en/api/rate-limits),
  [refusals](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/handle-streaming-refusals),
  [OpenAI caching](https://developers.openai.com/api/docs/guides/prompt-caching)).
- Some tools run **on the provider's machines**, not yours: web search, web fetch, code execution. Bash, file edits and
  most MCP servers run on yours (H, [tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)).

## 3. The objects

| Object | Stands for | Cards |
| --- | --- | --- |
| **The tray** (hero) | The context: the request the model reads this turn, as one long low porcelain tray of fixed length. Its **end stop** is the context window's limit. Its **tiles** are tokens in coloured runs, each run as long as its share. The same object as the header gauge, same colours, same order. | all |
| **Frosted cover** | The cached prefix: the part unchanged since last turn, which the provider reuses. It runs up to the last turn. | 1, 3 |
| **The drawers** | Where the parts come from: the harness's instructions and your rules file, the environment snapshot, the tools (built-in and MCP), the conversation. The same four drawers as on the cabinet's front, seen from behind in the back wall. | 1, 3 |
| **The lip** | Where the conversation arrives: a rail along the tray's front on which new tiles slide to the open end, replies and your prompt from the left, results from the right. | 2 |
| **Skill shelf** | Skills: a row of small closed cards (name and one line each); the one the task needs unfolds into a longer run. | 3 |
| **Send hatch** (right, up) | The request leaving: a capsule carries a **copy** of the whole tray up through the ceiling to the model. The tray stays: the model keeps nothing between turns. | 1, 2 |
| **Reply chute** (left, down) | The reply streaming in as tiles: the model's words (grey-blue), and sometimes an **amber card**, a tool call, held until it is complete. | 2, 4 |
| **Your screen** | Where the model's words show to you: a window in the wall by the chute. | 2 |
| **The gate** | The check every tool call passes: allowed, ask you, or refused. Your **rules** (allow / ask / deny; deny always wins) and your **hooks** plug into it; a **bell** rings when it must ask you; a **mode dial** (Manual, accept edits, plan, auto…) sets how much it may do alone. In auto mode a small **window to a second model** (the classifier) judges risky calls. Its look echoes the main road's gates (board, beacon dome). | 2, 4 |
| **The ports** | Where tools run, on your machine: round ports in the wall with cables out to your files, your shell and MCP servers (separate programs). When the sandbox is on, a **glass fence** (the OS's) stands round the shell's port and everything it starts; hooks and MCP servers stay outside it. Several calls from one reply can run side by side. | 2, 4 |
| **Result tiles** | What a tool returned: jade tiles that go into the tray's open end. | 2 |
| **The transcript** | Everything written down: every tile is copied onto a record that goes out through the wall to disk (one file per session), where a session can be picked up again. Beside it, **checkpoints**: a copy of the files taken before each prompt, so a rewind can put them back. | 5 |
| **The press** | Compaction: when the tray nears its end stop, the conversation is squeezed into one summary block (orange). The tools, instructions and your rules stay as they were, and a few recently touched files are read in again; the transcript still has everything. Same press as the main road's. | 5 |
| **The subagent** | A loop inside the loop: a small room of its own with its own small tray. A brief goes in, a summary block comes out, and only that joins the tray. | 6 |
| **The turn** | Where the loop is: one marker that travels the stations in order. It stops when a reply comes back with no amber card. | 2 |

Tile colours (the gauge's): instructions `#ecd29a`, environment `#9fcbf3`, tools `#c9a271`, your prompt `#2f6fe0`,
tool calls `#ffbc2e`, results `#3cc47e`, the model's words `#b9c4d8`, summary `#ff9a1f`. Red only for a refusal.

Order (Claude Code): **tools, instructions (the harness's, then your rules), environment, your prompt**, then each
turn's tool calls, results and words. MCP tools sit in the tools run as names only until one is used.

Scale: the tray is the agent's whole window: **1,000,000 tokens** for Claude Code on current models (see open
question 1). Turn one (about 21,000) fills about 2% of it: honestly, the tray starts nearly empty. A part too small to
see at that scale (your prompt, 100 tokens) still gets one whole tile; the gauge's card gives the real numbers.

## 4. Layout of the room

Drawn in `plan-f3.png` (plan and front section); coordinates for the build in `plan-f3.md`; the reasoning in
`hill/1-claude.md` to `hill/4-fable.md`. Earlier tries: `plan-r1.png`, `plan-f1.png`, `plan-f2.png` (the subagent in
the front-right corner, which left the middle of the floor empty).

- **Three zones**, one per verb: the room **remembers** at the back (the tray under the drawers and the skill shelf;
  the writer riding the open end and the record's slot to your disk; the end stop is the press), **checks** on the
  left by you (the gate, your screen's wide window facing it, the hook port), and **acts** on the right by your
  machine (three benches wired through the right wall to your files, your shell and an MCP server standing on a
  ledge outside it).
- **The subagent** stands in the middle of the front, where the cart's rail ends: the room again, in small, with its
  own tray, loop, gate and benches, and inside it a smaller one, and inside that a smaller one still: three layers,
  and the last has no door, because at the limit the harness takes the subagent tool away. Only a summary comes back
  out, onto the rail and into the tray.
- **The loop**: a copy goes up the standing tube in the back-right corner; the reply comes down the chute in the
  back-left corner onto the pad. The lip carries only what comes from the left (words, your prompt, a refusal) to
  the open end. **The cart** is the turn marker: it carries an amber card through the gate to a bench, and the
  result back to the open end, both ways along the front rail.
- **The camera** (wide shot) stands about 41 units out, just right of the right wall's line: the right wall's inner
  face never shows, the ledge outside it is in plain view, the left wall reads at about 25°, and the back wall and
  floor carry most of the picture.

## 5. What each card shows

1. **Bigger on the inside**: the drop through the roof lands on the wide shot. Turn one is in the tray; everything
   at rest; each station's lamp on.
2. **Round and round**: one turn, slowly: the capsule goes up; tiles stream down the chute, and an amber card
   forms; the gate lights green; a port runs it; jade tiles click into the tray. Then two quick turns, the tray
   growing each time, then a reply with no amber card: the turn marker stops, the words go to your screen.
3. **Packed fresh, every turn**: close on the drawers, the shelf and the tray's start: the frosted cover over what
   did not change; one skill unfolding from the shelf into the tray.
4. **Asking is not doing**: close on the gate: an amber card waits. Your rules decide first: one call is allowed, one
   asks (the bell rings, your screen asks you), one is refused (red) and never reaches a port. The mode dial turns,
   and the same call goes through alone. A hook plugs in and changes a call.
5. **Everything is written down**: every tile copied onto the record going out to disk, and a copy of the files
   taken before each prompt (checkpoints). The tray reaches its end stop; the press squeezes the conversation into a
   summary block while the tools, instructions and rules stay; the record still holds everything.
6. **A loop inside the loop**: a brief goes into the subagent's room; its own small loop runs; one summary block
   comes back and joins the tray.

## 6. Per harness

The same room, with its parts changed where the harnesses really differ. Claude Code first; Codex and Copilot next;
Deep Agents and opencode after.

| | How the loop is housed | At the gate | Round the shell | After compaction |
| --- | --- | --- | --- | --- |
| Claude Code | One program; terminal, editor and desktop app run the same loop | Mode dial, your rules (deny wins), hooks, a second model in auto mode | A fence, when you turn it on | A summary block; tools, instructions and rules stay |
| Codex | An engine with a protocol port on its face; the editor and app plug in | A rulebook (strictest wins), approval policy, an optional reviewer agent, trusted hooks | A fence round every command, on by default | One sealed, encrypted block |
| Copilot | A host with sockets for several engines; windows come and go | Manual / Assisted (a small model judges) / Allow all; hooks can rewrite a call | A fence round the terminal only | Summary, starting at 80% |
| Deep Agents | A library in your own program: layers of middleware round a two-step loop | File rules only; a pause for a person, if set | None; files may live in the agent's own state | Summary at 85%, the rest written to a file |
| opencode | A server in the background; many screens; a JavaScript workbench | Ordered rules (last match wins; none means ask) | None: the shell has your full authority | Summary; the last 15k tokens kept as they were |

## 7. Open questions for the user

1. **The window.** Claude Code's tray is 1,000,000 tokens on current models; the live header gauge says 200k. Make
   the gauge and the tray 1M for Claude Code (turn one is then about 2%, so the tray starts nearly empty, which is
   itself worth seeing), and give each agent its own window once checked?
2. **The order.** Put the tools first in the tray and the gauge (true for Claude and for Codex)? The four drawers on
   the cabinet can keep their order: they are where things come from, the tray is the order they're read in.
3. **Scope of the first rounds.** The trip's room (six cards) first, then the main road's cabinet and press?
4. **Per harness.** Claude Code's room until it's right, then the others?
5. **The fourth drawer** (settled in the plan, unless you object): the Conversation drawer is empty on a fresh start
   and refilled from the records on `--resume`, `--continue`, `/branch` or a rewind.

## 8. Look and feel

- Materials: satin porcelain, cream keycap tiles, small brass fittings, matte soft cables, frosted glass covers. Warm
  daylight inside. No glow, no robot arms, no hazard stripes, no chevrons.
- Hierarchy: the tray is the brightest, largest, most detailed thing; stations are simple single shapes around it.
- Words come in the build, never in concept images: boards with a Hugeicon and a name, as in the gates scene.
- **Playful, never gimmicky**: every small delight means something. Tiles click into the tray with a tiny settle; the
  capsule leaves with a soft pop; the bell dings only when you are asked; the press gives a slow squeeze and the
  summary block lands with weight; the turn marker hops station to station.

## 9. Checklist for every image

Correct
- [ ] Tray order and proportions as in sections 2 and 3; one end stop; frosted cover over the unchanged part only.
- [ ] Sending makes a copy; the tray stays.
- [ ] The reply arrives as tiles; an amber card is a request, not an action.
- [ ] Every call passes the gate before any port; refusals never reach a port.
- [ ] Results return into the tray's open end.
- [ ] Files, shell, MCP servers, your screen and the model are outside the room, reached through walls or ceiling.
- [ ] Transcript and press shown as different things (the record keeps everything; the tray gets the summary).

Legible
- [ ] A newcomer can say what each station does within five seconds.
- [ ] One shape per station; the tray reads first; the card's third stays calm.

Of a piece with the world
- [ ] Same room, cabinet and drawers as today; up on the right, down on the left.
- [ ] Cables soft and physical, every end in a fitting; nothing intersects.

Beautiful, playful, delightful
- [ ] Calm composition and palette; the tray's colours match the gauge.
- [ ] At least one honest small delight per station; nothing decorative.

## 10. The process

1. **Gate 1, this page.** The user approves or changes the design, and answers section 7.
2. **Wide shot rounds.** Concepts of the whole room from section 4, checked against section 9, iterated with the
   best so far as the reference, until the user is happy.
3. **Card shots.** One concept per card (section 5), same room.
4. **Gate 2.** The user approves the set.
5. **Build in slices**, each checked on the GPU with collision and cable checks, dense-frame review and the user's
   eye: the tray and its data; the stations; the cards' motion and cameras; the other harnesses; the main road's
   echoes (the cabinet's drawers, the compaction press).
