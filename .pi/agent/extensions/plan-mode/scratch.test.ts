import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ScratchSpace, shellQuote } from "./scratch.js";
import { isSafeCommand } from "./utils.js";

const exec = promisify(execFile);
let passed = 0;
async function test(name: string, run: (scratch: ScratchSpace) => Promise<void>) {
	const scratch = new ScratchSpace();
	try { await run(scratch); passed++; console.log(`PASS: ${name}`); }
	finally { await rm(scratch.root, { recursive: true, force: true }); }
}
const api = "gh api repos/o/r/actions/artifacts/123/zip";

await test("scratch is lazy, private, and scopes mktemp without shell expansion", async (scratch) => {
	await assert.rejects(lstat(scratch.root), { code: "ENOENT" });
	const command = await scratch.prepare("mktemp -d");
	assert(command);
	const result = await exec("bash", ["-c", command]);
	assert(result.stdout.trim().startsWith(scratch.root + "/dir."));
	assert.equal((await lstat(scratch.root)).mode & 0o777, 0o700);
	assert.equal(await scratch.prepare("mktemp"), null);
	assert.equal(await scratch.prepare("mktemp -d /tmp/elsewhere.XXXXXX"), null);
	assert.equal(await scratch.prepare("mktemp -d; touch /tmp/no"), null);
});
await test("downloads accept only GET/HEAD sources and one new scratch target", async (scratch) => {
	for (const source of [api, "gh api -X GET search/issues -f q=ci", "curl -sSL https://example.test/archive.zip", "curl -I https://example.test/archive.zip"]) {
		const prepared = await scratch.prepare(`${source} > ${scratch.root}/archive.zip`);
		assert(prepared?.startsWith("set -C; "));
	}
	for (const source of ["echo text", "git show HEAD:file", "gh pr diff 1", "gh api endpoint -X POST", "gh api graphql -f 'query={viewer{login}}'",
		"curl -X POST https://example.test", "curl -o /tmp/file https://example.test", "curl file:///etc/passwd", "curl https://a.test https://b.test",
		`${api}; echo text`, `${api} | head`, "python3 -c pass"]) {
		assert.equal(await scratch.prepare(`${source} > ${scratch.root}/archive.zip`), null, source);
	}
});
await test("arbitrary tmp paths, traversal, extra redirects, append, and output descriptors remain blocked", async (scratch) => {
	for (const command of [`${api} > /tmp/archive.zip`, `${api} > ./archive.zip`, `${api} > ${scratch.root}/../escape.zip`,
		`${api} >> ${scratch.root}/archive.zip`, `${api} >| ${scratch.root}/archive.zip`, `${api} 2> ${scratch.root}/archive.zip`,
		`${api} > ${scratch.root}/archive.zip 2>&1`, `${api} > ${scratch.root}/archive.zip; echo hi`,
		`${api} > ${scratch.root}/archive.zip > ${scratch.root}/other.zip`, `${api} > ${scratch.root}/a.zip &`,
		`${api} > $(mktemp)`, `${api} > ${scratch.root}/a.zip\nrm file`]) {
		assert.equal(await scratch.prepare(command), null, command);
	}
});
await test("existing files, symlinked parents and targets, and foreign roots are rejected", async (scratch) => {
	await scratch.prepare("mktemp -d");
	await writeFile(join(scratch.root, "existing"), "keep");
	await symlink("existing", join(scratch.root, "link"));
	await mkdir(join(scratch.root, "directory"));
	await symlink(join(scratch.root, "directory"), join(scratch.root, "alias"));
	const outside = await mkdtemp(join(tmpdir(), "pi-scratch-outside-"));
	try {
		await symlink(outside, join(scratch.root, "outside"));
		for (const target of ["existing", "link", "alias/new", "outside/new"])
			assert.equal(await scratch.prepare(`${api} > ${scratch.root}/${target}`), null);
		assert.equal(await scratch.prepare(`${api} > ${outside}/new`), null);
	} finally { await rm(outside, { recursive: true, force: true }); }
	assert.equal(await readFile(join(scratch.root, "existing"), "utf8"), "keep");
});
await test("prepared downloads use literal arguments and noclobber at execution time", async (scratch) => {
	const bin = await mkdtemp(join(tmpdir(), "pi-scratch-bin-"));
	try {
		const gh = join(bin, "gh");
		await writeFile(gh, `#!${process.execPath}\nrequire('node:assert/strict').deepEqual(process.argv.slice(2), ['api', 'repos/o/r/actions/artifacts/123/zip']); process.stdout.write('ZIP bytes');\n`);
		await chmod(gh, 0o755);
		const destination = join(scratch.root, "archive with ' quotes.zip");
		const command = await scratch.prepare(`${api} > ${shellQuote(destination)}`);
		assert(command);
		const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
		await exec("bash", ["-c", command], { env });
		assert.equal(await readFile(destination, "utf8"), "ZIP bytes");
		assert.equal(await scratch.prepare(`${api} > ${shellQuote(destination)}`), null);
		await assert.rejects(exec("bash", ["-c", command], { env }));
		assert.equal(await readFile(destination, "utf8"), "ZIP bytes");
	} finally { await rm(bin, { recursive: true, force: true }); }
});
await test("CLI workflow downloads a ZIP and reads one log without extraction", async (scratch) => {
	const bin = await mkdtemp(join(tmpdir(), "pi-scratch-cli-"));
	try {
		const archive = "UEsDBBQAAAAAADJ9bF1NiUsaHgAAAB4AAAAOAAAAbG9ncy96YXFhci5sb2dzZXJ2aWNlIGZhaWxlZAp0cmFjZWJhY2sgaGVyZQpQSwECFAMUAAAAAAAyfWxdTYlLGh4AAAAeAAAADgAAAAAAAAAAAAAAgAEAAAAAbG9ncy96YXFhci5sb2dQSwUGAAAAAAEAAQA8AAAASgAAAAAA";
		await writeFile(join(bin, "gh"), `#!${process.execPath}\nprocess.stdout.write(Buffer.from('${archive}', 'base64'));\n`, { mode: 0o755 });
		const creation = await scratch.prepare("mktemp -d");
		const dir = (await exec("bash", ["-c", creation!])).stdout.trim();
		const zip = join(dir, "artifact.zip");
		const download = await scratch.prepare(`${api} > ${shellQuote(zip)}`);
		await exec("bash", ["-c", download!], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
		const list = `unzip -l ${shellQuote(zip)}`;
		const read = `unzip -p ${shellQuote(zip)} logs/zaqar.log | head -1`;
		assert(isSafeCommand(list)); assert(isSafeCommand(read));
		assert.match((await exec("bash", ["-c", list])).stdout, /logs\/zaqar.log/);
		assert.equal((await exec("bash", ["-c", read])).stdout, "service failed\n");
		await assert.rejects(lstat(join(dir, "logs")), { code: "ENOENT" });
	} finally { await rm(bin, { recursive: true, force: true }); }
});

await test("parallel downloads cannot overwrite the same destination", async (scratch) => {
	const target = join(scratch.root, "race.zip");
	const results = await Promise.all([scratch.prepare(`${api} > ${target}`), scratch.prepare(`${api} > ${target}`)]);
	assert(results.every(Boolean));
	// Use an existing local executable as a stand-in for the already-approved source.
	const commands = results.map((command) => command!.replace(/'gh'[^>]+>/, "printf data >"));
	const executed = await Promise.allSettled(commands.map((command) => exec("bash", ["-c", command])));
	assert.equal(executed.filter((result) => result.status === "fulfilled").length, 1);
	assert.equal(await readFile(target, "utf8"), "data");
});
await test("archive inspection only admits listing or selected-member stdout reads", async () => {
	for (const command of ["unzip -l /tmp/archive.zip", "unzip -Z1 file.zip", "unzip -p file.zip logs/zaqar.log | head -200"])
		assert(isSafeCommand(command), command);
	for (const command of ["unzip file.zip", "unzip -d /tmp/out file.zip", "unzip -p file.zip", "unzip -p file.zip -d /tmp/out",
		"unzip -l -q file.zip", "unzip -p file.zip log > /tmp/log", "unzip -p file.zip log | python3 -c pass"])
		assert(!isSafeCommand(command), command);
});
console.log(`\nScratch policy tests: ${passed} passed`);
