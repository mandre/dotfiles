/**
 * Code Review Extension
 *
 * Provides a /review command and a code_review tool for reviewing code changes.
 *
 * Usage:
 *   /review                          — review staged changes (falls back to unstaged)
 *   /review staged                   — review only staged changes
 *   /review unstaged                 — review only unstaged changes
 *   /review HEAD~3..HEAD             — review a commit range
 *   /review src/utils.ts             — review changes in a specific file
 *   /review https://github.com/owner/repo/pull/123  — review a GitHub PR
 *
 * The code_review tool lets the LLM proactively review changes when asked.
 *
 * Requires: git (always), gh CLI (for PR reviews)
 *
 * Installation:
 *   Copy to ~/.pi/agent/extensions/code-review.ts
 */

import { complete, getModel } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { type AutocompleteItem, Container, Markdown, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Match GitHub PR URLs like https://github.com/owner/repo/pull/123 */
const PR_URL_RE =
	/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/;

function parsePrUrl(url: string): { repo: string; number: number } | undefined {
	const m = url.match(PR_URL_RE);
	if (!m) return undefined;
	return { repo: m[1], number: Number(m[2]) };
}

/** Fetch the diff for a GitHub PR using the gh CLI. */
async function getPrDiff(
	pi: ExtensionAPI,
	repo: string,
	prNumber: number,
	cwd: string,
	signal?: AbortSignal,
): Promise<{ ok: true; diff: string; title: string } | { ok: false; error: string }> {
	// Get PR title for display
	const infoResult = await pi.exec(
		"gh",
		["pr", "view", String(prNumber), "--repo", repo, "--json", "title", "--jq", ".title"],
		{ cwd, timeout: 15_000, signal },
	);
	const title = infoResult.code === 0 ? infoResult.stdout.trim() : `PR #${prNumber}`;

	// Get the diff
	const result = await pi.exec(
		"gh",
		["pr", "diff", String(prNumber), "--repo", repo],
		{ cwd, timeout: 30_000, signal },
	);

	if (result.code !== 0) {
		const detail = result.stderr.trim() || `exit code ${result.code}`;
		return { ok: false, error: `Failed to fetch PR diff: ${detail}` };
	}

	if (!result.stdout.trim()) {
		return { ok: false, error: "PR has no changes" };
	}

	return { ok: true, diff: result.stdout, title };
}

/** Get a local git diff based on scope and optional path filter. */
async function getLocalDiff(
	pi: ExtensionAPI,
	scope: "staged" | "unstaged" | "all",
	path: string | undefined,
	cwd: string,
	signal?: AbortSignal,
): Promise<{ ok: true; diff: string } | { ok: false; error: string }> {
	const args: string[] = ["diff"];

	if (scope === "staged") {
		args.push("--cached");
	} else if (scope === "all") {
		// Show both staged and unstaged
		args.push("HEAD");
	}
	// "unstaged" is just `git diff` with no extra flags

	if (path) {
		args.push("--", path);
	}

	const result = await pi.exec("git", args, { cwd, timeout: 15_000, signal });
	if (result.code !== 0) {
		const detail = result.stderr.trim() || `exit code ${result.code}`;
		return { ok: false, error: `git diff failed: ${detail}` };
	}

	return { ok: true, diff: result.stdout };
}

/** Get a diff for a commit range like HEAD~3..HEAD */
async function getRangeDiff(
	pi: ExtensionAPI,
	range: string,
	cwd: string,
	signal?: AbortSignal,
): Promise<{ ok: true; diff: string } | { ok: false; error: string }> {
	const result = await pi.exec("git", ["diff", range], { cwd, timeout: 15_000, signal });
	if (result.code !== 0) {
		const detail = result.stderr.trim() || `exit code ${result.code}`;
		return { ok: false, error: `git diff failed: ${detail}` };
	}

	return { ok: true, diff: result.stdout };
}

/** Build the code review prompt. */
function buildReviewPrompt(diff: string, focus?: string, prTitle?: string): string {
	const lines: string[] = [];

	lines.push("You are an expert code reviewer. Review the following diff carefully.");
	lines.push("");

	if (prTitle) {
		lines.push(`PR Title: ${prTitle}`);
		lines.push("");
	}

	lines.push("Provide a structured review covering:");
	lines.push("1. **Summary** — Brief description of what the changes do");
	lines.push("2. **Bugs & Correctness** — Potential bugs, logic errors, edge cases");
	lines.push("3. **Security** — Security concerns (injection, auth, data exposure, etc.)");
	lines.push("4. **Performance** — Performance implications or improvements");
	lines.push("5. **Style & Readability** — Code clarity, naming, structure");
	lines.push("6. **Suggestions** — Concrete improvements with code examples where helpful");
	lines.push("");
	lines.push("Be specific — reference file names and line numbers from the diff.");
	lines.push("If a section has no issues, say so briefly and move on.");
	lines.push("Keep the review concise and actionable.");

	if (focus) {
		lines.push("");
		lines.push(`Focus especially on: ${focus}`);
	}

	lines.push("");
	lines.push("<diff>");
	lines.push(diff);
	lines.push("</diff>");

	return lines.join("\n");
}

/** Call the LLM to perform the review. */
async function performReview(
	pi: ExtensionAPI,
	diff: string,
	focus: string | undefined,
	prTitle: string | undefined,
	ctx: ExtensionContext,
	signal?: AbortSignal,
): Promise<{ ok: true; review: string } | { ok: false; error: string }> {
	const model = ctx.model ?? getModel("anthropic", "claude-sonnet-4-20250514");
	if (!model) {
		return { ok: false, error: "No model available for code review" };
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		return { ok: false, error: auth.error };
	}
	if (!auth.apiKey) {
		return { ok: false, error: `No API key for ${model.provider}/${model.id}` };
	}

	const prompt = buildReviewPrompt(diff, focus, prTitle);

	const response = await complete(
		model,
		{
			messages: [
				{
					role: "user" as const,
					content: [{ type: "text" as const, text: prompt }],
					timestamp: Date.now(),
				},
			],
		},
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
			reasoningEffort: "high",
			signal,
		},
	);

	const review = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");

	if (!review.trim()) {
		return { ok: false, error: "Model returned an empty review" };
	}

	return { ok: true, review };
}



/** Count files and lines in a diff. */
function diffStats(diff: string): { files: number; additions: number; deletions: number } {
	let files = 0;
	let additions = 0;
	let deletions = 0;
	for (const line of diff.split("\n")) {
		if (line.startsWith("diff --git")) files++;
		else if (line.startsWith("+") && !line.startsWith("+++")) additions++;
		else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
	}
	return { files, additions, deletions };
}

// ---------------------------------------------------------------------------
// Parse /review arguments
// ---------------------------------------------------------------------------

type ParsedArgs = {
	mode: "pr";
	repo: string;
	prNumber: number;
} | {
	mode: "range";
	range: string;
} | {
	mode: "local";
	scope: "staged" | "unstaged" | "all";
	path?: string;
};

function parseReviewArgs(raw: string): ParsedArgs {
	const trimmed = raw.trim();

	if (!trimmed) {
		// Default: staged, fall back to unstaged handled at call site
		return { mode: "local", scope: "staged" };
	}

	// Check for PR URL
	const pr = parsePrUrl(trimmed);
	if (pr) {
		return { mode: "pr", repo: pr.repo, prNumber: pr.number };
	}

	// Check for scope keywords
	if (trimmed === "staged") return { mode: "local", scope: "staged" };
	if (trimmed === "unstaged") return { mode: "local", scope: "unstaged" };
	if (trimmed === "all") return { mode: "local", scope: "all" };

	// Check for commit range (contains ..)
	if (trimmed.includes("..")) {
		return { mode: "range", range: trimmed };
	}

	// Otherwise treat as a file path
	return { mode: "local", scope: "staged", path: trimmed };
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function codeReviewExtension(pi: ExtensionAPI) {
	// ------------------------------------------------------------------
	// Message renderer for inline review display
	// ------------------------------------------------------------------
	pi.registerMessageRenderer("code-review", (message, _options, theme) => {
		const details = message.details as {
			heading?: string;
			stats?: { files: number; additions: number; deletions: number };
		} | undefined;

		const container = new Container();
		const border = new DynamicBorder((s: string) => theme.fg("accent", s));
		const mdTheme = getMarkdownTheme();

		container.addChild(border);
		if (details?.heading) {
			container.addChild(
				new Text(theme.fg("accent", theme.bold(details.heading)), 1, 0),
			);
		}
		container.addChild(new Markdown(message.content, 1, 1, mdTheme));
		container.addChild(border);

		return container;
	});

	// ------------------------------------------------------------------
	// /review command
	// ------------------------------------------------------------------
	pi.registerCommand("review", {
		description:
			"Review code changes (/review [staged|unstaged|all|<range>|<path>|<PR URL>])",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const items: AutocompleteItem[] = [
				{ value: "staged", label: "staged", description: "Review staged changes" },
				{ value: "unstaged", label: "unstaged", description: "Review unstaged changes" },
				{ value: "all", label: "all", description: "Review all changes (staged + unstaged)" },
			];
			const filtered = items.filter((i) => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const parsed = parseReviewArgs(args ?? "");

			ctx.ui.notify("Fetching diff…", "info");

			let diff: string;
			let heading = "Code Review";
			let prTitle: string | undefined;

			if (parsed.mode === "pr") {
				const result = await getPrDiff(pi, parsed.repo, parsed.prNumber, ctx.cwd, ctx.signal);
				if (!result.ok) {
					ctx.ui.notify(result.error, "error");
					return;
				}
				diff = result.diff;
				prTitle = result.title;
				heading = `Code Review — ${parsed.repo}#${parsed.prNumber}: ${prTitle}`;
			} else if (parsed.mode === "range") {
				const result = await getRangeDiff(pi, parsed.range, ctx.cwd, ctx.signal);
				if (!result.ok) {
					ctx.ui.notify(result.error, "error");
					return;
				}
				diff = result.diff;
				heading = `Code Review — ${parsed.range}`;
			} else {
				// Local diff — try staged first, fall back to unstaged if empty
				let result = await getLocalDiff(pi, parsed.scope, parsed.path, ctx.cwd, ctx.signal);
				if (!result.ok) {
					ctx.ui.notify(result.error, "error");
					return;
				}
				if (!result.diff.trim() && parsed.scope === "staged" && !parsed.path) {
					// Nothing staged, try unstaged
					result = await getLocalDiff(pi, "unstaged", undefined, ctx.cwd, ctx.signal);
					if (!result.ok) {
						ctx.ui.notify(result.error, "error");
						return;
					}
					if (!result.diff.trim()) {
						ctx.ui.notify("No changes to review (nothing staged or unstaged)", "warning");
						return;
					}
					heading = "Code Review — unstaged changes";
				} else if (!result.diff.trim()) {
					ctx.ui.notify(`No changes to review (${parsed.scope}${parsed.path ? ` in ${parsed.path}` : ""})`, "warning");
					return;
				} else {
					heading = `Code Review — ${parsed.scope} changes${parsed.path ? ` in ${parsed.path}` : ""}`;
				}
				diff = result.diff;
			}

			const stats = diffStats(diff);
			ctx.ui.notify(
				`Reviewing ${stats.files} file(s), +${stats.additions}/-${stats.deletions} lines…`,
				"info",
			);

			const reviewResult = await performReview(pi, diff, undefined, prTitle, ctx, ctx.signal);
			if (!reviewResult.ok) {
				ctx.ui.notify(reviewResult.error, "error");
				return;
			}

			pi.sendMessage({
				customType: "code-review",
				content: reviewResult.review,
				display: true,
				details: { heading, stats },
			});
		},
	});

	// ------------------------------------------------------------------
	// code_review tool (LLM-callable)
	// ------------------------------------------------------------------
	pi.registerTool({
		name: "code_review",
		label: "Code Review",
		description:
			"Review git changes or a GitHub PR for bugs, security issues, style, and improvements. " +
			"Supports local diffs (staged/unstaged/all), commit ranges, and GitHub PR URLs.",
		promptSnippet:
			"Review a git diff or GitHub PR for bugs, security, style, and improvements",
		promptGuidelines: [
			"Use code_review when the user asks to review code changes, a diff, or a pull request.",
			"Prefer code_review with prUrl when the user provides a GitHub PR link.",
		],
		parameters: Type.Object({
			scope: Type.Optional(
				StringEnum(["staged", "unstaged", "all"] as const, {
					description: "Which local changes to review (default: staged, falls back to unstaged)",
				}),
			),
			range: Type.Optional(
				Type.String({ description: "Git commit range, e.g. HEAD~3..HEAD" }),
			),
			prUrl: Type.Optional(
				Type.String({ description: "GitHub PR URL, e.g. https://github.com/owner/repo/pull/123" }),
			),
			path: Type.Optional(
				Type.String({ description: "Filter to a specific file path" }),
			),
			focus: Type.Optional(
				Type.String({ description: "Specific aspect to focus the review on" }),
			),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			let diff: string;
			let prTitle: string | undefined;
			let label: string;

			if (params.prUrl) {
				const pr = parsePrUrl(params.prUrl);
				if (!pr) {
					throw new Error(`Invalid GitHub PR URL: ${params.prUrl}`);
				}
				onUpdate?.({
					content: [{ type: "text", text: `Fetching PR #${pr.number} from ${pr.repo}…` }],
				});
				const result = await getPrDiff(pi, pr.repo, pr.number, ctx.cwd, signal);
				if (!result.ok) throw new Error(result.error);
				diff = result.diff;
				prTitle = result.title;
				label = `${pr.repo}#${pr.number}`;
			} else if (params.range) {
				onUpdate?.({
					content: [{ type: "text", text: `Getting diff for ${params.range}…` }],
				});
				const result = await getRangeDiff(pi, params.range, ctx.cwd, signal);
				if (!result.ok) throw new Error(result.error);
				diff = result.diff;
				label = params.range;
			} else {
				const scope = params.scope ?? "staged";
				onUpdate?.({
					content: [{ type: "text", text: `Getting ${scope} diff…` }],
				});
				let result = await getLocalDiff(pi, scope, params.path, ctx.cwd, signal);
				if (!result.ok) throw new Error(result.error);

				// Fall back to unstaged when staged is empty
				if (!result.diff.trim() && scope === "staged" && !params.path) {
					result = await getLocalDiff(pi, "unstaged", undefined, ctx.cwd, signal);
					if (!result.ok) throw new Error(result.error);
					if (!result.diff.trim()) {
						return {
							content: [{ type: "text", text: "No changes to review (nothing staged or unstaged)." }],
							details: { empty: true },
						};
					}
					label = "unstaged changes";
				} else if (!result.diff.trim()) {
					return {
						content: [{ type: "text", text: `No changes to review (${scope}${params.path ? ` in ${params.path}` : ""}).` }],
						details: { empty: true },
					};
				} else {
					label = `${scope} changes${params.path ? ` in ${params.path}` : ""}`;
				}
				diff = result.diff;
			}

			if (signal?.aborted) {
				return { content: [{ type: "text", text: "Cancelled" }], details: {} };
			}

			const stats = diffStats(diff);
			onUpdate?.({
				content: [
					{
						type: "text",
						text: `Reviewing ${stats.files} file(s), +${stats.additions}/-${stats.deletions} lines…`,
					},
				],
			});

			const reviewResult = await performReview(pi, diff, params.focus, prTitle, ctx, signal);
			if (!reviewResult.ok) throw new Error(reviewResult.error);

			return {
				content: [{ type: "text", text: reviewResult.review }],
				details: { label, stats, prTitle },
			};
		},

		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("code_review "));
			if (args.prUrl) {
				const pr = parsePrUrl(args.prUrl);
				if (pr) {
					text += theme.fg("accent", `${pr.repo}#${pr.number}`);
				} else {
					text += theme.fg("muted", args.prUrl);
				}
			} else if (args.range) {
				text += theme.fg("muted", args.range);
			} else {
				text += theme.fg("muted", args.scope ?? "staged");
				if (args.path) text += " " + theme.fg("dim", args.path);
			}
			if (args.focus) {
				text += " " + theme.fg("dim", `(focus: ${args.focus})`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, _context) {
			if (isPartial) {
				const partial = result.content?.[0];
				const msg = partial && "text" in partial ? partial.text : "Reviewing…";
				return new Text(theme.fg("warning", msg), 0, 0);
			}

			const details = result.details as
				| { label?: string; stats?: { files: number; additions: number; deletions: number }; empty?: boolean }
				| undefined;

			if (details?.empty) {
				return new Text(theme.fg("dim", "No changes to review"), 0, 0);
			}

			const statsText = details?.stats
				? `${details.stats.files} file(s), +${details.stats.additions}/-${details.stats.deletions}`
				: "";
			let text = theme.fg("success", "✓ Review complete");
			if (details?.label) text += " " + theme.fg("muted", `(${details.label})`);
			if (statsText) text += " " + theme.fg("dim", statsText);

			if (expanded) {
				const content = result.content?.[0];
				if (content && "text" in content) {
					text += "\n\n" + content.text;
				}
			}

			return new Text(text, 0, 0);
		},
	});
}
