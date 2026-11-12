import { Kind, parse } from "graphql";

/** Parse the entire document, including operations after fragments or comments. */
export function isQueryDocument(source: string): boolean {
	if (source.length > 64 * 1024) return false;
	try {
		const document = parse(source, { maxTokens: 10000 });
		const operations = document.definitions.filter((node) => node.kind === Kind.OPERATION_DEFINITION);
		return operations.length === 1 && operations[0].operation === "query" &&
			document.definitions.every((node) => node.kind === Kind.FRAGMENT_DEFINITION || node.kind === Kind.OPERATION_DEFINITION);
	} catch {
		return false;
	}
}

/** Admit explicit inspection verbs and a bounded subset of gh api arguments. */
export function isSafeGhCommand(args: string[], allowGraphql = true): boolean {
	if (args.length === 1 && ["--help", "--version"].includes(args[0])) return true;
	if (args[0] !== "api") {
		const verbs: Record<string, string[]> = {
			pr: ["view", "list", "diff", "checks", "status"],
			issue: ["view", "list", "status"],
			repo: ["view", "list"],
			run: ["view", "list"],
			workflow: ["view", "list"],
			release: ["view", "list"],
			auth: ["status"],
		};
		return (verbs[args[0]] ?? []).includes(args[1]) &&
			!args.slice(2).some((arg) => /^(?:--(?:output|output-file|out|web|log-failed-file)|-o)(?:=|$)/.test(arg));
	}
	let endpoint: string | undefined, method: string | undefined;
	const fields = new Map<string, string>();
	for (let i = 1; i < args.length; i++) {
		const arg = args[i];
		if (!arg.startsWith("-")) {
			if (endpoint !== undefined) return false;
			endpoint = arg;
			continue;
		}
		if (["--paginate", "--slurp", "--silent", "--include", "-i"].includes(arg)) continue;
		const match = /^(--(?:raw-field|field|method|jq|template|hostname)|-[fFXqHt])(?:=(.*))?$/.exec(arg);
		if (!match || match[1] === "-H") return false;
		const flag = match[1];
		const value = match[2] ?? args[++i];
		if (value === undefined) return false;
		if (["--method", "-X"].includes(flag)) {
			if (method !== undefined) return false;
			method = value;
		} else if (["--raw-field", "--field", "-f", "-F"].includes(flag)) {
			const field = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/.exec(value);
			if (!field || fields.has(field[1]) || field[2].startsWith("@")) return false;
			fields.set(field[1], field[2]);
		}
	}
	if (!endpoint || !/^\/?[A-Za-z0-9_][^\s:#]*$/.test(endpoint)) return false;
	let path: string;
	try { path = decodeURIComponent(endpoint.split("?")[0]); } catch { return false; }
	if (path.includes("\\") || path.split("/").some((part) => part === "." || part === "..") || /[%?#\x00-\x20\x7f]/.test(path)) return false;
	if (path.replace(/^\//, "").replace(/\/+$/, "").toLowerCase() === "graphql") {
		// Alternate encodings and URL query parameters must not bypass document validation.
		return allowGraphql && ["graphql", "/graphql"].includes(endpoint) &&
			(method === undefined || method === "POST") && isQueryDocument(fields.get("query") ?? "");
	}
	// Fields change gh's default method to POST. REST parameters require explicit GET.
	return (method === undefined && fields.size === 0) || method === "GET";
}
