/**
 * Plan Mode Extension
 *
 * Read-only exploration mode for safe code analysis.
 * When enabled, only read-only tools are available.
 *
 * Features:
 * - /plan command or Alt+P to toggle
 * - Bash restricted to allowlisted read-only commands
 * - Command normalization: `cd <path> &&` prefixes, leading `# comments`,
 *   and absolute binary paths (e.g. /usr/bin/curl) are stripped before matching
 * - `--help` on any command is always allowed (help output never modifies anything)
 * - Extracts numbered plan steps from "Plan:" sections
 * - Explicit plan_progress updates to complete steps during execution
 * - Progress tracking widget during execution
 *
 * Safe command allowlist includes:
 *   File inspection: cat, head, tail, less, more, strings, hexdump, xxd
 *   Search: grep, find, rg, fd
 *   Directory: ls, pwd, tree, basename, dirname, realpath, readlink
 *   Text processing: wc, sort, uniq, diff, tr, cut, tac, column, xargs,
 *     awk, sed -n, jq
 *   Git (read-only): status, log, diff, show, branch, remote, ls-files,
 *     merge-base, for-each-ref, rev-parse, tag (listing), stash list/show,
 *     config --get/--get-all/--list/--show-origin (with --global/--local/etc.)
 *     (supports -C <path> and --no-pager flags)
 *   GitHub CLI (read-only): pr/issue view/list/diff/checks/status/search/review,
 *     auth status, api (GET only), run download
 *   Jira CLI (acli): workitem view/search, component list, auth status,
 *     project list/view, and all --help invocations
 *   Google Workspace (gws): +read, get, list, schema, export, download
 *   Python: python3 (for data processing / calculations)
 *   Go: list, version, doc, env, vet, mod graph/verify/why
 *   Web: curl, web_search, web_fetch
 *   Documentation: man
 *   Package info: npm list/outdated, yarn info/audit, pip list/show/freeze,
 *     uv pip list/show/tree, uv lock --dry-run, rpm -q/-V/--query/--verify
 *   System info: uname, whoami, date, uptime, ps, free, df, du, getconf
 *   Ansible: ansible-lint
 *   Crypto/encoding: openssl, base64, sha256sum, md5sum
 *   Cloud storage: gsutil ls/cat/stat/du
 *
 * Universal overrides (always allowed regardless of command):
 *   --help, --version
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AutocompleteItem, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { completeSteps, extractTodoItems, isSafeCommand, type TodoItem } from "./utils.js";

// Enforce the same allowlist for direct and nested calls, regardless of exposure.
const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire", "web_search", "web_fetch", "codemode"];
const PLAN_MODE_TOOL_NAMES = new Set(PLAN_MODE_TOOLS);

// Type guard for assistant messages
function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

// Extract text content from an assistant message
function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

const PROGRESS_TOOL = "plan_progress";
const EXECUTION_INSTRUCTIONS = `After successfully completing work, call plan_progress with action "complete" and
updates containing each completed step number and a brief evidence explanation.
One edit may complete several steps. Verify every requirement of each step first.
Call the tool after the work succeeds, not alongside work whose result is still unknown.
Use action "list" to inspect progress. The tool is also callable from codemode.
Before your final response, reconcile progress with actual work. Leave blocked,
failed, partial, or unperformed steps unchecked and explain what remains.
Prose, [DONE:n] markers, and attempted tool calls do not update the tracker.`;

export default function planModeExtension(pi: ExtensionAPI): void {
	let planModeEnabled = true;
	let executionMode = false;
	let todoItems: TodoItem[] = [];
	let savedActiveTools: string[] | null = null;
	let reconciliationRequested = false;
	// Counts consecutive blocked bash calls within the current agent run, so the
	// block reason can escalate if the model keeps probing for a workaround
	// instead of stopping. Reset in before_agent_start (once per user prompt).
	let blockedBashCallsThisRun = 0;
	// Set by togglePlanMode() when the mode is flipped mid-conversation (not at
	// session start). Injected once, as an ephemeral message, by the "context"
	// hook for the very next LLM call, then cleared — this makes the mode
	// change visible in the recent transcript rather than only in the system
	// prompt, since models can otherwise discount a system-prompt change against
	// vivid recent tool-call history from before the toggle.
	let pendingModeChangeNotice: string | null = null;

	/** Restore the tool set that was active before plan mode was entered. */
	function restoreActiveTools(): void {
		const tools = savedActiveTools ?? pi.getAllTools()
			.filter((t) => t.exposure === "direct" || t.exposure === "model-only" || t.exposure === undefined)
			.map((t) => t.name);
		pi.setActiveTools(tools.filter((name) => name !== PROGRESS_TOOL));
		savedActiveTools = null;
	}

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	function updateStatus(ctx: ExtensionContext): void {
		// Footer status
		if (executionMode && todoItems.length > 0) {
			const completed = todoItems.filter((t) => t.completed).length;
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", `📋 ${completed}/${todoItems.length}`));
		} else if (planModeEnabled) {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", " plan"));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}

		// Widget showing todo list
		if (executionMode && todoItems.length > 0) {
			ctx.ui.setWidget("plan-todos", (_tui, theme) => ({
				render(width: number): string[] {
					return todoItems.map((item) => {
						if (item.completed) {
							return truncateToWidth(
								theme.fg("success", " ") + theme.fg("muted", theme.strikethrough(item.text)),
								width,
							);
						}
						return truncateToWidth(`${theme.fg("muted", "󰄱 ")}${item.text}`, width);
					});
				},
				invalidate() {},
			}));
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		planModeEnabled = !planModeEnabled;
		executionMode = false;
		todoItems = [];

		if (planModeEnabled) {
			savedActiveTools = (savedActiveTools ?? pi.getActiveTools()).filter((name) => name !== PROGRESS_TOOL);
			pi.setActiveTools(PLAN_MODE_TOOLS);
			ctx.ui.notify(`Plan mode enabled. Tools: ${PLAN_MODE_TOOLS.join(", ")}`);
			pendingModeChangeNotice = `[Mode change] Plan mode has just been enabled by the user. Tool access has changed to read-only: ${PLAN_MODE_TOOLS.join(", ")}. Any file-editing access you had earlier in this conversation (e.g. during a previous plan-execution phase) no longer applies. If a tool call is blocked, do not attempt a workaround — describe it as a plan step instead.`;
		} else {
			restoreActiveTools();
			ctx.ui.notify("Plan mode disabled. Full access restored.");
			pendingModeChangeNotice =
				"[Mode change] Plan mode has just been disabled by the user. Full tool access (including edit/write and unrestricted bash) has been restored.";
		}
		updateStatus(ctx);
		persistState();
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: planModeEnabled,
			version: 2,
			todos: todoItems.map((item) => ({ ...item })),
			executing: executionMode,
			savedActiveTools,
		});
	}

	function finishExecution(ctx: ExtensionContext): void {
		if (!executionMode || todoItems.length === 0 || !todoItems.every((t) => t.completed)) return;
		const completedList = todoItems.map((t) => `~~${t.text}~~`).join("\n");
		executionMode = false;
		todoItems = [];
		restoreActiveTools();
		updateStatus(ctx);
		persistState();
		pi.sendMessage(
			{ customType: "plan-complete", content: `**Plan Complete!** ✓\n\n${completedList}`, display: true },
			{ triggerTurn: false },
		);
		const leafId = ctx.sessionManager.getLeafId();
		if (leafId) pi.setLabel(leafId, "plan-complete");
	}

	pi.registerTool({
		name: PROGRESS_TOOL,
		label: "Plan progress",
		description: "List plan tasks or explicitly complete steps after successful work. Each update requires a step number and evidence. Supports multiple steps per call.",
		exposure: "codemode",
		executionMode: "sequential",
		parameters: Type.Object({
			action: Type.Union([Type.Literal("list"), Type.Literal("complete")]),
			updates: Type.Optional(Type.Array(Type.Object({
				step: Type.Integer({ minimum: 1 }),
				evidence: Type.String({ minLength: 1 }),
			}), { minItems: 1 })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			if (!executionMode || planModeEnabled || ctx.mode !== "tui") throw new Error("No active plan execution.");
			if (params.action === "complete") {
				completeSteps(todoItems, params.updates ?? []);
				updateStatus(ctx);
				persistState();
			}
			const todos = todoItems.map((item) => ({ ...item }));
			return {
				content: [{ type: "text", text: todos.map((t) => `${t.step}. [${t.completed ? "x" : " "}] ${t.text}`).join("\n") }],
				details: { todos },
			};
		},
	});

	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only exploration)",
		handler: async (_args, ctx) => togglePlanMode(ctx),
	});

	pi.registerCommand("todos", {
		description: "Show current plan todo list",
		handler: async (_args, ctx) => {
			if (todoItems.length === 0) {
				ctx.ui.notify("No todos. Create a plan first with /plan", "info");
				return;
			}
			const list = todoItems.map((item) => `${item.step}. ${item.completed ? "✓" : "○"} ${item.text}`).join("\n");
			ctx.ui.notify(`Plan Progress:\n${list}`, "info");
		},
	});

	pi.registerCommand("done", {
		description: "Mark a plan step as completed (e.g. /done 3)",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const items = todoItems
				.filter((t) => !t.completed)
				.map((t) => ({
					value: String(t.step),
					label: `Step ${t.step}`,
					description: t.text,
				}));
			const filtered = items.filter((i) => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			if (!executionMode || todoItems.length === 0) {
				ctx.ui.notify("No active plan execution.", "warning");
				return;
			}
			const stepNum = Number(args?.trim());
			if (!Number.isInteger(stepNum) || stepNum < 1) {
				ctx.ui.notify("Usage: /done <step number>", "warning");
				return;
			}
			const item = todoItems.find((t) => t.step === stepNum);
			if (!item) {
				ctx.ui.notify(`Step ${stepNum} not found.`, "warning");
				return;
			}
			if (item.completed) {
				ctx.ui.notify(`Step ${stepNum} already completed.`, "info");
				return;
			}
			completeSteps(todoItems, [{ step: stepNum, evidence: "Manually confirmed via /done." }]);
			updateStatus(ctx);
			persistState();
			ctx.ui.notify(`Step ${stepNum} marked as done.`, "success");

			finishExecution(ctx);
		},
	});

	pi.registerCommand("execute", {
		description: "Execute the current plan (exit plan mode, start tracking)",
		handler: async (_args, ctx) => {
			// Re-sync against the latest assistant message before executing: the
			// passive agent_end extraction can miss a plan restatement (e.g. a
			// header phrasing it doesn't recognize), silently leaving `todoItems`
			// stale. /execute should always run the freshest plan in the transcript.
			const entries = ctx.sessionManager.getBranch();
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as { type: string; message?: AgentMessage };
				if (entry.type === "message" && entry.message && isAssistantMessage(entry.message)) {
					const extracted = extractTodoItems(getTextContent(entry.message));
					if (extracted.length > 0) {
						todoItems = extracted;
					}
					break;
				}
			}

			if (todoItems.length === 0) {
				ctx.ui.notify("No plan extracted yet. Ask the agent to create a plan first.", "warning");
				return;
			}

			// Show the exact steps about to run so a stale/misparsed plan is
			// visible before committing to execution.
			const todoListText = todoItems.map((t) => `${t.step}. ☐ ${t.text}`).join("\n");
			pi.sendMessage(
				{
					customType: "plan-todo-list",
					content: `**Executing plan (${todoItems.length} steps):**\n\n${todoListText}`,
					display: true,
				},
				{ triggerTurn: false },
			);

			planModeEnabled = false;
			executionMode = true;
			reconciliationRequested = false;
			restoreActiveTools();
			savedActiveTools = pi.getActiveTools();
			pi.setActiveTools([...savedActiveTools, PROGRESS_TOOL]);
			updateStatus(ctx);
			persistState();
			const leafId = ctx.sessionManager.getLeafId();
			if (leafId) {
				pi.setLabel(leafId, "plan-execution-start");
			}
			pi.sendMessage(
				{
					customType: "plan-mode-execute",
					content: `Execute the plan. Start with: ${todoItems[0].text}`,
					display: true,
				},
				{ triggerTurn: true },
			);
		},
	});

	pi.registerShortcut("alt+p", {
		description: "Toggle plan mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	// Inactive codemode/deferred tools remain callable, so activation is not a gate.
	// Nested calls emit tool_call too and must pass this allowlist independently.
	pi.on("tool_call", async (event, ctx) => {
		if (!planModeEnabled || ctx.mode !== "tui") return;
		if (!PLAN_MODE_TOOL_NAMES.has(event.toolName)) {
			return {
				block: true,
				reason: `Plan mode is active: tool "${event.toolName}" is not allowlisted. Do not retry through another tool or indirect approach. Describe the intended action as a plan step and wait for the user.`,
			};
		}
		if (event.toolName !== "bash") return;

		const command = event.input.command;
		if (typeof command !== "string" || !isSafeCommand(command)) {
			blockedBashCallsThisRun++;

			const baseReason = `Plan mode is active: this command is intentionally blocked (not allowlisted).\nDo not retry with a different command, tool, or indirect approach (e.g. cp/mv tricks, chaining, or switching to another tool) to achieve the same effect — describe this as a step in your Plan output instead. (A human can run /plan to exit plan mode; you cannot.)`;

			const escalation =
				blockedBashCallsThisRun >= 2
					? `\n\nYou've now hit this restriction ${blockedBashCallsThisRun} times in this turn. Stop trying different commands or tools — none of them will work. Respond with plan text instead (add/update a numbered step describing the intended action) and wait for the user.`
					: "";

			return {
				block: true,
				reason: `${baseReason}${escalation}\nCommand: ${command}`,
			};
		}
	});

	// Filter stale persistent messages (backward compat with old sessions) and
	// inject ephemeral context at the end of the message list (cache-friendly:
	// the conversation prefix stays unchanged across turns).
	pi.on("context", async (event) => {
		// Always filter stale persistent plan/execution messages from prior sessions
		let messages = event.messages.filter((m) => {
			const msg = m as AgentMessage & { customType?: string };
			if (msg.customType === "plan-mode-context") return false;
			if (msg.customType === "plan-execution-context") return false;
			if (msg.role !== "user") return true;

			const content = msg.content;
			if (typeof content === "string") {
				return !content.includes("[PLAN MODE ACTIVE]");
			}
			if (Array.isArray(content)) {
				return !content.some(
					(c) => c.type === "text" && (c as TextContent).text?.includes("[PLAN MODE ACTIVE]"),
				);
			}
			return true;
		});

		// Rebuild request-local status on every model call, including tool-loop turns.
		if (!planModeEnabled && executionMode && todoItems.length > 0) {
			const todoList = todoItems.map((t) => `${t.step}. [${t.completed ? "x" : " "}] ${t.text}`).join("\n");
			messages = [...messages, {
				role: "user" as const,
				content: `[Plan execution status]\n${todoList}\n\n${EXECUTION_INSTRUCTIONS}`,
				timestamp: Date.now(),
			}];
		}

		// Mode was just toggled mid-conversation (via /plan or the shortcut, not at
		// session start): append an ephemeral, one-shot notice for the next LLM call.
		if (pendingModeChangeNotice) {
			messages = [
				...messages,
				{ role: "user" as const, content: pendingModeChangeNotice, timestamp: Date.now() },
			];
			pendingModeChangeNotice = null;
		}

		return { messages };
	});

	// Use a named section so Pi can record prompt deltas instead of a full override.
	pi.on("before_agent_start", async (event, ctx) => {
		// Runs can start from user prompts or extension-triggered custom messages.
		reconciliationRequested = false;
		blockedBashCallsThisRun = 0;

		// Never activate in non-TUI runs (see session_start) — there's no human
		// able to run /execute, /plan, or answer questionnaire prompts, so a
		// headless sub-agent forced into "just describe a Plan" mode can never
		// actually finish its task.
		if (!planModeEnabled || ctx.mode !== "tui") {
			delete event.systemPromptOptions.sections.plan_mode;
			return;
		}

		const toolList = PLAN_MODE_TOOLS.join(", ");
		event.systemPromptOptions.sections.plan_mode = `[PLAN MODE ACTIVE]
You are in plan mode - a read-only exploration mode for safe code analysis.

Restrictions:
- Available tools: ${toolList}
- File modifications are disabled (edit and write are not available)
- Bash is restricted to an allowlist of read-only commands

This restriction is in effect right now, regardless of what tool access you had earlier in
this same conversation (e.g. during a previous plan-execution phase). Do not assume write
access is still available, or has been restored, because it worked in an earlier turn —
plan mode can be toggled on and off mid-conversation, and the current tool list and any
"blocked" tool results always take precedence over conversation history. If a tool call is
blocked, stop immediately: do not retry with a different command, a different tool, or an
indirect workaround to reach the same effect. Just add or update a step in your plan.

Ask clarifying questions using the questionnaire tool.
Use the web_search and web_fetch tools for web research.

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

Do NOT attempt to make changes - just describe what you would do.`;
	});

	// Set contextual working message during planning and execution
	pi.on("turn_start", async (_event, ctx) => {
		if (planModeEnabled && !executionMode) {
			ctx.ui.setWorkingMessage("Planning…");
			return;
		}
		if (!executionMode || todoItems.length === 0) return;
		const nextStep = todoItems.find((t) => !t.completed);
		if (nextStep) {
			ctx.ui.setWorkingMessage(`Executing step ${nextStep.step}: ${nextStep.text}…`);
		}
	});

	pi.on("turn_end", async (_event, ctx) => {
		if (planModeEnabled || executionMode) ctx.ui.setWorkingMessage();
	});

	pi.on("agent_before_settle", async (event, ctx) => {
		if (!executionMode || ctx.mode !== "tui" || event.outcome !== "completed") return;
		finishExecution(ctx);
		if (!executionMode || reconciliationRequested || event.continue || !event.context.canContinue) return;
		reconciliationRequested = true;
		const remaining = todoItems.filter((t) => !t.completed).map((t) => `${t.step}. ${t.text}`).join("\n");
		return {
			entries: [{
				type: "custom_message" as const,
				customType: "plan-reconciliation",
				content: `Reconcile the remaining plan steps with work already performed:\n${remaining}\n\nUse plan_progress to record only verified completions, with evidence. Do not do new work merely to clear the checklist. Leave unfinished steps unchecked and explain blockers or remaining work. This is the only automatic reconciliation pass.`,
				display: false,
			}],
			continue: true,
		};
	});

	// Plan extraction remains separate from execution progress.
	pi.on("agent_end", async (event, ctx) => {
		if (!planModeEnabled || ctx.mode !== "tui") return;

		// Extract todos from last assistant message
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const lastAssistantText = getTextContent(lastAssistant);
			const extracted = extractTodoItems(lastAssistantText);
			if (extracted.length > 0) {
				todoItems = extracted;
				updateStatus(ctx);
				persistState();
				const leafId = ctx.sessionManager.getLeafId();
				if (leafId) {
					pi.setLabel(leafId, `plan-${todoItems.length}-steps`);
				}
				ctx.ui.notify(
					`Plan extracted (${todoItems.length} steps). Use /execute to run, or keep exploring.`,
					"info",
				);
			} else if (todoItems.length > 0) {
				// Extraction failed to find a "Plan:"-style header. If the response still
				// looks like it's restating a numbered plan, warn instead of silently
				// keeping the old tracked plan — otherwise /execute could run stale steps
				// without the user noticing the update never registered.
				const numberedLines = lastAssistantText.match(/^\s*\d+[.)]\s+/gm);
				if (numberedLines && numberedLines.length >= 2) {
					ctx.ui.notify(
						`Plan tracker could not parse an update from that response (no "Plan:" header detected) — still tracking the previous ${todoItems.length}-step plan. Ask for a clean "Plan:" restatement before running /execute, or run /execute anyway to use the last tracked plan.`,
						"warning",
					);
				}
			}
		}
		// Plan mode stays active until manually toggled off via /plan, Alt+P, or /execute
	});

	// Snapshots, including legacy snapshots, are authoritative. Do not replay
	// prose or markers from other plans or abandoned branches.
	function restoreState(ctx: ExtensionContext): void {
		planModeEnabled = ctx.mode === "tui";
		executionMode = false;
		todoItems = [];
		reconciliationRequested = false;
		pendingModeChangeNotice = null;
		const previousTools = savedActiveTools ?? pi.getActiveTools().filter((name) => name !== PROGRESS_TOOL);
		savedActiveTools = null;
		if (ctx.mode !== "tui") {
			pi.setActiveTools(previousTools);
			updateStatus(ctx);
			return;
		}
		const entries = ctx.sessionManager.getBranch();
		const state = entries
			.filter((e) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as { data?: { enabled: boolean; todos?: TodoItem[]; executing?: boolean; savedActiveTools?: string[] | null } } | undefined;
		if (state?.data) {
			planModeEnabled = state.data.enabled ?? true;
			todoItems = (state.data.todos ?? []).map((item) => ({ ...item }));
			executionMode = !planModeEnabled && (state.data.executing ?? false);
		}
		if (planModeEnabled) {
			savedActiveTools = state?.data?.savedActiveTools ?? previousTools;
			pi.setActiveTools(PLAN_MODE_TOOLS);
		} else if (executionMode) {
			savedActiveTools = state?.data?.savedActiveTools ?? previousTools;
			pi.setActiveTools([...savedActiveTools, PROGRESS_TOOL]);
		} else {
			pi.setActiveTools(previousTools);
		}
		updateStatus(ctx);
	}

	pi.on("session_start", async (_event, ctx) => restoreState(ctx));
	pi.on("session_tree", async (_event, ctx) => restoreState(ctx));
}
