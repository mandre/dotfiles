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
	/(^|[^<2])>(?!>)(?!&?\s*(\/dev\/null|\/tmp\/))/,
	/>>(?!\s*(\/dev\/null|\/tmp\/))/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bcurl\b.*(-o|--output)\s+(?!\/tmp\/)\S+/i,
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
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
	/^\s*git\s+ls-/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*node\s+--version/i,
	/^\s*python\s+--version/i,
	/^\s*curl\s/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/,
	/^\s*sed\s+-n/i,
	/^\s*awk\b/,
	/^\s*rg\b/,
	/^\s*fd\b/,
	/^\s*bat\b/,
	/^\s*eza\b/,
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
	/^\s*acli\b.*--help\b/i,
];

export function isSafeCommand(command: string): boolean {
	const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
	const isSafe = SAFE_PATTERNS.some((p) => p.test(command));
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
	if (cleaned.length > 50) {
		cleaned = `${cleaned.slice(0, 47)}...`;
	}
	return cleaned;
}

export function extractTodoItems(message: string): TodoItem[] {
	const items: TodoItem[] = [];
	const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
	if (!headerMatch) return items;

	const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
	const numberedPattern = /^\s*(\d+)[.)]\s+\*{0,2}([^*\n]+)/gm;

	for (const match of planSection.matchAll(numberedPattern)) {
		const text = match[2]
			.trim()
			.replace(/\*{1,2}$/, "")
			.trim();
		if (text.length > 5 && !text.startsWith("`") && !text.startsWith("/") && !text.startsWith("-")) {
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
