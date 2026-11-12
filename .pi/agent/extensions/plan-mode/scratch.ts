import { randomUUID } from "node:crypto";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { isSafeCommand, normalizeCommand, parseShellCommands } from "./utils.js";
import { isSafeGhCommand } from "./github-policy.js";

export function shellQuote(word: string): string {
	return `'${word.replace(/'/g, "'\\''")}'`;
}

/** Locate one stdout redirect outside shell quotes. All other syntax is checked by the shared parser. */
function splitRedirect(command: string): [string, string] | null {
	let quote = "", at = -1;
	for (let i = 0; i < command.length; i++) {
		const c = command[i];
		if (c === "\\" && quote !== "'") { i++; continue; }
		if (quote) { if (c === quote) quote = ""; continue; }
		if (c === "'" || c === '"') { quote = c; continue; }
		if (";|&\n#".includes(c)) return null;
		if (c === ">") {
			if (at !== -1 || /[0-9&>]$/.test(command.slice(0, i))) return null;
			at = i;
		}
	}
	return !quote && at !== -1 ? [command.slice(0, at), command.slice(at + 1)] : null;
}

/** Per-runtime scratch capability, not a blanket exemption for paths under /tmp. */
export class ScratchSpace {
	readonly root = join(realpathSync(tmpdir()), `pi-plan-${randomUUID()}`);
	private creation?: Promise<void>;

	private ensureRoot(): Promise<void> {
		// mkdir without recursive fails if another process pre-created this path.
		return this.creation ??= mkdir(this.root, { mode: 0o700 });
	}

	/** Return a constrained shell command, or null when this is not an approved scratch operation. */
	async prepare(command: string): Promise<string | null> {
		const simple = parseShellCommands(command);
		if (simple?.length === 1 && simple[0].length === 2 &&
			normalizeCommand(simple[0][0]) === "mktemp" && simple[0][1] === "-d") {
			await this.ensureRoot();
			if (await realpath(this.root) !== this.root) return null;
			return `mktemp -d ${shellQuote(join(this.root, "dir.XXXXXX"))}`;
		}
		const redirect = splitRedirect(command);
		if (!redirect) return null;
		const source = parseShellCommands(redirect[0]), target = parseShellCommands(redirect[1]);
		if (source?.length !== 1 || target?.length !== 1 || target[0].length !== 1 || !isSafeCommand(redirect[0])) return null;
		const args = source[0];
		const binary = normalizeCommand(args[0]);
		const isGhGet = binary === "gh" && args[1] === "api" && isSafeGhCommand(args.slice(1), false);
		const isCurlGet = binary === "curl" && args.slice(1).filter((arg) => !arg.startsWith("-")).length === 1 &&
			args.slice(1).some((arg) => /^https?:\/\//.test(arg));
		if (!isGhGet && !isCurlGet) return null;
		const destination = target[0][0];
		if (!isAbsolute(destination) || destination !== resolve(destination) || !destination.startsWith(this.root + sep)) return null;
		await this.ensureRoot();
		const parent = dirname(destination);
		// Reject symlinked parents, even when their targets are inside the scratch tree.
		if (await realpath(this.root) !== this.root || await realpath(parent) !== parent) return null;
		try { await lstat(destination); return null; }
		catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
		// Noclobber also protects the gap between validation and shell execution.
		return `set -C; ${args.map(shellQuote).join(" ")} > ${shellQuote(destination)}`;
	}
}
