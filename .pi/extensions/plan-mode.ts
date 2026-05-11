/**
 * Plan Mode Extension
 *
 * When enabled, blocks all write operations except those targeting /tmp.
 * This lets the agent read, analyze, and plan freely while preventing
 * any modifications to the working tree.
 *
 * Blocked operations:
 * - write tool: blocked unless path is under /tmp
 * - edit tool: blocked unless path is under /tmp
 * - bash tool: blocked if command contains write patterns (redirects, rm, mv, cp,
 *   tee, dd, git write ops, package installs, etc.) unless writing to /tmp
 *
 * Toggle with:
 * - /plan command
 * - Alt+P shortcut
 * - --plan CLI flag
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { resolve } from "node:path";

/** Check if a resolved absolute path is under /tmp */
function isUnderTmp(absolutePath: string): boolean {
	return absolutePath === "/tmp" || absolutePath.startsWith("/tmp/");
}

/** Resolve a tool path argument to an absolute path */
function resolvePath(cwd: string, filePath: string): string {
	const cleaned = filePath.replace(/^@/, "");
	return resolve(cwd, cleaned);
}

/**
 * Patterns that indicate a bash command performs write operations.
 * Each entry has a pattern and an optional description for the block message.
 */
const DESTRUCTIVE_BASH_PATTERNS: Array<{ pattern: RegExp; desc: string }> = [
	// File mutation
	{ pattern: /\brm\b/, desc: "rm" },
	{ pattern: /\brmdir\b/, desc: "rmdir" },
	{ pattern: /\bmv\b/, desc: "mv" },
	{ pattern: /\bcp\b/, desc: "cp" },
	{ pattern: /\bmkdir\b/, desc: "mkdir" },
	{ pattern: /\btouch\b/, desc: "touch" },
	{ pattern: /\bchmod\b/, desc: "chmod" },
	{ pattern: /\bchown\b/, desc: "chown" },
	{ pattern: /\bchgrp\b/, desc: "chgrp" },
	{ pattern: /\bln\b/, desc: "ln" },
	{ pattern: /\btruncate\b/, desc: "truncate" },
	{ pattern: /\bdd\b/, desc: "dd" },
	{ pattern: /\bshred\b/, desc: "shred" },
	{ pattern: /\binstall\b/, desc: "install" },
	// Shell redirects (but not process substitution or heredocs reading)
	{ pattern: /(^|[^<])>/, desc: "shell redirect" },
	// tee writes to files
	{ pattern: /\btee\b/, desc: "tee" },
	// Editors
	{ pattern: /\b(vim?|nano|emacs)\b/, desc: "editor" },
	// sed/awk in-place
	{ pattern: /\bsed\b.*\s-i/, desc: "sed -i" },
	{ pattern: /\bperl\b.*\s-[ip]/, desc: "perl -i/-p" },
	// patch
	{ pattern: /\bpatch\b/, desc: "patch" },
	// Git write operations
	{ pattern: /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|switch|restore|stash|cherry-pick|revert|tag\s|init|clone|am|apply)\b/i, desc: "git write op" },
	// Package managers (install/modify)
	{ pattern: /\bnpm\s+(install|uninstall|update|ci|link|publish|init)\b/i, desc: "npm write op" },
	{ pattern: /\byarn\s+(add|remove|install|publish|init)\b/i, desc: "yarn write op" },
	{ pattern: /\bpnpm\s+(add|remove|install|publish|init)\b/i, desc: "pnpm write op" },
	{ pattern: /\bpip\s+(install|uninstall)\b/i, desc: "pip write op" },
	{ pattern: /\bgo\s+(install|get)\b/i, desc: "go write op" },
	{ pattern: /\bcargo\s+(install|add|remove)\b/i, desc: "cargo write op" },
	// Build tools that produce output
	{ pattern: /\bmake\b/, desc: "make" },
	{ pattern: /\bcmake\b/, desc: "cmake" },
	// System
	{ pattern: /\bsudo\b/, desc: "sudo" },
	{ pattern: /\bsu\s/, desc: "su" },
	{ pattern: /\bkill\b/, desc: "kill" },
	{ pattern: /\bpkill\b/, desc: "pkill" },
	{ pattern: /\bkillall\b/, desc: "killall" },
];

/**
 * Check whether a bash command is purely a write to /tmp.
 * This is a heuristic — if the command *only* redirects to /tmp paths
 * and doesn't touch other files, we allow it.
 */
function bashWritesOnlyToTmp(command: string): boolean {
	// Check all redirect targets: > /tmp/foo, >> /tmp/foo, tee /tmp/foo
	const redirectTargets = [
		...command.matchAll(/>{1,2}\s*(\S+)/g),
		...command.matchAll(/\btee\s+(?:-a\s+)?(\S+)/g),
	];

	if (redirectTargets.length === 0) return false;

	return [...redirectTargets].every(match => {
		const target = match[1];
		return target.startsWith("/tmp/") || target === "/tmp";
	});
}

export default function planMode(pi: ExtensionAPI): void {
	let enabled = true;

	pi.registerFlag("plan", {
		description: "Start in plan mode (no writes except /tmp)",
		type: "boolean",
		default: false,
	});

	function updateStatus(ctx: ExtensionContext): void {
		if (enabled) {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "▸ plan"));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}
	}

	function toggle(ctx: ExtensionContext): void {
		enabled = !enabled;
		if (enabled) {
			ctx.ui.notify("Plan mode ON — writes blocked (except /tmp)", "info");
		} else {
			ctx.ui.notify("Plan mode OFF — full access restored", "info");
		}
		updateStatus(ctx);
	}

	// ── Commands & shortcuts ──────────────────────────────────────

	pi.registerCommand("plan", {
		description: "Toggle plan mode (block writes except /tmp)",
		handler: async (_args, ctx) => toggle(ctx),
	});

	pi.registerShortcut("alt+p", {
		description: "Toggle plan mode",
		handler: async (ctx) => toggle(ctx),
	});

	// ── Gate: intercept tool calls ────────────────────────────────

	pi.on("tool_call", async (event, ctx) => {
		if (!enabled) return;

		// ── write tool ──
		if (isToolCallEventType("write", event)) {
			const abs = resolvePath(ctx.cwd, event.input.path);
			if (isUnderTmp(abs)) return;
			return {
				block: true,
				reason: `Plan mode: write to "${event.input.path}" blocked. Only /tmp is writable. Disable plan mode with /plan.`,
			};
		}

		// ── edit tool ──
		if (isToolCallEventType("edit", event)) {
			const abs = resolvePath(ctx.cwd, event.input.path);
			if (isUnderTmp(abs)) return;
			return {
				block: true,
				reason: `Plan mode: edit of "${event.input.path}" blocked. Only /tmp is writable. Disable plan mode with /plan.`,
			};
		}

		// ── bash tool ──
		if (isToolCallEventType("bash", event)) {
			const command = event.input.command;

			for (const { pattern, desc } of DESTRUCTIVE_BASH_PATTERNS) {
				if (pattern.test(command)) {
					// Allow if the command only writes to /tmp
					if (bashWritesOnlyToTmp(command)) return;

					return {
						block: true,
						reason: `Plan mode: bash command blocked (${desc}). Only /tmp writes are allowed. Disable plan mode with /plan.\nCommand: ${command}`,
					};
				}
			}
		}
	});

	// ── Inject context so the LLM knows about restrictions ───────

	pi.on("before_agent_start", async () => {
		if (!enabled) return;
		return {
			message: {
				customType: "plan-mode-context",
				content: `[PLAN MODE] You are in plan mode. All write operations are blocked except writes to /tmp. You may read, search, and analyze freely. Do NOT attempt to edit or write files outside /tmp — those calls will be rejected. Describe what changes you would make instead.`,
				display: false,
			},
		};
	});

	// ── Filter stale plan-mode context when disabled ─────────────

	pi.on("context", async (event) => {
		if (enabled) return;
		return {
			messages: event.messages.filter((m) => {
				const msg = m as { customType?: string };
				return msg.customType !== "plan-mode-context";
			}),
		};
	});

	// ── Restore state on session start ───────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) {
			enabled = true;
		}
		updateStatus(ctx);
	});
}
