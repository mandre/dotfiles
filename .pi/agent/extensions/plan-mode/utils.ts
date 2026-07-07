/**
 * Pure utility functions for plan mode.
 * Extracted for testability.
 */

// Destructive commands blocked in plan mode
const DESTRUCTIVE_PATTERNS = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	/(^|[^<2\-])>(?!>)(?!&?\s*(\/dev\/null|\/tmp\/))/,
	/>>(?!\s*(\/dev\/null|\/tmp\/))/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip3?\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge(?!-)|rebase|reset|checkout|branch\s+-[dD]|stash(?!\s+(list|show)\b)|cherry-pick|revert|tag|init|clone)/i,
	/\bcurl\b[^|]*(-o|--output)\s+(?!\/tmp\/)\S+/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill\b/i,
	/\bpkill\b/i,
	/\bkillall\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
	/\bacli\b.*\b(createIssue|updateIssue|deleteIssue|addComment|addAttachment|transitionIssue|assignIssue|addVersion|addComponent|deleteVersion|deleteComponent|addWorklog|createFilter|deleteFilter|createBoard|deleteBoard|linkIssue|cloneIssue)\b/i,
	// acli jira positional subcommands (destructive)
	/\bacli\s+jira\s+project\s+(create|delete|update|archive|restore)\b/i,
	/\bacli\s+jira\s+workitem\s+(create|create-bulk|edit|delete|clone|assign|transition|archive|unarchive)\b/i,
	/\bacli\s+jira\s+workitem\s+comment\s+(create|update|delete)\b/i,
	/\bacli\s+jira\s+workitem\s+attachment\s+delete\b/i,
	/\bacli\s+jira\s+workitem\s+link\s+(create|delete)\b/i,
	/\bacli\s+jira\s+workitem\s+watcher\s+remove\b/i,
	/\bacli\s+jira\s+board\s+(create|delete)\b/i,
	/\bacli\s+jira\s+sprint\s+(create|update|delete)\b/i,
	/\bacli\s+jira\s+filter\s+(update|add-favourite|change-owner|reset-columns)\b/i,
	/\bacli\s+jira\s+field\s+(create|update|delete|cancel-delete)\b/i,
	// gws (Google Workspace) destructive operations
	/\bgws\s+\S+\s+(\S+\s+)?(create|batchUpdate|update|delete|copy|modifyLabels|resolve|hide|unhide|stop)\b/i,
	/\bgws\s+\S+\s+\+(write|append|upload)\b/i,
	// gh (GitHub CLI) destructive operations
	/\bgh\s+(pr|issue)\s+(create|close|merge|delete|edit|reopen)\b/i,
	/\bgh\s+repo\s+(create|delete|fork|rename|archive)\b/i,
	/\bgh\s+release\s+(create|delete|edit)\b/i,
	/\bgh\s+api\b.*(-X\s*(POST|PUT|PATCH|DELETE)|--method\s*(POST|PUT|PATCH|DELETE))/i,
	// sed in-place editing
	/\bsed\s+(-[a-zA-Z]*i|--in-place)\b/i,
	// OpenShift / Kubernetes CLI destructive operations
	/\b(oc|kubectl)\s+(create|delete|apply|edit|patch|scale|set|rollout|adm|drain|cordon|uncordon|taint|new-app|new-project)\b/i,
	// Container runtimes (destructive)
	/\b(podman|docker)\s+(run|rm|rmi|build|push|pull|stop|kill|exec|tag|create|commit)\b/i,
	// uv package management (not uv run)
	/\buv\s+(sync|add|remove|init|lock)\b(?!.*--dry-run)/i,
	// Graphviz output (writes files)
	/\bdot\b.*-o\b/i,
];

// Safe read-only commands allowed in plan mode
const SAFE_PATTERNS = [
	/^\s*cat\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*less\b/,
	/^\s*more\b/,
	/^\s*grep\b/,
	/^\s*find\b/,
	/^\s*ls\b/,
	/^\s*pwd\b/,
	/^\s*echo\b/,
	/^\s*printf\b/,
	/^\s*wc\b/,
	/^\s*sort\b/,
	/^\s*uniq\b/,
	/^\s*diff\b/,
	/^\s*file\b/,
	/^\s*stat\b/,
	/^\s*du\b/,
	/^\s*df\b/,
	/^\s*tree\b/,
	/^\s*which\b/,
	/^\s*whereis\b/,
	/^\s*type\b/,
	/^\s*env\b/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*cal\b/,
	/^\s*uptime\b/,
	/^\s*ps\b/,
	/^\s*top\b/,
	/^\s*htop\b/,
	/^\s*free\b/,
	/^\s*git\s+(-C\s+\S+\s+|--no-pager\s+)*(status|log|diff|show|branch|remote|config\s+--get|merge-base|for-each-ref|rev-parse|stash\s+(list|show))/i,
	/^\s*git\s+(-C\s+\S+\s+|--no-pager\s+)*ls-/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	// Python package managers (read-only)
	/^\s*pip3?\s+(list|show|freeze|index|check|debug)/i,
	/^\s*uv\s+(pip\s+)?(list|show|tree|version)/i,
	/^\s*uv\s+lock\s+--dry-run/i,
	/^\s*node\s+--version/i,
	/^\s*python\s+--version/i,
	/^\s*curl\s/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/,
	/^\s*sed\b/,
	/^\s*awk\b/,
	/^\s*rg\b/,
	/^\s*fd\b/,
	/^\s*bat\b/,
	/^\s*eza\b/,
	// Python (data processing, calculations)
	/^\s*python3?\s/i,
	// GitHub CLI (read-only operations)
	/^\s*gh\s+(pr|issue|repo|run|workflow|release)\s+(view|list|diff|checks|status|search|review)\b/i,
	/^\s*gh\s+auth\s+status\b/i,
	/^\s*gh\s+api\b/i,
	/^\s*gh\s+run\s+download\b/i,
	// Binary inspection
	/^\s*strings\b/,
	// Web search
	/^\s*brave-search\b/,
	// uv run (specific test/lint tools only)
	/^\s*uv\s+run\s+(pytest|flake8|mypy|ruff|pylint|black\s+--check|isort\s+--check)\b/i,
	// Ansible linting
	/^\s*ansible-lint\b/,
	// npx tsx (TypeScript runner for tests)
	/^\s*npx\s+tsx\b/,
	// PDF text extraction
	/^\s*pdftotext\b/,
	// Shell syntax checking
	/^\s*bash\s+-n\b/,
	// Font listing
	/^\s*fc-list\b/,
	// Shell loops (destructive body still caught by DESTRUCTIVE_PATTERNS)
	/^\s*for\b/,
	// Go toolchain (read-only)
	/^\s*go\s+(list|version|doc|env|vet|mod\s+(graph|verify|why))\b/i,
	// Google Cloud Storage (read-only)
	/^\s*gsutil\s+(ls|cat|stat|du)\b/i,
	// OpenShift / Kubernetes CLI (read-only)
	/^\s*(oc|kubectl)\s+(get|describe|logs|status|explain|version|whoami|project|api-resources|api-versions|config\s+(view|get-contexts|current-context))\b/i,
	// Path / text utilities
	/^\s*basename\b/,
	/^\s*dirname\b/,
	/^\s*tr\b/,
	/^\s*cut\b/,
	/^\s*tac\b/,
	/^\s*column\b/,
	/^\s*xargs\b/,
	/^\s*realpath\b/,
	/^\s*readlink\b/,
	/^\s*getconf\b/,
	/^\s*openssl\b/,
	/^\s*base64\b/,
	/^\s*sha256sum\b/,
	/^\s*md5sum\b/,
	/^\s*hexdump\b/,
	/^\s*xxd\b/,
	/^\s*acli\s+(jira\s+)?(--action\s+)?(getIssue|getIssueList|getFieldValue|getComments|getAttachmentList|getProjectList|getComponentList|getVersionList|getWorkflowList|getFilterList|getFilter|getBoardList|getSprintList|getStatusList|getLinkTypeList|getSecurityLevelList|run)\b/i,
	// acli jira positional subcommands (read-only)
	/^\s*acli\s+jira\s+project\s+(list|view)\b/i,
	/^\s*acli\s+jira\s+workitem\s+(view|search)\b/i,
	/^\s*acli\s+jira\s+workitem\s+comment\s+(list|visibility)\b/i,
	/^\s*acli\s+jira\s+workitem\s+attachment\s+list\b/i,
	/^\s*acli\s+jira\s+workitem\s+link\s+(list|type)\b/i,
	/^\s*acli\s+jira\s+workitem\s+watcher\s+list\b/i,
	/^\s*acli\s+jira\s+board\s+(get|search|list-projects|list-sprints)\b/i,
	/^\s*acli\s+jira\s+sprint\s+(view|list-workitems)\b/i,
	/^\s*acli\s+jira\s+filter\s+(get|get-columns|list|search)\b/i,
	/^\s*acli\s+jira\s+dashboard\s+search\b/i,
	/^\s*acli\s+jira\s+component\s+(list|get)\b/i,
	/^\s*acli\s+jira\s+auth\s+status\b/i,
	/^\s*acli\s+jira\s+version\s+list\b/i,
	/^\s*acli\b.*--help\b/i,
	// gws (Google Workspace) read-only operations
	/^\s*gws\s+(--help|-h)\b/i,
	/^\s*gws\s+\S+\s+(--help|-h)\b/i,
	/^\s*gws\s+schema\b/i,
	/^\s*gws\s+\S+\s+\+read\b/i,
	/^\s*gws\s+\S+\s+(\S+\s+)?(get|list|export|download|listLabels|generateIds|getByDataFilter|getStartPageToken)\b/i,
];

/**
 * Normalize a command for safe-pattern matching.
 * - Strip leading comment lines (# ...)
 * - Strip leading `cd <path> &&` or `cd <path>;` prefixes
 * - Normalize absolute binary paths to bare command names
 */
export function normalizeCommand(command: string): string {
	let cmd = command;
	// Strip leading comment lines
	cmd = cmd.replace(/^(\s*#[^\n]*\n)+/, "");
	cmd = cmd.trimStart();
	// Strip leading `cd <path> &&` or `cd <path>;` prefixes (repeated)
	let prev = "";
	while (prev !== cmd) {
		prev = cmd;
		cmd = cmd.replace(/^\s*cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*(&&|;)\s*/, "");
	}
	// Normalize absolute paths to common binaries (e.g., /usr/bin/curl -> curl)
	cmd = cmd.replace(/^\s*\/(?:usr\/(?:local\/)?)?(?:s?bin)\/(\w+)/, "$1");
	return cmd;
}

export function isSafeCommand(command: string): boolean {
	// --help is always safe (help output never modifies anything)
	if (/(?:^|\s)--help(?:\s|$)/.test(command)) return true;

	// Normalize: strip cd prefixes, comments, absolute paths for safe matching
	const normalized = normalizeCommand(command);

	// Destructive check runs against the NORMALIZED command so that
	// words in stripped comment lines (e.g. "code" matching the VS Code
	// editor pattern) don't cause false positives. cd-stripping is safe
	// because destructive patterns use \b word boundaries, not ^ anchors.
	const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(normalized));
	const isSafe = SAFE_PATTERNS.some((p) => p.test(normalized));
	return !isDestructive && isSafe;
}

export interface TodoItem {
	step: number;
	text: string;
	completed: boolean;
}

export function cleanStepText(text: string): string {
	let cleaned = text
		.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1") // Remove bold/italic
		.replace(/`([^`]+)`/g, "$1") // Remove code
		.replace(
			/^(Use|Run|Execute|Create|Write|Read|Check|Verify|Update|Modify|Add|Remove|Delete|Install)\s+(the\s+)?/i,
			"",
		)
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length > 0) {
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
	}
	return cleaned;
}

export function extractTodoItems(message: string): TodoItem[] {
	const items: TodoItem[] = [];
	const headerMatch = message.match(/^#{0,6}\s*\*{0,2}Plan:?\*{0,2}\s*\n/im);
	if (!headerMatch) return items;

	const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
	const numberedPattern = /^\s*(?:#{1,6}\s+)?\*{0,2}(\d+)[.)]\*{0,2}\s+\*{0,2}([^*\n]+)/gm;

	for (const match of planSection.matchAll(numberedPattern)) {
		const text = match[2]
			.trim()
			.replace(/\*{1,2}$/, "")
			.trim();
		if (text.length > 5 && !text.startsWith("```") && !text.startsWith("/") && !text.startsWith("-")) {
			const cleaned = cleanStepText(text);
			if (cleaned.length > 3) {
				items.push({ step: Number(match[1]), text: cleaned, completed: false });
			}
		}
	}
	return items;
}

export function extractDoneSteps(message: string): number[] {
	const steps: number[] = [];
	for (const match of message.matchAll(/\[DONE:(\d+)\]/gi)) {
		const step = Number(match[1]);
		if (Number.isFinite(step)) steps.push(step);
	}
	return steps;
}

/**
 * Detect step completion from natural-language patterns in assistant text.
 * Matches phrases like "Step 3 is done", "completed step 2", "✅ Step 1", etc.
 */
export function extractNaturalDoneSteps(message: string): number[] {
	const steps: number[] = [];
	const patterns = [
		/✅\s*(?:step\s*)?(\d+)/gi,
		/step\s+(\d+)\s+(?:is\s+)?(?:done|completed|finished|complete)/gi,
		/(?:completed|finished|done with|done:?)\s+step\s+(\d+)/gi,
		/^\s*(?:#{1,3}\s+)?step\s+(\d+)\s*[:\-–—]/gim,
	];
	for (const pattern of patterns) {
		for (const match of message.matchAll(pattern)) {
			const step = Number(match[1]);
			if (Number.isFinite(step) && !steps.includes(step)) steps.push(step);
		}
	}
	return steps;
}

export function markCompletedSteps(text: string, items: TodoItem[]): number {
	// Explicit [DONE:n] markers (highest priority)
	const doneSteps = extractDoneSteps(text);
	// Natural-language detection as fallback
	const naturalSteps = extractNaturalDoneSteps(text);

	const allSteps = [...new Set([...doneSteps, ...naturalSteps])];
	let marked = 0;
	for (const step of allSteps) {
		const item = items.find((t) => t.step === step && !t.completed);
		if (item) {
			item.completed = true;
			marked++;
		}
	}
	return marked;
}
