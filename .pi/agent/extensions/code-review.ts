/**
 * Code Review Extension
 *
 * Provides /review and /review-diff commands plus a code_review tool.
 *
 * Usage:
 *   /review                          — deep review of current branch changes (sub-agent)
 *   /review staged                   — deep review of staged changes
 *   /review unstaged                 — deep review of unstaged changes
 *   /review all                      — deep review of all local changes
 *   /review HEAD~3..HEAD             — deep review of a commit range
 *   /review src/utils.ts             — deep review of changes in a specific file
 *   /review https://github.com/owner/repo/pull/123
 *                                    — deep PR review in isolated sub-agent with
 *                                      code exploration tools and project context
 *
 *   /review-diff                     — quick review of staged changes (falls back to unstaged)
 *   /review-diff staged|unstaged|all — quick review of specified changes
 *   /review-diff HEAD~3..HEAD        — quick review of a commit range
 *   /review-diff src/utils.ts        — quick review of changes in a specific file
 *   /review-diff <PR URL>            — quick review of PR diff (single-call)
 *
 * Both commands accept the same arguments. /review runs a deep multi-turn
 * sub-agent review with codebase exploration. /review-diff runs a fast
 * single-call LLM review.
 *
 * The code_review tool lets the LLM proactively review changes when asked.
 *
 * Requires: git (always), gh CLI (for PR reviews)
 *
 * Installation:
 *   Copy to ~/.pi/agent/extensions/code-review.ts
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { complete } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getAgentDir, getMarkdownTheme, parseFrontmatter } from "@earendil-works/pi-coding-agent";
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

/** Structured metadata for a GitHub PR. */
interface PrMetadata {
	title: string;
	body: string;
	author: string;
	baseRefName: string;
	labels: string[];
	files: string[];
}

/** Fetch structured metadata for a GitHub PR using the gh CLI. */
async function getPrMetadata(
	pi: ExtensionAPI,
	repo: string,
	prNumber: number,
	cwd: string,
	signal?: AbortSignal,
): Promise<{ ok: true; metadata: PrMetadata } | { ok: false; error: string }> {
	const result = await pi.exec(
		"gh",
		[
			"pr", "view", String(prNumber),
			"--repo", repo,
			"--json", "title,body,author,baseRefName,labels,files",
		],
		{ cwd, timeout: 15_000, signal },
	);

	if (result.code !== 0) {
		const detail = result.stderr.trim() || `exit code ${result.code}`;
		return { ok: false, error: `Failed to fetch PR metadata: ${detail}` };
	}

	try {
		const data = JSON.parse(result.stdout);
		return {
			ok: true,
			metadata: {
				title: data.title ?? `PR #${prNumber}`,
				body: data.body ?? "",
				author: data.author?.login ?? "unknown",
				baseRefName: data.baseRefName ?? "main",
				labels: (data.labels ?? []).map((l: { name: string }) => l.name),
				files: (data.files ?? []).map((f: { path: string }) => f.path),
			},
		};
	} catch {
		return { ok: false, error: "Failed to parse PR metadata" };
	}
}

/** Detect the default branch of the repository (main, master, etc.). */
async function getDefaultBranch(
	pi: ExtensionAPI,
	cwd: string,
	signal?: AbortSignal,
): Promise<string> {
	// Try symbolic-ref first (works when origin is configured)
	const symRef = await pi.exec(
		"git", ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
		{ cwd, timeout: 5_000, signal },
	);
	if (symRef.code === 0 && symRef.stdout.trim()) {
		// Returns e.g. "origin/main" — strip the remote prefix
		const ref = symRef.stdout.trim();
		return ref.replace(/^origin\//, "");
	}

	// Fall back: check if main or master exists
	for (const candidate of ["main", "master"]) {
		const check = await pi.exec(
			"git", ["rev-parse", "--verify", `refs/heads/${candidate}`],
			{ cwd, timeout: 5_000, signal },
		);
		if (check.code === 0) return candidate;
	}

	return "main"; // last resort default
}

/**
 * Detect the base branch that the current feature branch was forked from.
 *
 * Tries multiple strategies in order of reliability:
 * 1. Check for an existing GitHub PR — its baseRefName is authoritative
 * 2. Check the git reflog for "Created from <parent>"
 * 3. Compute the nearest ancestor among local branches (smallest commit distance)
 * 4. Fall back to the repo's default branch (main/master)
 */
async function detectBaseBranch(
	pi: ExtensionAPI,
	cwd: string,
	currentBranch: string,
	signal?: AbortSignal,
): Promise<string> {
	// Strategy 1: Check for an open PR targeting a base branch
	const prView = await pi.exec(
		"gh", ["pr", "view", currentBranch, "--json", "baseRefName", "--jq", ".baseRefName"],
		{ cwd, timeout: 10_000, signal },
	);
	if (prView.code === 0 && prView.stdout.trim()) {
		const prBase = prView.stdout.trim();
		// Verify the branch exists locally
		const verify = await pi.exec(
			"git", ["rev-parse", "--verify", `refs/heads/${prBase}`],
			{ cwd, timeout: 5_000, signal },
		);
		if (verify.code === 0) return prBase;
	}

	// Strategy 2: Check reflog for branch creation event
	const reflog = await pi.exec(
		"git", ["reflog", "show", currentBranch, "--format=%gs"],
		{ cwd, timeout: 5_000, signal },
	);
	if (reflog.code === 0 && reflog.stdout.trim()) {
		const entries = reflog.stdout.trim().split("\n");
		const last = entries[entries.length - 1];
		// Matches "branch: Created from <name>" (but not commit hashes or HEAD)
		const m = last.match(/^branch: Created from (.+)$/);
		if (m) {
			const parent = m[1];
			// Skip if it looks like a commit hash or HEAD (not a branch name)
			if (!/^[0-9a-f]{7,40}$/.test(parent) && parent !== "HEAD") {
				// Verify the branch still exists
				const verify = await pi.exec(
					"git", ["rev-parse", "--verify", `refs/heads/${parent}`],
					{ cwd, timeout: 5_000, signal },
				);
				if (verify.code === 0) return parent;
			}
		}
	}

	// Strategy 3: Find the nearest ancestor branch by commit distance
	const branchList = await pi.exec(
		"git", ["branch", "--format=%(refname:short)"],
		{ cwd, timeout: 5_000, signal },
	);
	if (branchList.code === 0 && branchList.stdout.trim()) {
		const candidates = branchList.stdout.trim().split("\n")
			.filter((b) => b && b !== currentBranch);

		let bestBranch: string | undefined;
		let bestDistance = Infinity;

		for (const candidate of candidates) {
			const mb = await pi.exec(
				"git", ["merge-base", candidate, "HEAD"],
				{ cwd, timeout: 5_000, signal },
			);
			if (mb.code !== 0) continue;

			const dist = await pi.exec(
				"git", ["rev-list", "--count", `${mb.stdout.trim()}..HEAD`],
				{ cwd, timeout: 5_000, signal },
			);
			if (dist.code !== 0) continue;

			const count = Number(dist.stdout.trim());
			if (count > 0 && count < bestDistance) {
				bestDistance = count;
				bestBranch = candidate;
			}
		}

		if (bestBranch) return bestBranch;
	}

	// Strategy 4: Fall back to the repo default branch
	return getDefaultBranch(pi, cwd, signal);
}

/** Get the diff of the current branch relative to its base branch.
 *  When baseBranchOverride is given it is used directly; otherwise
 *  detectBaseBranch() determines the most likely parent. */
async function getBranchDiff(
	pi: ExtensionAPI,
	cwd: string,
	signal?: AbortSignal,
	baseBranchOverride?: string,
): Promise<{ ok: true; diff: string; branch: string; baseBranch: string; mergeBase: string } | { ok: false; error: string }> {
	// Get current branch name
	const branchResult = await pi.exec(
		"git", ["rev-parse", "--abbrev-ref", "HEAD"],
		{ cwd, timeout: 5_000, signal },
	);
	if (branchResult.code !== 0) {
		return { ok: false, error: "Failed to determine current branch" };
	}
	const branch = branchResult.stdout.trim();

	const baseBranch = baseBranchOverride ?? await detectBaseBranch(pi, cwd, branch, signal);

	if (branch === baseBranch) {
		return { ok: false, error: `Already on ${baseBranch} — use /review-diff for local changes` };
	}

	// Find merge-base
	const mbResult = await pi.exec(
		"git", ["merge-base", baseBranch, "HEAD"],
		{ cwd, timeout: 5_000, signal },
	);
	if (mbResult.code !== 0) {
		return { ok: false, error: `Failed to find merge-base between ${baseBranch} and HEAD` };
	}
	const mergeBase = mbResult.stdout.trim();

	// Get the diff — compare merge-base against the working tree (not HEAD)
	// so that staged and unstaged changes are included alongside commits.
	const diffResult = await pi.exec(
		"git", ["diff", mergeBase],
		{ cwd, timeout: 30_000, signal },
	);
	if (diffResult.code !== 0) {
		const detail = diffResult.stderr.trim() || `exit code ${diffResult.code}`;
		return { ok: false, error: `git diff failed: ${detail}` };
	}
	if (!diffResult.stdout.trim()) {
		return { ok: false, error: `No changes on ${branch} relative to ${baseBranch} (committed, staged, or unstaged)` };
	}

	return { ok: true, diff: diffResult.stdout, branch, baseBranch, mergeBase };
}

/** Structured metadata for the current branch. */
interface BranchMetadata {
	branch: string;
	baseBranch: string;
	mergeBase: string;
	files: string[];
	commitLog: string;
	commitCount: number;
}

/** Fetch structured metadata for the current branch vs the default branch. */
async function getBranchMetadata(
	pi: ExtensionAPI,
	branch: string,
	baseBranch: string,
	mergeBase: string,
	cwd: string,
	signal?: AbortSignal,
): Promise<{ ok: true; metadata: BranchMetadata } | { ok: false; error: string }> {
	// Get changed file list — use mergeBase (not mergeBase..HEAD) to match
	// getBranchDiff() which compares merge-base against the working tree,
	// including staged and unstaged changes alongside commits.
	const filesResult = await pi.exec(
		"git", ["diff", "--name-only", mergeBase],
		{ cwd, timeout: 10_000, signal },
	);
	const files = filesResult.code === 0
		? filesResult.stdout.trim().split("\n").filter(Boolean)
		: [];

	// Get commit log
	const logResult = await pi.exec(
		"git", ["log", "--oneline", `${mergeBase}..HEAD`],
		{ cwd, timeout: 10_000, signal },
	);
	const commitLog = logResult.code === 0 ? logResult.stdout.trim() : "";
	const commitCount = commitLog ? commitLog.split("\n").length : 0;

	return {
		ok: true,
		metadata: { branch, baseBranch, mergeBase, files, commitLog, commitCount },
	};
}

/** Build the contextual review prompt for the sub-agent (branch review). */
function buildBranchReviewPrompt(
	metadata: BranchMetadata,
	diff: string,
	stats: { files: number; additions: number; deletions: number },
): string {
	const lines: string[] = [];

	lines.push("Review the changes on this branch in detail.");
	lines.push("The diff includes committed, staged, and unstaged changes relative to the base branch.");
	lines.push("");

	lines.push("## Branch Info");
	lines.push(`- **Branch:** ${metadata.branch}`);
	lines.push(`- **Base branch:** ${metadata.baseBranch}`);
	lines.push(`- **Merge base:** \`${metadata.mergeBase.slice(0, 10)}\``);
	lines.push(`- **Commits:** ${metadata.commitCount}`);
	lines.push(`- **Files changed:** ${stats.files} (+${stats.additions}/-${stats.deletions})`);
	lines.push("");

	if (metadata.commitLog) {
		lines.push("## Commit Log");
		lines.push("```");
		lines.push(metadata.commitLog);
		lines.push("```");
		lines.push("");
	}

	lines.push("## Changed Files");
	for (const f of metadata.files) {
		lines.push(`- \`${f}\``);
	}
	lines.push("");

	const diffBytes = Buffer.byteLength(diff, "utf8");
	if (diffBytes <= PR_REVIEW_MAX_DIFF_BYTES) {
		lines.push("<diff>");
		lines.push(diff);
		lines.push("</diff>");
	} else {
		const result = smartTruncateDiff(diff, PR_REVIEW_MAX_DIFF_BYTES);

		if (result.skippedPaths.length > 0) {
			lines.push("## Files NOT Included in Diff (must use tools to review)");
			for (const p of result.skippedPaths) {
				lines.push(`- \`${p}\``);
			}
			lines.push("");
		}

		lines.push(
			`> **Diff truncated**: The full diff is ${Math.round(diffBytes / 1024)}KB. ` +
			`${result.includedCount} of ${result.totalCount} files are shown below ` +
			`(generated files like zz_generated.* are deprioritized). ` +
			`Use \`git diff ${metadata.mergeBase.slice(0, 10)} -- <file>\` to view unseen files.`,
		);
		lines.push(">");
		lines.push("> ⚠️ **Do NOT comment on files whose diff you have not seen.** Use tools to read unseen diffs, or explicitly skip them.");
		lines.push("");
		lines.push("<diff>");
		lines.push(result.diff);
		lines.push("</diff>");
	}

	return lines.join("\n");
}

/** Build the contextual review prompt for the sub-agent (local diff review). */
function buildLocalDeepReviewPrompt(
	diff: string,
	stats: { files: number; additions: number; deletions: number },
	heading: string,
): string {
	const lines: string[] = [];

	lines.push("Review the following local changes in detail.");
	lines.push("");

	lines.push("## Change Info");
	lines.push(`- **Scope:** ${heading}`);
	lines.push(`- **Files changed:** ${stats.files} (+${stats.additions}/-${stats.deletions})`);
	lines.push("");

	// Extract file list from the full diff before any truncation
	const allPaths = [...diff.matchAll(/^diff --git a\/.+? b\/(.+)$/gm)].map(m => m[1]);

	const diffBytes = Buffer.byteLength(diff, "utf8");
	if (diffBytes <= PR_REVIEW_MAX_DIFF_BYTES) {
		if (allPaths.length > 0) {
			lines.push("## Changed Files");
			for (const f of allPaths) {
				lines.push(`- \`${f}\``);
			}
			lines.push("");
		}
		lines.push("<diff>");
		lines.push(diff);
		lines.push("</diff>");
	} else {
		const result = smartTruncateDiff(diff, PR_REVIEW_MAX_DIFF_BYTES);

		lines.push("## Changed Files");
		for (const f of allPaths) {
			lines.push(`- \`${f}\``);
		}
		lines.push("");

		if (result.skippedPaths.length > 0) {
			lines.push("## Files NOT Included in Diff (must use tools to review)");
			for (const p of result.skippedPaths) {
				lines.push(`- \`${p}\``);
			}
			lines.push("");
		}

		lines.push(
			`> **Diff truncated**: The full diff is ${Math.round(diffBytes / 1024)}KB. ` +
			`${result.includedCount} of ${result.totalCount} files are shown below ` +
			`(generated files like zz_generated.* are deprioritized). ` +
			`Use \`git diff\` variants to view unseen files.`,
		);
		lines.push(">");
		lines.push("> ⚠️ **Do NOT comment on files whose diff you have not seen.** Use tools to read unseen diffs, or explicitly skip them.");
		lines.push("");
		lines.push("<diff>");
		lines.push(result.diff);
		lines.push("</diff>");
	}

	return lines.join("\n");
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

/** Maximum diff size (bytes) to include inline in the /pr-review prompt. */
const PR_REVIEW_MAX_DIFF_BYTES = 120_000;

/** Build the contextual review prompt for the sub-agent. */
function buildPrReviewPrompt(
	metadata: PrMetadata,
	diff: string,
	stats: { files: number; additions: number; deletions: number },
	repo: string,
	prNumber: number,
	prRef?: string,
): string {
	const lines: string[] = [];

	lines.push("Review this pull request in detail.");
	lines.push("");

	lines.push("## PR Info");
	lines.push(`- **PR:** ${repo}#${prNumber}`);
	lines.push(`- **Title:** ${metadata.title}`);
	lines.push(`- **Author:** ${metadata.author}`);
	lines.push(`- **Base branch:** ${metadata.baseRefName}`);
	lines.push(`- **Files changed:** ${stats.files} (+${stats.additions}/-${stats.deletions})`);
	if (metadata.labels.length > 0) {
		lines.push(`- **Labels:** ${metadata.labels.join(", ")}`);
	}
	lines.push("");

	if (metadata.body.trim()) {
		lines.push("## PR Description");
		lines.push(metadata.body.trim());
		lines.push("");
	}

	lines.push("## Changed Files");
	for (const f of metadata.files) {
		lines.push(`- \`${f}\``);
	}
	lines.push("");

	const diffBytes = Buffer.byteLength(diff, "utf8");
	if (diffBytes <= PR_REVIEW_MAX_DIFF_BYTES) {
		lines.push("<diff>");
		lines.push(diff);
		lines.push("</diff>");
	} else {
		const result = smartTruncateDiff(diff, PR_REVIEW_MAX_DIFF_BYTES);

		if (result.skippedPaths.length > 0) {
			lines.push("## Files NOT Included in Diff (must use tools to review)");
			for (const p of result.skippedPaths) {
				lines.push(`- \`${p}\``);
			}
			lines.push("");
		}

		const exploreCmd = prRef
			? `Use \`git diff ${metadata.baseRefName}...${prRef} -- <file>\` or \`git show ${prRef}:<file>\` to view unseen files.`
			: `The PR ref could not be fetched locally. Use \`gh pr diff ${prNumber} --repo ${repo}\` and pipe through grep, or try \`gh api repos/${repo}/pulls/${prNumber}/files --paginate\` for file-level diffs.`;

		lines.push(
			`> **Diff truncated**: The full diff is ${Math.round(diffBytes / 1024)}KB (${stats.files} files). ` +
			`${result.includedCount} of ${result.totalCount} files are shown below ` +
			`(generated files like zz_generated.* are deprioritized). ` +
			exploreCmd,
		);
		lines.push(">");
		lines.push("> ⚠️ **Do NOT comment on files whose diff you have not seen.** Use tools to read unseen diffs, or explicitly skip them.");
		lines.push("");
		lines.push("<diff>");
		lines.push(result.diff);
		lines.push("</diff>");
	}

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
	const model = ctx.model;
	if (!model) {
		return { ok: false, error: "No active model available in current session for code review" };
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

/** Split a unified diff into per-file sections. */
function splitDiffByFile(diff: string): Array<{ path: string; content: string }> {
	const sections: Array<{ path: string; content: string }> = [];
	const re = /^diff --git a\/.+? b\/(.+)$/gm;
	const starts: Array<{ pos: number; path: string }> = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(diff)) !== null) {
		starts.push({ pos: m.index, path: m[1] });
	}
	for (let i = 0; i < starts.length; i++) {
		const end = i + 1 < starts.length ? starts[i + 1].pos : diff.length;
		sections.push({ path: starts[i].path, content: diff.slice(starts[i].pos, end) });
	}
	return sections;
}

/** Patterns for generated/low-value files that should be deprioritized in truncated diffs. */
const GENERATED_FILE_PATTERNS = [
	/(?:^|\/)zz_generated[._]/,
	/(?:^|\/)vendor\//,
	/(?:^|\/)node_modules\//,
	/\.pb\.go$/,
	/(?:^|\/)package-lock\.json$/,
	/(?:^|\/)yarn\.lock$/,
	/(?:^|\/)pnpm-lock\.yaml$/,
	/(?:^|\/)go\.sum$/,
	/\/applyconfiguration\/internal\//,
	/\/fake\/fake_/,
];

function isGeneratedFile(filePath: string): boolean {
	return GENERATED_FILE_PATTERNS.some((p) => p.test(filePath));
}

/**
 * Smart diff truncation: prioritize hand-written source files over generated
 * code. Includes whole files (never truncates mid-file) up to the byte budget,
 * with source files included before generated ones.
 */
function smartTruncateDiff(
	diff: string,
	maxBytes: number,
): { diff: string; includedCount: number; totalCount: number; skippedPaths: string[] } {
	const totalBytes = Buffer.byteLength(diff, "utf8");
	const sections = splitDiffByFile(diff);
	const totalCount = sections.length;

	if (totalBytes <= maxBytes) {
		return { diff, includedCount: totalCount, totalCount, skippedPaths: [] };
	}

	const source: typeof sections = [];
	const generated: typeof sections = [];
	for (const s of sections) {
		(isGeneratedFile(s.path) ? generated : source).push(s);
	}

	// Sort smaller files first within each group to maximize the number
	// of files included within the byte budget.
	const bySize = (a: typeof sections[0], b: typeof sections[0]) =>
		Buffer.byteLength(a.content, "utf8") - Buffer.byteLength(b.content, "utf8");
	source.sort(bySize);
	generated.sort(bySize);

	const parts: string[] = [];
	const skippedPaths: string[] = [];
	let bytes = 0;

	for (const section of [...source, ...generated]) {
		const sectionBytes = Buffer.byteLength(section.content, "utf8");
		if (bytes + sectionBytes > maxBytes && parts.length > 0) {
			skippedPaths.push(section.path);
		} else {
			parts.push(section.content);
			bytes += sectionBytes;
		}
	}

	return { diff: parts.join(""), includedCount: parts.length, totalCount, skippedPaths };
}

/** Ensure the PR ref exists locally for sub-agent exploration. Returns the ref name or undefined. */
async function ensurePrRef(
	pi: ExtensionAPI,
	prNumber: number,
	cwd: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	const ref = `pull/${prNumber}/head`;

	// Check if ref already exists locally
	const check = await pi.exec(
		"git", ["rev-parse", "--verify", ref],
		{ cwd, timeout: 5_000, signal },
	);
	if (check.code === 0) return ref;

	// Try to fetch it
	const fetchResult = await pi.exec(
		"git", ["fetch", "origin", `pull/${prNumber}/head:${ref}`],
		{ cwd, timeout: 30_000, signal },
	);
	if (fetchResult.code === 0) return ref;

	return undefined;
}

/** Maximum diff excerpt size to include in review context for follow-up discussion. */
const DIFF_EXCERPT_MAX_LINES = 200;
const DIFF_EXCERPT_MAX_BYTES = 8_000;

/** Truncate a diff to a reasonable excerpt for inclusion in conversation context. */
function truncateDiff(diff: string): string {
	const lines = diff.split("\n");
	if (lines.length <= DIFF_EXCERPT_MAX_LINES && Buffer.byteLength(diff, "utf8") <= DIFF_EXCERPT_MAX_BYTES) {
		return diff;
	}

	const selected: string[] = [];
	let bytes = 0;
	for (const line of lines) {
		if (selected.length >= DIFF_EXCERPT_MAX_LINES) break;
		const lineBytes = Buffer.byteLength(line, "utf8") + 1;
		if (bytes + lineBytes > DIFF_EXCERPT_MAX_BYTES && selected.length > 0) break;
		selected.push(line);
		bytes += lineBytes;
	}

	const remaining = lines.length - selected.length;
	if (remaining > 0) {
		selected.push(`\n… (${remaining} more lines truncated)`);
	}
	return selected.join("\n");
}

/** Build enriched review content with context for follow-up discussion.
 *  The full content goes into `content` (visible to LLM), while the raw
 *  review text is stored separately in `details.review` for TUI display. */
function buildReviewContent(
	review: string,
	heading: string,
	stats: { files: number; additions: number; deletions: number },
	diff: string,
	prMetadata?: {
		repo: string;
		prNumber: number;
		metadata: PrMetadata;
	},
): string {
	const parts: string[] = [];

	parts.push(`## ${heading}`);
	parts.push(`${stats.files} file(s) changed, +${stats.additions}/-${stats.deletions} lines`);
	parts.push("");

	if (prMetadata) {
		const { repo, prNumber, metadata } = prMetadata;
		parts.push(`- **PR:** ${repo}#${prNumber}`);
		parts.push(`- **Author:** ${metadata.author}`);
		parts.push(`- **Base branch:** ${metadata.baseRefName}`);
		if (metadata.labels.length > 0) {
			parts.push(`- **Labels:** ${metadata.labels.join(", ")}`);
		}
		parts.push("");
		parts.push("**Changed files:**");
		for (const f of metadata.files) {
			parts.push(`- \`${f}\``);
		}
		parts.push("");
	}

	parts.push(review);
	parts.push("");
	parts.push("---");
	parts.push("### Reviewed Diff");
	parts.push("<diff>");
	parts.push(truncateDiff(diff));
	parts.push("</diff>");

	return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Sub-agent infrastructure for /pr-review
// ---------------------------------------------------------------------------

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}
	return { command: "pi", args };
}

interface SubagentUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

interface SubagentResult {
	ok: boolean;
	review: string;
	usage: SubagentUsage;
	model?: string;
	error?: string;
}

interface AgentDef {
	model?: string;
	tools?: string[];
	systemPrompt: string;
}

function loadPrReviewerAgent(): AgentDef {
	const agentPath = path.join(getAgentDir(), "agents", "pr-reviewer.md");
	const content = fs.readFileSync(agentPath, "utf-8");
	const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
	const tools = frontmatter.tools
		?.split(",")
		.map((t: string) => t.trim())
		.filter(Boolean);
	return {
		model: frontmatter.model,
		tools: tools && tools.length > 0 ? tools : undefined,
		systemPrompt: body,
	};
}

interface ProgressEvent {
	status: string;
	activity?: string;
}

async function runPrReviewSubagent(
	task: string,
	cwd: string,
	signal: AbortSignal | undefined,
	parentModel: Model<any> | undefined,
	onProgress: (event: ProgressEvent) => void,
): Promise<SubagentResult> {
	const agent = loadPrReviewerAgent();

	const piArgs: string[] = ["--mode", "json", "-p", "--no-session"];
	
	// Prioritize parent session's current model over the hardcoded agent model
	const modelArg = parentModel ? `${parentModel.provider}/${parentModel.id}` : agent.model;
	if (modelArg) {
		piArgs.push("--model", modelArg);
	}
	if (agent.tools && agent.tools.length > 0) piArgs.push("--tools", agent.tools.join(","));

	// Write system prompt and task to temp files to avoid E2BIG when
	// the task (prompt + diff) exceeds Linux's per-argument limit
	// (MAX_ARG_STRLEN = 128 KB).
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-pr-review-"));
	const promptFile = path.join(tmpDir, "system-prompt.md");
	await fs.promises.writeFile(promptFile, agent.systemPrompt, { encoding: "utf-8", mode: 0o600 });
	piArgs.push("--append-system-prompt", promptFile);

	const taskFile = path.join(tmpDir, "task.md");
	await fs.promises.writeFile(taskFile, task, { encoding: "utf-8", mode: 0o600 });
	piArgs.push("@" + taskFile);

	const usage: SubagentUsage = {
		input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
		cost: 0, contextTokens: 0, turns: 0,
	};
	let finalOutput = "";
	let model: string | undefined = agent.model;
	let stderr = "";
	let wasAborted = false;

	try {
		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(piArgs);
			const proc = spawn(invocation.command, invocation.args, {
				cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: any;
				try { event = JSON.parse(line); } catch { return; }

				const statusSummary = () =>
					`${usage.turns} turn${usage.turns !== 1 ? "s" : ""}, ` +
					`↑${formatTokens(usage.input)} ↓${formatTokens(usage.output)}`;

				if (event.type === "message_end" && event.message) {
					const msg = event.message;
					if (msg.role === "assistant") {
						usage.turns++;
						const u = msg.usage;
						if (u) {
							usage.input += u.input || 0;
							usage.output += u.output || 0;
							usage.cacheRead += u.cacheRead || 0;
							usage.cacheWrite += u.cacheWrite || 0;
							usage.cost += u.cost?.total || 0;
							usage.contextTokens = u.totalTokens || 0;
						}
						if (!model && msg.model) model = msg.model;

						// Extract final text content
						for (const part of msg.content ?? []) {
							if (part.type === "text") finalOutput = part.text;
						}

						onProgress({ status: statusSummary(), activity: `Turn ${usage.turns} complete` });
					}
				}

				if (event.type === "tool_execution_start") {
					const name = event.toolName ?? "tool";
					const args = event.args ?? {};
					let detail = name;
					if (name === "read" && args.path) {
						detail = `read ${args.path}`;
					} else if (name === "bash" && args.command) {
						const cmd = String(args.command).split("\n")[0];
						detail = `bash ${cmd}`;
					} else if (name === "grep" && args.pattern) {
						detail = `grep ${args.pattern}${args.path ? " " + args.path : ""}`;
					} else if (name === "find" && args.pattern) {
						detail = `find ${args.pattern}`;
					} else if (name === "ls" && args.path) {
						detail = `ls ${args.path}`;
					}
					onProgress({ status: `${name}…`, activity: `▸ ${detail}` });
				}

				if (event.type === "tool_execution_end") {
					const name = event.toolName ?? "tool";
					const icon = event.isError ? "✗" : "✓";
					onProgress({ status: statusSummary(), activity: `${icon} ${name}` });
				}
			};

			proc.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const l of lines) processLine(l);
			});

			proc.stderr.on("data", (data) => { stderr += data.toString(); });

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", () => resolve(1));

			if (signal) {
				const killProc = () => {
					wasAborted = true;
					proc.kill("SIGTERM");
					setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 5000);
				};
				if (signal.aborted) killProc();
				else signal.addEventListener("abort", killProc, { once: true });
			}
		});

		if (wasAborted) {
			return { ok: false, review: "", usage, model, error: "Review aborted" };
		}

		if (exitCode !== 0) {
			return {
				ok: false, review: "", usage, model,
				error: stderr.trim() || `Sub-agent exited with code ${exitCode}`,
			};
		}

		if (!finalOutput.trim()) {
			return { ok: false, review: "", usage, model, error: "Sub-agent returned no output" };
		}

		return { ok: true, review: finalOutput, usage, model };
	} finally {
		try { fs.unlinkSync(taskFile); } catch { /* ignore */ }
		try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
		try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
	}
}

// ---------------------------------------------------------------------------
// Parse command arguments
// ---------------------------------------------------------------------------

type ReviewArgs = {
	mode: "pr";
	repo: string;
	prNumber: number;
} | {
	mode: "branch";
	baseBranch?: string;
} | {
	mode: "range";
	range: string;
} | {
	mode: "local";
	scope: "staged" | "unstaged" | "all";
	path?: string;
};

/**
 * Parse review arguments.
 * @param defaultMode What to return when no arguments are given:
 *   - "branch" for /review (deep review of current branch)
 *   - "staged" for /review-diff (quick review of staged changes)
 */
function parseReviewArgs(raw: string, defaultMode: "branch" | "staged"): ReviewArgs {
	const trimmed = raw.trim();

	// Extract --base <branch> flag if present (implies branch mode)
	let baseBranch: string | undefined;
	let rest = trimmed;
	const baseMatch = rest.match(/--base\s+(\S+)/);
	if (baseMatch) {
		baseBranch = baseMatch[1];
		rest = rest.replace(baseMatch[0], "").trim();
	}

	if (baseBranch) {
		return { mode: "branch", baseBranch };
	}

	if (!rest) {
		return defaultMode === "branch"
			? { mode: "branch" }
			: { mode: "local", scope: "staged" };
	}

	// Check for PR URL
	const pr = parsePrUrl(rest);
	if (pr) return { mode: "pr", repo: pr.repo, prNumber: pr.number };

	// Check for scope keywords
	if (rest === "staged") return { mode: "local", scope: "staged" };
	if (rest === "unstaged") return { mode: "local", scope: "unstaged" };
	if (rest === "all") return { mode: "local", scope: "all" };

	// Check for commit range (contains ..)
	if (rest.includes("..")) return { mode: "range", range: rest };

	// Otherwise treat as a file path
	return { mode: "local", scope: "staged", path: rest };
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
			review?: string;
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
		// Use details.review for display (clean review without diff excerpt),
		// falling back to content for legacy messages.
		const displayContent = details?.review
			?? (typeof message.content === "string" ? message.content : "");
		container.addChild(new Markdown(displayContent, 1, 1, mdTheme));
		container.addChild(border);

		return container;
	});

	// ------------------------------------------------------------------
	// PR autocomplete cache
	// ------------------------------------------------------------------
	let cachedPrs: AutocompleteItem[] = [];

	pi.on("session_start", async (_event, ctx) => {
		const result = await pi.exec(
			"gh",
			["pr", "list", "--json", "number,title,url", "--limit", "20"],
			{ cwd: ctx.cwd, timeout: 10_000 },
		);
		if (result.code === 0) {
			try {
				const prs = JSON.parse(result.stdout) as Array<{
					number: number;
					title: string;
					url: string;
				}>;
				cachedPrs = prs.map((pr) => ({
					value: pr.url,
					label: `#${pr.number}`,
					description: pr.title,
				}));
			} catch {
				cachedPrs = [];
			}
		}

		// Register # autocomplete so typing #123 suggests cached PRs
		if (ctx.mode === "tui") {
			ctx.ui.addAutocompleteProvider((current) => ({
				triggerCharacters: ["#"],
				async getSuggestions(lines, line, col, options) {
					const beforeCursor = (lines[line] ?? "").slice(0, col);
					const match = beforeCursor.match(/(?:^|[\s])#(\d*)$/);
					if (!match || cachedPrs.length === 0) {
						return current.getSuggestions(lines, line, col, options);
					}
					const typed = match[1] ?? "";
					const filtered = cachedPrs.filter(
						(pr) => pr.label.startsWith(`#${typed}`) || (pr.description?.includes(typed) ?? false),
					);
					if (filtered.length === 0) {
						return current.getSuggestions(lines, line, col, options);
					}
					return { prefix: `#${typed}`, items: filtered };
				},
				applyCompletion(lines, line, col, item, prefix) {
					return current.applyCompletion(lines, line, col, item, prefix);
				},
				shouldTriggerFileCompletion(lines, line, col) {
					return current.shouldTriggerFileCompletion?.(lines, line, col) ?? true;
				},
			}));
		}
	});

	// ------------------------------------------------------------------
	// Shared autocomplete for both /review and /review-diff
	// ------------------------------------------------------------------
	const getSharedCompletions = (prefix: string): AutocompleteItem[] | null => {
		const localItems: AutocompleteItem[] = [
			{ value: "staged", label: "staged", description: "Review staged changes" },
			{ value: "unstaged", label: "unstaged", description: "Review unstaged changes" },
			{ value: "all", label: "all", description: "Review all changes (staged + unstaged)" },
		];
		const allItems = [...localItems, ...cachedPrs];
		if (!prefix) return allItems.length > 0 ? allItems : null;
		const filtered = allItems.filter(
			(i) =>
				i.value.startsWith(prefix) ||
				i.value.includes(prefix) ||
				i.label.includes(prefix) ||
				(i.description?.includes(prefix) ?? false),
		);
		return filtered.length > 0 ? filtered : null;
	};

	// ------------------------------------------------------------------
	// Shared diff fetcher — resolves ReviewArgs to a diff + heading
	// ------------------------------------------------------------------
	const fetchDiff = async (
		parsed: ReviewArgs,
		cwd: string,
		signal?: AbortSignal,
	): Promise<{ ok: true; diff: string; heading: string; prTitle?: string } | { ok: false; error: string }> => {
		if (parsed.mode === "pr") {
			const result = await getPrDiff(pi, parsed.repo, parsed.prNumber, cwd, signal);
			if (!result.ok) return result;
			return { ok: true, diff: result.diff, heading: `Code Review — ${parsed.repo}#${parsed.prNumber}: ${result.title}`, prTitle: result.title };
		}

		if (parsed.mode === "branch") {
			const result = await getBranchDiff(pi, cwd, signal, parsed.baseBranch);
			if (!result.ok) return result;
			return { ok: true, diff: result.diff, heading: `Code Review — ${result.branch} vs ${result.baseBranch}` };
		}

		if (parsed.mode === "range") {
			const result = await getRangeDiff(pi, parsed.range, cwd, signal);
			if (!result.ok) return result;
			return { ok: true, diff: result.diff, heading: `Code Review — ${parsed.range}` };
		}

		// Local diff — try staged first, fall back to unstaged if empty
		let result = await getLocalDiff(pi, parsed.scope, parsed.path, cwd, signal);
		if (!result.ok) return result;
		if (!result.diff.trim() && parsed.scope === "staged" && !parsed.path) {
			result = await getLocalDiff(pi, "unstaged", undefined, cwd, signal);
			if (!result.ok) return result;
			if (!result.diff.trim()) {
				return { ok: false, error: "No changes to review (nothing staged or unstaged)" };
			}
			return { ok: true, diff: result.diff, heading: "Code Review — unstaged changes" };
		}
		if (!result.diff.trim()) {
			return { ok: false, error: `No changes to review (${parsed.scope}${parsed.path ? ` in ${parsed.path}` : ""})` };
		}
		return { ok: true, diff: result.diff, heading: `Code Review — ${parsed.scope} changes${parsed.path ? ` in ${parsed.path}` : ""}` };
	};

	// ------------------------------------------------------------------
	// /review command (deep sub-agent review)
	// ------------------------------------------------------------------
	pi.registerCommand("review", {
		description:
			"Deep code review (/review [--base <branch>] [staged|unstaged|all|<range>|<path>|<PR URL>] — no args = current branch)",
		getArgumentCompletions: getSharedCompletions,
		handler: async (args, ctx) => {
			const parsed = parseReviewArgs(args ?? "", "branch");

			// Shared sub-agent runner
			const runDeepReview = async (
				task: string,
				heading: string,
				stats: { files: number; additions: number; deletions: number },
				diff: string,
				widgetTitle: string,
				reviewContent: (review: string) => string,
			) => {
				const activityLog: string[] = [];
				const MAX_LOG_LINES = 8;
				const ac = new AbortController();
				pi.registerCommand("cancel-review", {
					description: "Cancel the running review",
					handler: async () => { ac.abort(); },
				});
				ctx.ui.setStatus("review", "Sub-agent starting… (/cancel-review to abort)");

				try {
					const result = await runPrReviewSubagent(
						task,
						ctx.cwd,
						ac.signal,
						ctx.model,
						({ status, activity }) => {
							ctx.ui.setStatus("review", `Review: ${status}`);
							if (activity) {
								activityLog.push(activity);
								if (activityLog.length > MAX_LOG_LINES) activityLog.shift();
								ctx.ui.setWidget("review", [
									widgetTitle,
									...activityLog,
								]);
							}
						},
					);

					if (!result.ok) {
						ctx.ui.notify(result.error ?? "Sub-agent failed", "error");
						return;
					}

					const usageParts: string[] = [];
					if (result.usage.turns) usageParts.push(`${result.usage.turns} turns`);
					if (result.usage.input) usageParts.push(`↑${formatTokens(result.usage.input)}`);
					if (result.usage.output) usageParts.push(`↓${formatTokens(result.usage.output)}`);
					if (result.usage.cost) usageParts.push(`$${result.usage.cost.toFixed(4)}`);
					if (result.model) usageParts.push(result.model);
					const usageSuffix = usageParts.length > 0 ? ` (${usageParts.join(", ")})` : "";

					pi.sendMessage({
						customType: "code-review",
						content: reviewContent(result.review),
						display: true,
						details: { heading, stats, review: result.review },
					});

					ctx.ui.notify(`Review complete${usageSuffix}`, "info");
				} finally {
					ctx.ui.setStatus("review", undefined);
					ctx.ui.setWidget("review", undefined);
				}
			};

			// ── PR URL: deep sub-agent review ──
			if (parsed.mode === "pr") {
				const { repo, prNumber } = parsed;
				ctx.ui.notify(`Fetching PR #${prNumber} from ${repo}…`, "info");

				const [metaResult, diffResult, prRef] = await Promise.all([
					getPrMetadata(pi, repo, prNumber, ctx.cwd, ctx.signal),
					getPrDiff(pi, repo, prNumber, ctx.cwd, ctx.signal),
					ensurePrRef(pi, prNumber, ctx.cwd, ctx.signal),
				]);

				if (!metaResult.ok) {
					ctx.ui.notify(metaResult.error, "error");
					return;
				}
				if (!diffResult.ok) {
					ctx.ui.notify(diffResult.error, "error");
					return;
				}

				const { metadata } = metaResult;
				const stats = diffStats(diffResult.diff);
				const heading = `PR Review — ${repo}#${prNumber}: ${metadata.title}`;

				ctx.ui.notify(
					`Reviewing ${repo}#${prNumber}: ${metadata.title} ` +
					`(${stats.files} files, +${stats.additions}/-${stats.deletions})`,
					"info",
				);

				const task = buildPrReviewPrompt(
					metadata, diffResult.diff, stats, repo, prNumber, prRef,
				);

				await runDeepReview(
					task, heading, stats, diffResult.diff,
					`PR Review — ${repo}#${prNumber}`,
					(review) => buildReviewContent(
						review, heading, stats, diffResult.diff,
						{ repo, prNumber, metadata },
					),
				);
				return;
			}

			// ── Branch: deep sub-agent review of current branch ──
			if (parsed.mode === "branch") {
				ctx.ui.notify("Analysing branch changes…", "info");

				const branchDiff = await getBranchDiff(pi, ctx.cwd, ctx.signal, parsed.baseBranch);
				if (!branchDiff.ok) {
					ctx.ui.notify(branchDiff.error, "error");
					return;
				}

				const metaResult = await getBranchMetadata(
					pi, branchDiff.branch, branchDiff.baseBranch,
					branchDiff.mergeBase, ctx.cwd, ctx.signal,
				);
				if (!metaResult.ok) {
					ctx.ui.notify(metaResult.error, "error");
					return;
				}

				const { metadata } = metaResult;
				const stats = diffStats(branchDiff.diff);
				const heading = `Branch Review — ${metadata.branch} (${metadata.commitCount} commits)`;

				ctx.ui.notify(
					`Reviewing branch ${metadata.branch} vs ${metadata.baseBranch} ` +
					`(${stats.files} files, +${stats.additions}/-${stats.deletions})`,
					"info",
				);

				const task = buildBranchReviewPrompt(metadata, branchDiff.diff, stats);

				await runDeepReview(
					task, heading, stats, branchDiff.diff,
					`Branch Review — ${metadata.branch}`,
					(review) => buildReviewContent(review, heading, stats, branchDiff.diff),
				);
				return;
			}

			// ── Local / range: deep sub-agent review of local diff ──
			ctx.ui.notify("Fetching diff…", "info");

			const diffResult = await fetchDiff(parsed, ctx.cwd, ctx.signal);
			if (!diffResult.ok) {
				ctx.ui.notify(diffResult.error, "error");
				return;
			}

			const stats = diffStats(diffResult.diff);
			const heading = diffResult.heading.replace("Code Review", "Deep Review");

			ctx.ui.notify(
				`Reviewing ${stats.files} file(s), +${stats.additions}/-${stats.deletions} lines…`,
				"info",
			);

			const task = buildLocalDeepReviewPrompt(diffResult.diff, stats, heading);

			await runDeepReview(
				task, heading, stats, diffResult.diff,
				heading,
				(review) => buildReviewContent(review, heading, stats, diffResult.diff),
			);
		},
	});

	// ------------------------------------------------------------------
	// /review-diff command (fast single-call review)
	// ------------------------------------------------------------------
	pi.registerCommand("review-diff", {
		description:
			"Quick code review (/review-diff [--base <branch>] [staged|unstaged|all|<range>|<path>|<PR URL>] — no args = staged)",
		getArgumentCompletions: getSharedCompletions,
		handler: async (args, ctx) => {
			const parsed = parseReviewArgs(args ?? "", "staged");

			ctx.ui.notify("Fetching diff…", "info");

			const diffResult = await fetchDiff(parsed, ctx.cwd, ctx.signal);
			if (!diffResult.ok) {
				ctx.ui.notify(diffResult.error, "error");
				return;
			}

			const stats = diffStats(diffResult.diff);
			const heading = diffResult.heading;

			ctx.ui.notify(
				`Reviewing ${stats.files} file(s), +${stats.additions}/-${stats.deletions} lines…`,
				"info",
			);

			const reviewResult = await performReview(pi, diffResult.diff, undefined, diffResult.prTitle, ctx, ctx.signal);
			if (!reviewResult.ok) {
				ctx.ui.notify(reviewResult.error, "error");
				return;
			}

			pi.sendMessage({
				customType: "code-review",
				content: buildReviewContent(reviewResult.review, heading, stats, diffResult.diff),
				display: true,
				details: { heading, stats, review: reviewResult.review },
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

			const diffExcerpt = truncateDiff(diff);
			return {
				content: [{ type: "text", text: `${reviewResult.review}\n\n---\n### Reviewed Diff\n<diff>\n${diffExcerpt}\n</diff>` }],
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
