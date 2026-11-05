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
		pieces: ['Grep', '("', 'lock', '|', 'schedule', '",', ' src', '/', '")']
	},
	codex: {
		search: 'shell(rg -n "lock|schedule" src/)',
		edit: 'apply_patch(*** Update File: src/scheduler.py)',
		test: 'shell(pytest tests/test_scheduler.py -x)',
		pieces: ['shell', '("', 'rg', ' -n', ' lock', ' src', '/', '")']
	},
	copilot: {
		search: 'textSearch("lock|schedule")',
		edit: 'editFiles(src/scheduler.py)',
		test: 'runTerminal(pytest tests/test_scheduler.py -x)',
		pieces: ['text', 'Search', '("', 'lock', '|', 'schedule', '")']
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
	deadlocks: 'When a program waits forever for something that can never happen. Here, a thread waits for a lock it is already holding.',
	pty: 'A pretend terminal a program can run inside, so it keeps going as if someone were watching.',
	stateless: 'The server keeps nothing between requests, so each request has to carry everything.',
	transcript: 'The full record of this session: every message, tool call and result.',
	'context window': 'The most a model can take in at once, measured in tokens. Think of it as the size of its desk.'
};
