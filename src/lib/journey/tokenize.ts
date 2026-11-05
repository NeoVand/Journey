import type { Tiktoken } from 'js-tiktoken/lite';

export interface Piece {
	id: number;
	text: string;
	/** This token holds only some of the bytes of one character, as long emoji and many scripts do. */
	partial: boolean;
}

let loading: Promise<Tiktoken> | undefined;

/** The vocabulary is a couple of megabytes, so it only comes when someone asks for it. */
export function loadTokenizer() {
	loading ??= (async () => {
		const [{ Tiktoken }, { default: ranks }] = await Promise.all([import('js-tiktoken/lite'), import('js-tiktoken/ranks/o200k_base')]);
		return new Tiktoken(ranks);
	})().catch((error) => {
		// So the next attempt really tries again.
		loading = undefined;
		throw error;
	});
	return loading;
}

/** Text that happens to look like a control marker gets cut like any other text: only the chat template can add real ones. */
export function cut(tokenizer: Tiktoken, text: string): Piece[] {
	return tokenizer.encode(text, [], []).map((id) => {
		const piece = tokenizer.decode([id]);
		return { id, text: piece, partial: piece.includes('�') };
	});
}
