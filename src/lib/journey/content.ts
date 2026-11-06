export type HarnessId = 'claude' | 'codex' | 'copilot';

export const PROMPT = 'Fix the race condition in the job scheduler.';

export interface HarnessSpec {
	id: HarnessId;
	name: string;
	surface: 'terminal' | 'editor';
	ruleFile: string;
	tools: string[];
	host: string;
	path: string;
	fields: { system: string; tools: string; messages: string };
	folder: string;
}

export const HARNESSES: Record<HarnessId, HarnessSpec> = {
	claude: {
		id: 'claude',
		name: 'Claude Code',
		surface: 'terminal',
		ruleFile: 'CLAUDE.md',
		tools: ['Read', 'Edit', 'Bash', 'Grep', 'WebFetch'],
		host: 'api.anthropic.com',
		path: '/v1/messages',
		fields: { system: 'system', tools: 'tools', messages: 'messages' },
		folder: '~/scheduler-app'
	},
	codex: {
		id: 'codex',
		name: 'Codex',
		surface: 'terminal',
		ruleFile: 'AGENTS.md',
		tools: ['shell', 'apply_patch', 'update_plan', 'web_search'],
		host: 'api.openai.com',
		path: '/v1/responses',
		fields: { system: 'instructions', tools: 'tools', messages: 'input' },
		folder: '~/scheduler-app'
	},
	copilot: {
		id: 'copilot',
		name: 'Copilot',
		surface: 'editor',
		ruleFile: 'copilot-instructions.md',
		tools: ['readFile', 'editFiles', 'runTerminal', 'textSearch'],
		host: 'api.githubcopilot.com',
		path: '/chat/completions',
		fields: { system: 'system', tools: 'tools', messages: 'messages' },
		folder: 'scheduler-app'
	}
};

/** The tokenizer's cut of the prompt. The leading space belongs to the piece, as it does in BPE. */
const CHAR = 0.149;
const piece = (text: string, id: number, special = false) => ({
	text,
	id,
	special,
	width: Math.max(0.62, text.length * CHAR + 0.2)
});

export const TOKENS: { text: string; id: number; width: number; special: boolean }[] = [
	piece('<user>', 100264, true),
	piece('Fix', 8596),
	piece(' the', 279),
	piece(' race', 7102),
	piece(' condition', 3044),
	piece(' in', 304),
	piece(' the', 279),
	piece(' job', 2683),
	piece(' scheduler', 29054),
	piece('.', 13),
	piece('<end>', 100265, true)
];

/** The book's spine: the same request in twelve forms. */
export const FORMS = [
	{ n: 1, name: 'Keystrokes', where: 'your laptop' },
	{ n: 2, name: 'A JSON request', where: 'your laptop, the harness' },
	{ n: 3, name: 'Encrypted bytes', where: 'the internet' },
	{ n: 4, name: 'Token IDs', where: 'the provider’s front door' },
	{ n: 5, name: 'Embeddings', where: 'an accelerator chip' },
	{ n: 6, name: 'KV-cache rows', where: 'chip memory' },
	{ n: 7, name: 'Logits', where: 'the last layer of the model' },
	{ n: 8, name: 'One sampled token', where: 'the sampler' },
	{ n: 9, name: 'A text delta', where: 'provider to your laptop' },
	{ n: 10, name: 'A parsed tool call', where: 'the harness' },
	{ n: 11, name: 'A system call', where: 'your laptop’s OS' },
	{ n: 12, name: 'A tool result', where: 'the harness, then the provider again' }
];

/** How the same three calls look in each harness's own catalog. */
/** `alongside` is the other call in turn one, when the agent makes two. */
export const CALLS: Record<HarnessId, { search: string; alongside?: string; edit: string; test: string; pieces: string[] }> = {
	claude: {
		search: 'Grep("lock|schedule", src/)',
		alongside: 'WebFetch(docs)',
		edit: 'Edit(src/scheduler.py, old, new)',
		test: 'Bash(pytest tests/test_scheduler.py -x)',
		pieces: ['Grep', '{"', 'pattern', '":"', 'lock', '|', 'schedule', '","', 'path', '":"', 'src', '/', '"}']
	},
	codex: {
		search: 'shell(rg -n "lock|schedule" src/)',
		edit: 'apply_patch(*** Update File: src/scheduler.py)',
		test: 'shell(pytest tests/test_scheduler.py -x)',
		pieces: ['shell', '{"', 'command', '":"', 'rg', ' -n', ' lock', '|', 'schedule', ' src', '/', '"}']
	},
	copilot: {
		search: 'textSearch("lock|schedule")',
		alongside: 'fetch(docs)',
		edit: 'editFiles(src/scheduler.py)',
		test: 'runTerminal(pytest tests/test_scheduler.py -x)',
		pieces: ['text', 'Search', '{"', 'query', '":"', 'lock', '|', 'schedule', '"}']
	}
};

/** Plain definitions for the words a reader may not know. Keys are lowercase; copy marks them with [[term]]. */
export const GLOSSARY: Record<string, string> = {
	turn: 'One round trip: the harness sends everything, the model replies, and the harness acts on the reply. A real fix takes many.',
	'prefix cache': 'The part of the KV cache a request can reuse, because it starts with exactly the same bytes as an earlier one whose blocks are still kept, usually for a few minutes.',
	token: 'A small piece of text, usually a word or part of a word. “scheduler” might be one token, “race condition” two.',
	tui: 'Terminal user interface: a full app drawn inside your terminal window.',
	mcp: 'Model Context Protocol: a standard way for outside programs to offer extra tools to an agent.',
	'json schema': 'A precise description of what a tool’s arguments must look like, so the model knows how to call it.',
	tls: 'The encryption behind the padlock in your browser. Only the two ends of the connection can read what passes between them.',
	sse: 'Server-sent events: one long-lived connection that the server keeps writing to, piece by piece.',
	'529': 'An HTTP status code meaning “overloaded, try again soon.” It’s about the service, not about you.',
	'chat template': 'A recipe that turns structured messages into one string of text, with special markers for who said what. Every model family has its own.',
	'inference cluster': 'The rooms of machines that run the model. “Inference” just means using a trained model, as opposed to training it.',
	weights: 'The learned numbers that make a model what it is. Training sets them. Using the model never changes them.',
	nvlink: 'NVIDIA’s very fast link between chips in the same server.',
	'infiniband or roce': 'Fast networks that connect the servers in a cluster. RoCE runs the same idea over Ethernet.',
	'vllm and sglang': 'Open-source programs that serve large models to many people at once. Anyone can read how they work.',
	scheduler: 'Not the one in your prompt. This one decides, step by step, which requests the chips work on next.',
	prefill: 'The first pass: the model reads your whole prompt at once and fills the KV cache.',
	decode: 'The loop after prefill: the model writes its answer, one token per pass.',
	rdma: 'Remote direct memory access: one server reads another’s memory straight over the network, without bothering its processor.',
	embedding: 'A long list of learned numbers standing in for a token. Tokens with similar meanings get similar lists.',
	softmax: 'A formula that turns any list of scores into shares adding up to 100%, with the biggest scores taking the most.',
	vector: 'A list of numbers. Here, it’s what the model currently thinks about one token.',
	'lm head': '“Language model head”: the model’s very last step, which turns one final vector into a score for every token in the vocabulary.',
	logit: 'A raw score, before it’s turned into a probability. Higher means more likely, and it can even be negative.',
	temperature: 'A dial on the scores. Turn it down and the favorite nearly always wins. Turn it up and long shots get a real chance.',
	'top-p or top-k': 'Two ways to cut the long shots. Top-k keeps only the k best tokens. Top-p keeps the smallest group whose chances add up to p.',
	'speculative decoding': 'A quick helper guesses the next few tokens, and the big model checks them all in one pass. Same answers, less waiting.',
	ripgrep: 'A very fast command-line search tool, run as rg.',
	classifiers: 'Small models that sort text into categories. Here: within the rules, or not.',
	'prompt injection': 'Text in a file or web page written to trick a model into obeying it as if you had said it.',
	seatbelt: 'macOS’s built-in way to fence a program in. Bubblewrap does the same job on Linux. Anything the program starts stays inside the fence.',
	sandbox: 'A fence around a process the agent starts, such as a shell command: it can only touch the files and network it has been allowed. Edits and other tools go through permissions instead.',
	'system call': 'How a program asks the operating system to do real work, like opening a file or starting a process.',
	atomically: 'All or nothing. Anyone looking sees the old file or the new one, never something in between.',
	hunk: 'One changed block in a diff.',
	'stdout, stderr and the exit code': 'A command’s normal output, its error output, and a number saying how it went. Zero means fine.',
	router: 'Not a network box. The part of the provider that decides which copy of the model serves your request.',
	skills: 'Folders of instructions for one kind of task, like how your team writes migrations. Loaded only when needed.',
	hooks: 'Scripts you set up to run at fixed moments, such as just before a tool runs or when the agent stops.',
	subagent: 'A second conversation the model starts for a side quest, with its own context and its own loop. Its summary comes back to the parent; any files it changed are changed for everyone.',
	classifier: 'A small model that reads each call and judges whether it’s safe to run without asking you.',
	rlock: 'A lock the thread holding it can take again without waiting for itself. A plain lock would wait forever here.',
	deadlocks: 'When a program waits forever for something that can never happen. Here, a thread waits for a lock it is already holding.',
	pty: 'A pretend terminal a program can run inside, so it keeps going as if someone were watching.',
	stateless: 'The server keeps nothing between requests, so each request has to carry everything.',
	transcript: 'The full record of this session: every message, tool call and result.',
	'json-rpc': 'A tiny message format one program uses to ask another to run something: a method name, some parameters, and an answer that comes back with the same number.',
	'context window': 'The most a model can take in at once, measured in tokens. Think of it as the size of its desk.'
};

/** The highest scores out of the LM head. Illustrative. */
export const LOGITS = [
	{ text: 'The', score: 3.6 },
	{ text: 'I', score: 2.3 },
	{ text: 'Let', score: 1.9 },
	{ text: 'First', score: 1.4 },
	{ text: 'To', score: 1.05 },
	{ text: 'Sorry', score: 0.4 },
	{ text: 'Cat', score: 0.2 }
];
/** Top-k: everything below the best five is cut before the draw. */
export const TOP_K = 5;

/** What sampling really does: divide the logits by the temperature, then softmax what top-k left. */
export function wheelOdds(temperature: number) {
	const weights = LOGITS.slice(0, TOP_K).map((l) => Math.exp(l.score / temperature));
	const sum = weights.reduce((a, b) => a + b, 0);
	return weights.map((w) => w / sum);
}

export type PerAgent = Record<HarnessId, string>;
const edited: PerAgent = { claude: 'Approved and written.', codex: 'Inside the workspace, so it’s written without asking.', copilot: 'Another diff opens for review.' };
const runs = (args: string): PerAgent => ({ claude: `Bash(pytest${args})`, codex: `shell: pytest${args}`, copilot: `runTerminal(pytest${args})` });

/**
 * The fix, turn by turn. Token counts are the book's, for Claude Code, and illustrative. Marked terms are in the glossary.
 * sees: what is new in the request. thinks: the model's short reasoning. calls: what it asks for. after: what the harness does.
 */
/** Where in the story the ten turns start being told, and how far apart they are. The scene and the page share these. */
export const TEN_AT = 29.1;
export const TEN_STEP = 0.066;

export const TEN_TURNS: { label: string; cached: number; fresh: number; sees: string; thinks: string; calls: PerAgent; after: PerAgent }[] = [
	{
		label: 'Search',
		cached: 0,
		fresh: 21000,
		sees: 'Your prompt.',
		thinks: 'I need the scheduler code and the library’s lock docs.',
		calls: { claude: 'Grep("lock|schedule", src/), WebFetch(docs)', codex: 'shell: rg -n "lock|schedule" src/', copilot: '#search/textSearch, #web/fetch' },
		after: { claude: 'Runs both at once.', codex: 'There’s no search tool here. The shell does it.', copilot: 'The model may also ask the code index for related files.' }
	},
	{
		label: 'Read',
		cached: 21000,
		fresh: 1500,
		sees: '14 matching lines and 600 tokens of docs.',
		thinks: 'JobScheduler.run touches self.queue without the lock.',
		calls: { claude: 'Read(src/scheduler.py, 60-160)', codex: 'shell: sed -n \'60,160p\' src/scheduler.py', copilot: '#read/readFile, #search/usages' },
		after: { claude: 'Returns 100 numbered lines.', codex: 'There’s no read tool either. Same shell.', copilot: 'The language server finds every caller, no grep needed.' }
	},
	{
		label: 'Tests',
		cached: 22500,
		fresh: 2000,
		sees: '100 lines of code.',
		thinks: 'Two threads can pop the same job. It needs a lock around lines 101 to 108. But first, the test file.',
		calls: { claude: 'Glob("tests/*sched*"), Read(tests/test_scheduler.py)', codex: 'shell: cat tests/test_scheduler.py', copilot: '#read/readFile(tests/test_scheduler.py)' },
		after: { claude: 'Runs both.', codex: 'The whole file comes back through the shell.', copilot: 'Reads it by line range.' }
	},
	{
		label: 'Edit',
		cached: 24500,
		fresh: 1200,
		sees: 'A file list and the test code.',
		thinks: 'No test covers this. Fix it, then add one.',
		calls: { claude: 'Edit(src/scheduler.py, old, new)', codex: 'apply_patch(src/scheduler.py)', copilot: 'editFiles(src/scheduler.py)' },
		after: {
			claude: 'A [[classifier]] approves it in auto mode. Written all at once, and the linter is happy.',
			codex: 'Inside the workspace, so it’s written without asking.',
			copilot: 'The diff opens for review, and the type checker answers within milliseconds.'
		}
	},
	{
		label: 'New test',
		cached: 25700,
		fresh: 300,
		sees: 'The edit went in: lines 101 to 109.',
		thinks: 'Now a test with two worker threads.',
		calls: { claude: 'Edit(tests/test_scheduler.py)', codex: 'apply_patch(tests/test_scheduler.py)', copilot: 'editFiles(tests/test_scheduler.py)' },
		after: edited
	},
	{
		label: 'Run',
		cached: 26000,
		fresh: 250,
		sees: 'The test went in.',
		thinks: 'Run the tests.',
		calls: runs(' tests/test_scheduler.py -x'),
		after: {
			claude: 'In the [[sandbox]], 8 seconds. Exit code 1: it failed.',
			codex: 'In the [[sandbox]], with no network. Exit code 1: it failed.',
			copilot: 'In the terminal, after a confirmation card. Exit code 1: it failed.'
		}
	},
	{
		label: 'Fix',
		cached: 26250,
		fresh: 500,
		sees: 'FAILED: a [[deadlock|deadlocks]]. The output is trimmed to 400 tokens.',
		thinks: 'The lock is taken again inside _dispatch. Use an [[RLock]].',
		calls: { claude: 'Edit(src/scheduler.py)', codex: 'apply_patch(src/scheduler.py)', copilot: 'editFiles(src/scheduler.py)' },
		after: edited
	},
	{
		label: 'Run',
		cached: 26750,
		fresh: 250,
		sees: 'The fix went in.',
		thinks: 'Run them again.',
		calls: runs(' -x'),
		after: { claude: 'Exit code 0: it passes.', codex: 'Exit code 0: it passes.', copilot: 'Exit code 0: it passes.' }
	},
	{
		label: 'All tests',
		cached: 27000,
		fresh: 200,
		sees: '12 passed.',
		thinks: 'Run the whole suite, to be safe.',
		calls: runs(''),
		after: { claude: '40 seconds. Exit code 0.', codex: '40 seconds. Exit code 0.', copilot: '40 seconds. Exit code 0.' }
	},
	{
		label: 'Done',
		cached: 27200,
		fresh: 150,
		sees: '418 passed.',
		thinks: 'Done. Summarize.',
		calls: { claude: 'Plain text, then end_turn', codex: 'Plain text, and the turn ends', copilot: 'Plain text, and the turn ends' },
		after: { claude: 'Shows the diff and summary, and saves the session.', codex: 'The terminal lists the changed files.', copilot: 'The Agents window shows the files and diffs beside the chat.' }
	}
];

/** The tokens the chips really run across the ten turns, with the cache and without it. */
export const RUN_WITH_CACHE = TEN_TURNS.reduce((sum, t) => sum + t.fresh, 0);
export const RUN_WITHOUT_CACHE = TEN_TURNS.reduce((sum, t) => sum + t.cached + t.fresh, 0);

/** The stops on the book's map, and the chapters of this telling that fall under each. Parts are card titles, exactly. */
export const STOPS: { name: string; what: string; parts: string[] }[] = [
	{ name: 'Your head', what: 'You decide what to ask, and which agent to ask.', parts: ['How a coding agent works', 'It starts as a sentence'] },
	{ name: 'Your laptop', what: 'The harness wakes up, gathers your rules and builds one request.', parts: ['The harness wakes up', 'One JSON request'] },
	{ name: 'The wire and the front door', what: 'Encrypted, checked, and cut into tokens.', parts: ['Across the wire', 'The front door', 'Now it is a token'] },
	{
		name: 'The cluster',
		what: 'Thousands of chips, and a memory that saves them work.',
		parts: ['Thousands more behind it', 'One model, many chips', 'Its working memory', 'Blocks that can sit anywhere', 'Turn two starts ahead', 'Sharing the chips', 'Reading and writing']
	},
	{
		name: 'Inside the model',
		what: 'The math runs, one token is chosen, and text streams back.',
		parts: ['The transformer', 'A place for every word', 'Attention', 'All of them, at once', 'Then each token, by itself', 'Then again, eighty times', 'One score for every word', 'One token is chosen', 'One at a time', 'A tool call is born', 'Text comes back, not numbers']
	},
	{ name: 'Your laptop again', what: 'The reply is only words, even a tool call. The harness decides what runs.', parts: ['The model has no hands', 'Intent is not authority', 'When the page lies'] },
	{ name: 'Your files and shell', what: 'Searching, editing, and running the tests.', parts: ['Finding the code', 'Three ways to edit', 'Evidence, not opinion'] },
	{ name: 'Around the loop', what: 'Everything goes back, and the model goes again.', parts: ['Around the loop', 'When the context fills up', 'Seven things called memory', 'When the answer gets lost'] },
	{ name: 'Done', what: 'The whole fix, what finished really means, and what it all adds up to.', parts: ['The whole fix, in ten turns', 'What finished means', 'Different bodies, one kind of mind', 'The whole trip, in one look'] }
];

/** A chapter's name in the address bar, so a stop can be shared. */
export const slug = (title: string) =>
	title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

/** The loop on one page, in the words of the book's first poster. */
export const TRIP: { name: string; what: string }[] = [
	{ name: 'Ask', what: 'You type one sentence.' },
	{ name: 'Assemble', what: 'The harness wraps it in your rules, your tools and everything said so far.' },
	{ name: 'Cross', what: 'One JSON request crosses the internet, encrypted.' },
	{ name: 'Encode', what: 'The front door checks it, and the tokenizer cuts it into numbers.' },
	{ name: 'Compute', what: 'The model reads it all, and writes a reply one token at a time.' },
	{ name: 'Stream', what: 'Text comes back, not numbers. The model has touched nothing.' },
	{ name: 'Authorize', what: 'The harness checks what the reply asks for, gate by gate.' },
	{ name: 'Act', what: 'The tools run on your machine, and what they find is real.' },
	{ name: 'Loop', what: 'The results go back as context, and round it goes until the tests pass.' }
];

/* ---------- side trips ---------- */

/** A detour off the main road, read card by card, that brings the reader back to where they left. */
export type TrackId = 'mcp' | 'harness';
export interface TrackCard {
	title: string;
	body: string[];
	/** Where the three agents differ, said in the agent's own note. */
	note?: PerAgent;
}
export interface Track {
	name: string;
	/** One line that says what's down there, for the buttons that lead to it. */
	what: string;
	cards: TrackCard[];
}

/**
 * Where each trip is played. It borrows a stretch of the story: a reader already there flies in and back out, and one
 * from anywhere else cuts over to the story at T, and back. A trip that goes inside something has a room of its own,
 * which the reader drops into through the roof.
 */
export const TRACK_AT: Record<TrackId, { T: number; nearBefore: number; inside?: boolean }> = {
	mcp: { T: 1.5, nearBefore: 2.02 },
	harness: { T: 1.5, nearBefore: 2.8, inside: true }
};

export const TRACKS: Record<TrackId, Track> = {
	harness: {
		name: 'Inside the harness',
		what: 'The loop at its heart, and what it does each turn.',
		cards: [
			{
				title: 'Bigger on the inside',
				body: [
					'This is the program you installed. The model is far away and only ever reads text and writes text. Everything else happens in here, on your machine.',
					'At its heart is a loop. Around it sit the parts you met from outside: the four drawers, the cables, and the tools.'
				],
				note: {
					claude: 'It’s one program. The terminal, the VS Code extension and the desktop app all run this same loop.',
					codex: 'The loop is an engine of its own. The terminal runs it inside; the editor and the desktop app talk to it over JSON-RPC.',
					copilot: 'Since mid-2026 the loop runs in a process of its own, the Agent Host, which can even live on another machine.'
				}
			},
			{
				title: 'Round and round',
				body: [
					'Every turn is the same few steps. Pack everything into one request and send it. Read the reply as it streams in. If it asks for a tool, check the call and run it. Write down what happened, and go round again.',
					'A real fix takes five to thirty turns. It stops when a reply comes back without asking for a tool.'
				]
			},
			{
				title: 'Packed fresh, every turn',
				body: [
					'Each turn the whole request is built again: the harness’s own instructions, your project’s rules, a snapshot of where you are, every tool, and the conversation so far.',
					'The parts that never change go first, so the provider can reuse its work on them. [[Skills]] wait on their shelf as a name and a line each, and only the one the task needs is unpacked.'
				],
				note: {
					claude: 'Rules come from CLAUDE.md, and skills from .claude/skills. Whatever changes travels as a note at the end, so the start stays the same.',
					codex: 'Rules come from AGENTS.md, read once at the start, which is why a change to it needs a restart. Skills live in .agents/skills.',
					copilot: 'The prompt is rebuilt every turn, with the fixed parts first. Skills are SKILL.md folders, shared with Copilot CLI.'
				}
			},
			{
				title: 'Asking is not doing',
				body: [
					'When a reply asks for a tool, nothing runs yet. The call goes to a gate first: is it allowed, does it need you, or is it refused?',
					'Your [[hooks]] plug in here. They’re your own scripts, run at fixed moments: before a tool runs, after it runs, and when the agent stops. One that runs first can block a call or change it.'
				],
				note: {
					claude: 'Hooks can catch every step, from PreToolUse and PostToolUse to Stop and PreCompact.',
					codex: 'Rules in execpolicy do that job for commands, and an approval policy decides when to ask you.',
					copilot: 'Hooks are set in the agent’s customization settings, and a confirmation card asks you before risky steps.'
				}
			},
			{
				title: 'Everything is written down',
				body: [
					'Each step goes into the [[transcript]], and the transcript is saved, so a session can be picked up again later.',
					'When the conversation grows too long for the [[context window]], a summary takes the place of the older messages in what’s sent, and the latest turns stay as they were. The saved transcript keeps all of them.'
				],
				note: {
					claude: 'Sessions are saved as files under ~/.claude/projects, and claude --resume picks one up again.',
					codex: 'Sessions are saved under ~/.codex/sessions, and codex resume picks one up again.',
					copilot: 'VS Code keeps the chat sessions, and Agent Host sessions outlive closing the folder.'
				}
			},
			{
				title: 'A loop inside the loop',
				body: [
					'A big side quest can go to a [[subagent]]: a smaller loop with its own context and its own tools. It gets a brief, does the work, and hands back a summary, and only the summary joins the parent’s context.',
					'It works on the same files as everyone else, unless it’s given its own copy. And what it reports still needs checking before anything is built on it.'
				],
				note: {
					claude: 'The Agent tool starts one: an explorer, a planner, a general worker or one of your own, and it can work in its own git worktree.',
					codex: 'Multi-agent mode runs several at once, and each can work in its own worktree.',
					copilot: 'Custom agents can hand work to one another, and a session can run in its own worktree.'
				}
			}
		]
	},
	mcp: {
		name: 'How MCP connects',
		what: 'How an outside program lends the agent new tools.',
		cards: [
			{
				title: 'A server is its own program',
				body: [
					'Anyone can plug new tools into an agent through [[MCP]]. The blue box is an MCP server: a separate program, here one that serves a library’s documentation.',
					'A local server runs on your laptop and talks to the harness through its input and output. A remote one is reached over the internet. Either way, every message is [[JSON-RPC]]: run this method, with these parameters.'
				],
				note: {
					claude: 'Servers come from your settings, the project’s .mcp.json or your organization. Claude Code is only ever the client.',
					codex: 'Servers are listed in config.toml. Codex can also be a server itself, so one agent can drive another.',
					copilot: 'Servers come from .vscode/mcp.json or your settings. GitHub’s hosted connectors work like servers you don’t have to run.'
				}
			},
			{
				title: 'It says what it offers',
				body: [
					'The harness asks for the list. Back comes every tool: a name, a sentence about what it does, and a [[JSON Schema]] for its arguments.',
					'They go in the Tools drawer beside the built-in ones. The model reads that drawer on every turn, so each tool costs tokens. That’s why many harnesses send only the names until a tool is needed.'
				],
				note: {
					claude: 'They arrive named after their server, like mcp__docs__search_docs, and wait as names until ToolSearch fetches the rest.',
					codex: 'They join the tools in the request. OpenAI’s API can also add tools later on, after the part that’s cached.',
					copilot: 'They join the built-in tools in the same picker, and you can tick each one on or off.'
				}
			},
			{
				title: 'The model asks, the harness calls',
				body: [
					'When the model wants the docs on locking, it writes a tool call like any other: a name and some arguments. That’s all the model can do.',
					'The harness checks the call the way it checks every call, then sends it down the cable. The server does the work. The model never talks to it.'
				]
			},
			{
				title: 'The answer is just more text',
				body: [
					'The server replies with blocks of content. The harness files them in the conversation as the tool’s result, and the next request carries them to the model.',
					'If the tool failed, the model reads that and can try something else. If the connection failed, the model never hears of it: the harness retries, or tells you.',
					'And it’s text nobody checked, so it’s handled like a fetched web page.'
				]
			},
			{
				title: 'Tools are one of three',
				body: [
					'Tools are actions the model can ask for. Resources are things to read, such as a file or a table. Prompts are ready-made requests, often offered to you as slash commands.',
					'Only tools are the model’s to call. The app, or you, decides when resources and prompts come in.'
				]
			}
		]
	}
};

