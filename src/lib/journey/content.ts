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
