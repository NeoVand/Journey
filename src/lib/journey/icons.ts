/**
 * Which Hugeicons stand for what on the page. Kept apart from `content.ts`, which stays plain words and numbers.
 * Draw them with `Icon.svelte`.
 */
import {
	AiBrain01Icon,
	ArrowDataTransferHorizontalIcon,
	BubbleChatIcon,
	Cabinet01Icon,
	Cancel01Icon,
	ChatGptIcon,
	CheckmarkBadge01Icon,
	ClaudeIcon,
	CodeSquareIcon,
	CubeIcon,
	DashboardSpeed01Icon,
	DiceFaces03Icon,
	File01Icon,
	Folder01Icon,
	FolderLockedIcon,
	GitForkIcon,
	GithubIcon,
	Globe02Icon,
	IdVerifiedIcon,
	Idea01Icon,
	LaptopIcon,
	LaptopProgrammingIcon,
	MapsIcon,
	McpServerIcon,
	RepeatIcon,
	ServerStack01Icon,
	SecurityLockIcon,
	ServerStack02Icon,
	Shield01Icon,
	SquareUnlock02Icon,
	UserQuestion01Icon,
	Wallet01Icon,
	Wrench01Icon
} from '@hugeicons/core-free-icons';
import type { HarnessId, TrackId } from './content';

/**
 * Each agent carries its maker's mark. Codex has no mark of its own in the set, so it carries OpenAI's, and the set's
 * Copilot icon is Microsoft's Copilot, not GitHub's, so Copilot in VS Code carries GitHub's.
 */
export const AGENT_MARK: Record<HarnessId, typeof ClaudeIcon> = { claude: ClaudeIcon, codex: ChatGptIcon, copilot: GithubIcon };

/** The same four marks as on the harness's drawers in the scene. */
export const DRAWER_ICON = [File01Icon, CubeIcon, Wrench01Icon, BubbleChatIcon];

/** The front door: decrypt, who are you, rate limit, budget, capacity. */
export const CHECK_ICON = [SquareUnlock02Icon, IdVerifiedIcon, DashboardSpeed01Icon, Wallet01Icon, ServerStack01Icon];

/** The gates on your laptop: valid shape, allowed path, policy, you. */
export const GATE_ICON = [CodeSquareIcon, FolderLockedIcon, Shield01Icon, UserQuestion01Icon];

/** The map's nine stops, from your head to done. */
export const STOP_ICON = [Idea01Icon, LaptopIcon, Globe02Icon, ServerStack02Icon, AiBrain01Icon, LaptopProgrammingIcon, Folder01Icon, RepeatIcon, CheckmarkBadge01Icon];

export { ArrowDataTransferHorizontalIcon as SWAP, Cancel01Icon as CLOSE, DiceFaces03Icon as SPIN, MapsIcon as MAP, RepeatIcon as AGAIN };

/** Each side trip's own mark, on every button that leads to it. */
export const TRACK_ICON: Record<TrackId, typeof ClaudeIcon> = { mcp: McpServerIcon, harness: Cabinet01Icon, sandbox: SecurityLockIcon, memory: GitForkIcon };
