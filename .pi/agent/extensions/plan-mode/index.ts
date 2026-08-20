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
 * - [DONE:n] markers to complete steps during execution
 * - Progress tracking widget during execution
 *
 * Safe command allowlist includes:
 *   File inspection: cat, head, tail, less, more, strings, hexdump, xxd
 *   Search: grep, find, rg, fd
 *   Directory: ls, pwd, tree, basename, dirname, realpath, readlink
 *   Text processing: wc, sort, uniq, diff, tr, cut, tac, column, xargs,
 *     awk, sed -n, jq
 *   Git (read-only): status, log, diff, show, branch, remote, ls-files,
 *     merge-base, for-each-ref, rev-parse, stash list/show
 *     (supports -C <path> and --no-pager flags)
 *   GitHub CLI (read-only): pr/issue view/list/diff/checks/status/search/review,
 *     auth status, api (GET only), run download
 *   Jira CLI (acli): workitem view/search, component list, auth status,
 *     project list/view, and all --help invocations
 *   Google Workspace (gws): +read, get, list, schema, export, download
 *   Python: python3 (for data processing / calculations)
 *   Go: list, version, doc, env, vet, mod graph/verify/why
 *   Web: curl, brave-search
 *   Package info: npm list/outdated, yarn info/audit, pip list/show/freeze,
 *     uv pip list/show/tree, uv lock --dry-run
 *   System info: uname, whoami, date, uptime, ps, free, df, du, getconf
 *   Ansible: ansible-lint
 *   Crypto/encoding: openssl, base64, sha256sum, md5sum
 *   Cloud storage: gsutil ls/cat/stat/du
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AutocompleteItem, Key, truncateToWidth } from "@earendil-works/pi-tui";
import { extractTodoItems, isSafeCommand, markCompletedSteps, type TodoItem } from "./utils.js";

// Tools
const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire"];

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

export default function planModeExtension(pi: ExtensionAPI): void {
	let planModeEnabled = true;
	let executionMode = false;
	let todoItems: TodoItem[] = [];
	let savedActiveTools: string[] | null = null;
	// Ensures the ephemeral execution reminder (injected in the "context" hook,
	// which fires before every LLM call in the tool loop) is only added once per
	// agent run instead of once per tool-call round trip. Reset in
	// before_agent_start, which fires once per user prompt.
	let reminderInjectedThisRun = false;
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
		const tools = savedActiveTools ?? pi.getAllTools().map((t) => t.name);
		pi.setActiveTools(tools);
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
			savedActiveTools = pi.getActiveTools();
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
			todos: todoItems,
			executing: executionMode,
		});
	}

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
			const list = todoItems.map((item, i) => `${i + 1}. ${item.completed ? "✓" : "○"} ${item.text}`).join("\n");
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
			if (!Number.isFinite(stepNum) || stepNum < 1) {
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
			item.completed = true;
			updateStatus(ctx);
			persistState();
			ctx.ui.notify(`Step ${stepNum} marked as done.`, "success");

			if (todoItems.every((t) => t.completed)) {
				const completedList = todoItems.map((t) => `~~${t.text}~~`).join("\n");
				pi.sendMessage(
					{ customType: "plan-complete", content: `**Plan Complete!** ✓\n\n${completedList}`, display: true },
					{ triggerTurn: false },
				);
				executionMode = false;
				todoItems = [];
				restoreActiveTools();
				updateStatus(ctx);
				persistState();
			}
		},
	});

	pi.registerCommand("execute", {
		description: "Execute the current plan (exit plan mode, start tracking)",
		handler: async (_args, ctx) => {
			if (todoItems.length === 0) {
				ctx.ui.notify("No plan extracted yet. Ask the agent to create a plan first.", "warning");
				return;
			}
			planModeEnabled = false;
			executionMode = true;
			restoreActiveTools();
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

	// Block destructive bash commands in plan mode. Never in non-TUI runs (see
	// session_start): there is no human to toggle plan mode off there.
	pi.on("tool_call", async (event, ctx) => {
		if (!planModeEnabled || ctx.mode !== "tui" || event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
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

		// Execution mode: append ephemeral remaining-steps reminder at the end,
		// but only once per agent run (context fires on every LLM call inside the
		// tool loop, so without this guard the reminder would repeat after every
		// tool result within a single run).
		if (!planModeEnabled && executionMode && todoItems.length > 0 && !reminderInjectedThisRun) {
			const remaining = todoItems.filter((t) => !t.completed);
			if (remaining.length > 0) {
				const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
				messages = [
					...messages,
					{
						role: "user" as const,
						content: `[Plan execution status]

Remaining steps:
${todoList}

Execute each step in order. After completing a step, include a [DONE:n] marker in your response (e.g. [DONE:2]) to update the progress tracker.`,
						timestamp: Date.now(),
					},
				];
				reminderInjectedThisRun = true;
			}
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

	// Inject stable plan-mode instructions into the system prompt (most cache-
	// efficient position — identical every turn, no persistent messages created).
	pi.on("before_agent_start", async (event, ctx) => {
		// Reset once per run (before_agent_start fires once per user prompt,
		// unlike "context" which fires on every LLM call in the tool loop).
		reminderInjectedThisRun = false;
		blockedBashCallsThisRun = 0;

		// Never activate in non-TUI runs (see session_start) — there's no human
		// able to run /execute, /plan, or answer questionnaire prompts, so a
		// headless sub-agent forced into "just describe a Plan" mode can never
		// actually finish its task.
		if (!planModeEnabled || ctx.mode !== "tui") return;

		const toolList = PLAN_MODE_TOOLS.join(", ");
		return {
			systemPrompt: `${event.systemPrompt}

[PLAN MODE ACTIVE]
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
Use brave-search skill via bash for web research.

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

Do NOT attempt to make changes - just describe what you would do.`,
		};
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

	// Track progress after each turn (tools have completed)
	pi.on("turn_end", async (event, ctx) => {
		// Restore default working message for both plan and execution modes
		if (planModeEnabled || executionMode) {
			ctx.ui.setWorkingMessage();
		}
		if (!executionMode || todoItems.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		const marked = markCompletedSteps(text, todoItems);

		// Fallback heuristic: if no explicit markers were detected but
		// mutating tools (edit, write) were used, mark the first uncompleted step.
		if (marked === 0 && event.toolResults && event.toolResults.length > 0) {
			const hasMutatingWork = event.toolResults.some(
				(tr: { toolName?: string }) => tr.toolName === "edit" || tr.toolName === "write",
			);
			if (hasMutatingWork) {
				const firstIncomplete = todoItems.find((t) => !t.completed);
				if (firstIncomplete) {
					firstIncomplete.completed = true;
				}
			}
		}

		updateStatus(ctx);
		persistState();
		ctx.ui.setWorkingMessage(); // Restore default
	});

	// Handle plan completion and plan mode UI
	pi.on("agent_end", async (event, ctx) => {
		// Check if execution is complete
		if (executionMode && todoItems.length > 0) {
			if (todoItems.every((t) => t.completed)) {
				const completedList = todoItems.map((t) => `~~${t.text}~~`).join("\n");
				pi.sendMessage(
					{ customType: "plan-complete", content: `**Plan Complete!** ✓\n\n${completedList}`, display: true },
					{ triggerTurn: false },
				);
				const leafId = ctx.sessionManager.getLeafId();
				if (leafId) {
					pi.setLabel(leafId, "plan-complete");
				}
				executionMode = false;
				todoItems = [];
				restoreActiveTools();
				updateStatus(ctx);
				persistState(); // Save cleared state so resume doesn't restore old execution mode
			}
			return;
		}

		if (!planModeEnabled || ctx.mode !== "tui") return;

		// Extract todos from last assistant message
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const extracted = extractTodoItems(getTextContent(lastAssistant));
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
			}
		}
		// Plan mode stays active until manually toggled off via /plan, Alt+P, or /execute
	});

	// Restore state on session start/resume
	pi.on("session_start", async (_event, ctx) => {
		// Plan mode is an interactive, human-in-the-loop safety net (/execute,
		// /done, widgets, notifications, /plan to escape). It has no meaningful
		// way to be toggled off in non-TUI runs — for example, headless
		// `--mode json`/`-p` sub-agents spawned by other extensions — so never
		// activate it there. Those runs always get full tool access.
		if (ctx.mode !== "tui") {
			planModeEnabled = false;
			executionMode = false;
			todoItems = [];
			return;
		}

		if (pi.getFlag("plan") === true) {
			planModeEnabled = true;
		}

		const entries = ctx.sessionManager.getEntries();

		// Restore persisted state
		const planModeEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as { data?: { enabled: boolean; todos?: TodoItem[]; executing?: boolean } } | undefined;

		if (planModeEntry?.data) {
			planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
			todoItems = planModeEntry.data.todos ?? todoItems;
			executionMode = planModeEntry.data.executing ?? executionMode;
		}

		// On resume: re-scan messages to rebuild completion state
		// Only scan messages AFTER the last "plan-mode-execute" to avoid picking up [DONE:n] from previous plans
		const isResume = planModeEntry !== undefined;
		if (isResume && executionMode && todoItems.length > 0) {
			// Find the index of the last plan-mode-execute entry (marks when current execution started)
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as { type: string; customType?: string };
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					break;
				}
			}

			// Only scan messages after the execute marker
			const messages: AssistantMessage[] = [];
			for (let i = executeIndex + 1; i < entries.length; i++) {
				const entry = entries[i];
				if (entry.type === "message" && "message" in entry && isAssistantMessage(entry.message as AgentMessage)) {
					messages.push(entry.message as AssistantMessage);
				}
			}
			const allText = messages.map(getTextContent).join("\n");
			markCompletedSteps(allText, todoItems);
		}

		if (planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
		}
		updateStatus(ctx);
	});
}
