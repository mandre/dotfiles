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
	/\bgit\s+(add|commit|push|pull|merge(?!-)|rebase|reset|checkout|branch\s+-[dD]|stash(?!\s+(list|show)\b)|cherry-pick|revert|tag\s+(-[adfms]|--delete|--force|--create-reflog)|init|clone)/i,
	/\bcurl\b[^|]*(-o|--output)\s+(?!\/tmp\/|\/dev\/null)\S+/i,
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
	/^\s*git\s+(-C\s+\S+\s+|--no-pager\s+)*(status|log|diff|show|branch|remote|config\s+(--global\s+|--local\s+|--system\s+|--worktree\s+|--show-origin\s+)*(--get|--get-all|--list|--show-origin\b)|tag(\s+(-[lnv]|--sort|--list|--contains|--merged|--no-merged|--points-at)\b|\s*$)|merge-base|for-each-ref|rev-parse|stash\s+(list|show))/i,
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
	// tmux (read-only)
	/^\s*tmux\s+(capture-pane|list-sessions|list-windows|list-panes|list-buffers|list-clients|list-commands|list-keys|display-message|show-options|show-environment|show-buffer|has-session|info|display-panes|ls)\b/i,
	// Documentation
	/^\s*man\b/,
	// Package info (rpm)
	/^\s*rpm\s+(-q[afilpRs]*|-V|--query|--verify)\b/i,
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
	// gws (Google Workspace) read-only operations
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
	// Strip leading `cd <path> &&`, `cd <path>;`, or `cd <path>\n` prefixes (repeated).
	// Horizontal whitespace only before the separator so the newline alternative
	// below isn't pre-consumed by a greedy \s*.
	// Also handles optional stderr redirects between path and separator
	// (e.g. `cd /path 2>&1;`, `cd /path 2>/dev/null &&`).
	let prev = "";
	while (prev !== cmd) {
		prev = cmd;
		cmd = cmd.replace(/^[ \t]*cd\s+(?:"[^"]*"|'[^']*'|\S+)(?:\s+2>(?:&\d*|\/dev\/null))?[ \t]*(?:&&|;|\n)\s*/, "");
	}
	// Normalize absolute paths to common binaries (e.g., /usr/bin/curl -> curl)
	cmd = cmd.replace(/^\s*\/(?:usr\/(?:local\/)?)?(?:s?bin)\/(\w+)/, "$1");
	return cmd;
}

/** Parse a conservative shell subset. Reject expansion, redirection and execution wrappers. */
export function isSafeCommand(command: string): boolean {
	const commands: string[][] = [];
	let words: string[] = [], word = "", quote = "", started = false;
	const endWord = () => { if (started) words.push(word); word = ""; started = false; };
	const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };
	for (let i = 0; i < command.length; i++) {
		const c = command[i];
		if (c === "\\" && quote !== "'") {
			if (++i >= command.length || command[i] === "\n") return false;
			word += command[i]; started = true; continue;
		}
		if (quote) {
			if (c === quote) quote = "";
			else {
				if (quote === '"' && (c === "$" || c === "`")) return false;
				word += c;
			}
			continue;
		}
		if (c === "'" || c === '"') { quote = c; started = true; continue; }
		if (c === "#" && !started) { while (i < command.length && command[i] !== "\n") i++; endCommand(); continue; }
		if ("$`<>(){}".includes(c)) return false;
		if (c === ";" || c === "\n" || c === "|" || c === "&") {
			if (c === "&" && command[i + 1] !== "&") return false;
			if ((c === "&" || c === "|") && command[i + 1] === c) i++;
			endCommand(); continue;
		}
		if (/\s/.test(c)) { endWord(); continue; }
		word += c; started = true;
	}
	if (quote) return false;
	endCommand();
	return commands.length > 0 && commands.every((args) => {
		const normalized = normalizeCommand(args[0]);
		const rest = args.slice(1);
		if (normalized === "cd") return rest.length === 1 && !rest[0].startsWith("-");
		// Help/version are admitted only for a single invocation with no other arguments.
		if (rest.length === 1 && ["--help", "--version"].includes(rest[0])) return /^[\w./-]+$/.test(args[0]);
		if (/^(python3?|node|npx|awk|xargs|env|for|bash|openssl|pdftotext|ansible-lint)$/.test(normalized)) return false;
		if (normalized === "sed") return rest[0] === "-n" && /^\d+(?:,\d+)?p$/.test(rest[1] ?? "") && rest.slice(2).every((arg) => !arg.startsWith("-"));
		if (normalized === "uv" && !/^(?:pip\s+)?(?:list|show|tree|version)\b/.test(rest.join(" "))) return false;
		if (normalized === "date" && rest.some((arg) => /^-s|^--(?:set|date|file)(?:=|$)/.test(arg))) return false;
		if (normalized === "xxd" && (rest.length > 1 || rest.some((arg) => arg.startsWith("-")))) return false;
		if (normalized === "tmux" && rest[0] === "display-panes") return false;
		const text = [normalized, ...rest].join(" ");
		if (DESTRUCTIVE_PATTERNS.some((p) => p.test(text))) return false;
		// These options execute programs or write files even on inspection commands.
		if (rest.some((arg) => /^(?:-exec|-execdir|-ok|-okdir|-delete|-fprint\w*|-fls|--exec(?:-batch)?|--pre|--pre-glob|--output|--output-file|--out|--upload-file|--post-file|--post-data|--request|--data\w*|--config)(?:=|$)/.test(arg))) return false;
		if (normalized === "wget") return false;
		if (normalized === "curl" && rest.some((arg) => arg.startsWith("-") && !/^(?:-[sSILfik]+|--(?:silent|show-error|head|location|fail|insecure))$/.test(arg))) return false;
		if (normalized === "gh" && (/\b(?:review|download)\b/.test(text) || rest.some((arg) => /^-[fF]|^--(?:field|raw-field|input|method)(?:=|$)/.test(arg)))) return false;
		if (normalized === "gws" && /\b(?:export|download)\b/.test(text)) return false;
		if (normalized === "go" && /\b(?:vet|generate|run|test)\b|(?:^|\s)-w(?:\s|$)/.test(text)) return false;
		if (/^(oc|kubectl)$/.test(normalized) && /\b(?:project|watch|proxy|exec)\b/.test(rest[0] ?? "")) return false;
		if (/^(npm|yarn)$/.test(normalized) && rest.includes("--fix")) return false;
		if (normalized === "git") {
			if (rest.some((arg) => /^(?:--output|-o|-c|--config-env)(?:=|$)/.test(arg))) return false;
			const gitArgs = [...rest];
			while (gitArgs[0] === "-C" || gitArgs[0] === "--no-pager") {
				if (gitArgs.shift() === "-C") gitArgs.shift();
			}
			const subcommand = gitArgs.shift();
			if (!["status", "log", "diff", "show", "branch", "remote", "ls-files", "ls-tree", "merge-base", "for-each-ref", "rev-parse", "stash", "tag", "config"].includes(subcommand ?? "")) return false;
			if (subcommand === "branch" && gitArgs.some((arg) => !["--show-current", "--list", "-a", "-r", "-v", "-vv", "--all", "--remotes"].includes(arg))) return false;
			if (subcommand === "remote" && gitArgs.some((arg) => arg !== "-v" && arg !== "--verbose")) return false;
			if (["tag", "config"].includes(subcommand ?? "") && gitArgs.some((arg) => /^(?:-[adfms]|--(?:delete|force|unset|add|replace|rename|remove|edit|set))(?:$|=|-)/.test(arg))) return false;
		}
		if (normalized === "sort" && rest.some((arg) => /^(-o|--output)/.test(arg))) return false;
		if (normalized === "jq" && rest.some((arg) => /^(--run-tests|-f|--from-file)/.test(arg))) return false;
		return SAFE_PATTERNS.some((p) => p.test(text));
	});
}

export interface TodoItem {
	step: number;
	text: string;
	completed: boolean;
	evidence?: string;
}

export function cleanStepText(text: string): string {
	let cleaned = text
		.replace(/~~([^~]+)~~/g, "$1") // Remove strikethrough
		.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1") // Remove bold/italic
		.replace(/`([^`]+)`/g, "$1") // Remove code
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length > 0) {
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
	}
	return cleaned;
}

export function extractTodoItems(message: string): TodoItem[] {
	const items: TodoItem[] = [];
	// Header match, tried as two alternatives:
	//  1) Bare form (backward compatible): the word "Plan" alone on its own
	//     line, optionally wrapped in heading marks / bold, with or without a
	//     trailing colon ("Plan", "## Plan", "### **Plan:**", ...).
	//  2) Loose form: any single line containing the whole word "plan"
	//     (case-insensitive) with other text around it, as long as it ends in
	//     a colon — e.g. "Plan (updated, reflecting progress so far):",
	//     "Understood — updated plan:", "Here's my updated plan:". The colon
	//     is required here (unlike the bare form) to disambiguate an actual
	//     header restatement from a step or sentence that merely mentions the
	//     word "plan" in passing. Numbered-list items and bullets are excluded
	//     so a step like "6. Update the plan.yaml file:" is never mistaken for
	//     a header.
	const headerMatch = message.match(
		/^(?:#{0,6}\s*\*{0,2}Plan:?\*{0,2}\s*\n|(?!\s*\d+[.)]\s)(?!\s*[-*+]\s)[ \t]*#{0,6}[ \t]*\*{0,2}[^\n]{0,120}?\bplan\b[^\n]{0,120}?:\*{0,2}[ \t]*\n)/im,
	);
	if (!headerMatch) return items;

	const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
	const numberedPattern = /^[ \t]*(?:#{1,6}[ \t]+)?\*{0,2}(\d+)[.)]\*{0,2}[ \t]+([^\n]+)/gm;

	for (const match of planSection.matchAll(numberedPattern)) {
		const text = match[2].trim();
		if (text.length > 5 && !text.startsWith("```") && !text.startsWith("-")) {
			const cleaned = cleanStepText(text);
			if (cleaned.length > 3) {
				items.push({ step: Number(match[1]), text: cleaned, completed: false });
			}
		}
	}
	return items;
}

export interface CompletionUpdate {
	step: number;
	evidence: string;
}

/** Validate the whole batch before mutating state. Repeated updates are no-ops. */
export function completeSteps(items: TodoItem[], updates: CompletionUpdate[]): number {
	if (updates.length === 0) throw new Error("Provide at least one completion update.");
	for (const update of updates) {
		if (!Number.isInteger(update.step) || update.step < 1 || !items.some((t) => t.step === update.step)) {
			throw new Error(`Unknown plan step: ${update.step}`);
		}
		if (typeof update.evidence !== "string" || !update.evidence.trim()) {
			throw new Error(`Completion evidence required for step ${update.step}.`);
		}
	}
	let marked = 0;
	for (const update of updates) {
		const item = items.find((t) => t.step === update.step)!;
		if (!item.completed) {
			item.completed = true;
			item.evidence = update.evidence.trim();
			marked++;
		}
	}
	return marked;
}
