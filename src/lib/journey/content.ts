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
export const CALLS: Record<HarnessId, { search: string; edit: string; test: string; pieces: string[] }> = {
	claude: {
		search: 'Grep("lock|schedule", src/)',
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
		edit: 'editFiles(src/scheduler.py)',
		test: 'runTerminal(pytest tests/test_scheduler.py -x)',
		pieces: ['text', 'Search', '{"', 'query', '":"', 'lock', '|', 'schedule', '"}']
	}
};

/** Plain definitions for the words a reader may not know. Keys are lowercase; copy marks them with [[term]]. */
export const GLOSSARY: Record<string, string> = {
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
	classifiers: 'Small models that sort text into categories. Here: fine to show, or not.',
	'prompt injection': 'Text in a file or web page written to trick a model into obeying it as if you had said it.',
	seatbelt: 'macOS’s built-in way to fence a program in. Bubblewrap does the same job on Linux. Anything the program starts stays inside the fence.',
	sandbox: 'A fence around a process: it can only touch the files and network it has been allowed.',
	'system call': 'How a program asks the operating system to do real work, like opening a file or starting a process.',
	atomically: 'All or nothing. Anyone looking sees the old file or the new one, never something in between.',
	hunk: 'One changed block in a diff.',
	'stdout, stderr and the exit code': 'A command’s normal output, its error output, and a number saying how it went. Zero means fine.',
	classifier: 'A small model that reads each call and judges whether it’s safe to run without asking you.',
	rlock: 'A lock the thread holding it can take again without waiting for itself. A plain lock would wait forever here.',
	deadlocks: 'When a program waits forever for something that can never happen. Here, a thread waits for a lock it is already holding.',
	pty: 'A pretend terminal a program can run inside, so it keeps going as if someone were watching.',
	stateless: 'The server keeps nothing between requests, so each request has to carry everything.',
	transcript: 'The full record of this session: every message, tool call and result.',
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

type PerAgent = Record<HarnessId, string>;
const edited: PerAgent = { claude: 'Approved and written.', codex: 'Inside the workspace, so it’s written without asking.', copilot: 'Another diff opens for review.' };
const runs = (args: string): PerAgent => ({ claude: `Bash(pytest${args})`, codex: `shell: pytest${args}`, copilot: `runTerminal(pytest${args})` });

/**
 * The fix, turn by turn. Token counts are the book's, for Claude Code, and illustrative. Marked terms are in the glossary.
 * sees: what is new in the request. thinks: the model's short reasoning. calls: what it asks for. after: what the harness does.
 */
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
		parts: ['The transformer', 'A place for every word', 'Attention', 'All of them, at once', 'Then each token, by itself', 'Then again, eighty times', 'One score for every word', 'One token is chosen', 'One at a time', 'A tool call is born', 'Only text comes back']
	},
	{ name: 'Your laptop again', what: 'The reply is only text. The harness decides what it may do.', parts: ['The model has no hands', 'Intent is not authority', 'When the page lies'] },
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
	{ name: 'Stream', what: 'Only text comes back. The model has touched nothing.' },
	{ name: 'Authorize', what: 'The harness checks what the reply asks for, gate by gate.' },
	{ name: 'Act', what: 'The tools run on your machine, and what they find is real.' },
	{ name: 'Loop', what: 'The results go back as context, and round it goes until the tests pass.' }
];
