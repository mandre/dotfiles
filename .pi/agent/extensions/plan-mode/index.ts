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
		} else {
			restoreActiveTools();
			ctx.ui.notify("Plan mode disabled. Full access restored.");
		}
		updateStatus(ctx);
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

	// Block destructive bash commands in plan mode
	pi.on("tool_call", async (event) => {
		if (!planModeEnabled || event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason: `Plan mode: command blocked (not allowlisted). Use /plan to disable plan mode first.\nCommand: ${command}`,
			};
		}
	});

	// Filter out stale plan mode context when not in plan mode,
	// and inject per-turn step reminders during execution.
	pi.on("context", async (event) => {
		if (planModeEnabled) return;

		let messages = event.messages.filter((m) => {
			const msg = m as AgentMessage & { customType?: string };
			if (msg.customType === "plan-mode-context") return false;
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

		// During execution, append a brief per-turn reminder of remaining steps
		if (executionMode && todoItems.length > 0) {
			const remaining = todoItems.filter((t) => !t.completed);
			if (remaining.length > 0) {
				const stepList = remaining.map((t) => `${t.step}. ${t.text}`).join(", ");
				messages = [
					...messages,
					{
						role: "user" as const,
						content: `[Remaining plan steps: ${stepList}. Mark each completed step with [DONE:n].]`,
						timestamp: Date.now(),
					},
				];
			}
		}

		return { messages };
	});

	// Inject plan/execution context before agent starts
	pi.on("before_agent_start", async (event) => {
		if (planModeEnabled) {
			const tools = event.systemPromptOptions.selectedTools ?? [];
			const toolList = tools.length > 0 ? tools.join(", ") : "none";
			return {
				message: {
					customType: "plan-mode-context",
					content: `[PLAN MODE ACTIVE]
You are in plan mode - a read-only exploration mode for safe code analysis.

Restrictions:
- Available tools: ${toolList}
- File modifications are disabled (edit and write are not available)
- Bash is restricted to an allowlist of read-only commands

Ask clarifying questions using the questionnaire tool.
Use brave-search skill via bash for web research.

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

Do NOT attempt to make changes - just describe what you would do.`,
					display: false,
				},
			};
		}

		if (executionMode && todoItems.length > 0) {
			const remaining = todoItems.filter((t) => !t.completed);
			const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `[EXECUTING PLAN - Full tool access enabled]

Remaining steps:
${todoList}

Execute each step in order.

IMPORTANT: After completing each step, you MUST include a [DONE:n] marker in your response text, where n is the step number. For example, after finishing step 2, write [DONE:2]. This updates the progress tracker widget. Do not skip this marker.`,
					display: false,
				},
			};
		}
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
