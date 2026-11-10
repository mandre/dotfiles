import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getEventListeners } from "node:events";
import { downloadArtifact, inspectArtifact, MAX_ARCHIVE_BYTES, MAX_MEMBER_BYTES, registerArtifactTool } from "./artifacts.js";

// ZIP fixtures support forged metadata without extracting anything to disk.
function zip(files: { name: string; data?: Buffer; size?: number; mode?: number; flags?: number }[]): Buffer {
	const local: Buffer[] = [], central: Buffer[] = [];
	let offset = 0;
	for (const file of files) {
		const name = Buffer.from(file.name), data = file.data ?? Buffer.from("hello\nworld\n");
		const packed = deflateRawSync(data);
		let crc = 0xffffffff;
		for (const byte of data) {
			crc ^= byte;
			for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
		}
		const header = Buffer.alloc(30);
		header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
		header.writeUInt16LE(file.flags ?? 0, 6); header.writeUInt16LE(8, 8);
		header.writeUInt32LE((crc ^ 0xffffffff) >>> 0, 14);
		header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(file.size ?? data.length, 22);
		header.writeUInt16LE(name.length, 26);
		const directory = Buffer.alloc(46);
		directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(0x0314, 4);
		header.copy(directory, 6, 4, 30);
		directory.writeUInt32LE(((file.mode ?? 0x8000) << 16) >>> 0, 38);
		directory.writeUInt32LE(offset, 42);
		local.push(header, name, packed); central.push(directory, name);
		offset += header.length + name.length + packed.length;
	}
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(Buffer.concat(central).length, 12); end.writeUInt32LE(offset, 16);
	return Buffer.concat([...local, ...central, end]);
}
const input = { repository: "gophercloud/gophercloud", artifactId: 13132427509 };
let passed = 0;
async function test(name: string, run: () => Promise<void>) { await run(); passed++; console.log(`PASS: ${name}`); }

await test("artifact listing and selected UTF-8 member pagination", async () => {
	const data = zip([{ name: "logs/zaqar-wsgi.log" }, { name: "local.conf" }]);
	const listing = await inspectArtifact(data, { ...input, limit: 1 });
	assert.equal(listing.totalEntries, 2); assert.equal(listing.nextOffset, 2);
	assert.equal(listing.entries![0].name, "logs/zaqar-wsgi.log");
	const read = await inspectArtifact(data, { ...input, member: "logs/zaqar-wsgi.log", offset: 2, limit: 1 });
	assert.equal(read.text, "world"); assert.equal(read.nextOffset, 3);
});
await test("artifact rejects malformed ZIPs, invalid inputs, special members, and oversized expansion", async () => {
	await assert.rejects(inspectArtifact(Buffer.from("not a zip"), input));
	for (const change of [{ repository: "--help" }, { artifactId: 0 }, { artifactId: 1.1 }, { member: "../secret" }, { offset: 0 }, { limit: 1001 }])
		await assert.rejects(inspectArtifact(zip([]), { ...input, ...change }));
	for (const file of [{ name: "../escape" }, { name: "/absolute" }, { name: "a\\b" }, { name: "link", mode: 0xa000 },
		{ name: "encrypted", flags: 1 }, { name: "huge", size: 257 * 1024 * 1024 }])
		await assert.rejects(inspectArtifact(zip([file]), input));
	await assert.rejects(inspectArtifact(zip([{ name: "same" }, { name: "same" }]), input));
	await assert.rejects(inspectArtifact(zip(Array.from({ length: 10001 }, (_, i) => ({ name: `log-${i}` }))), input));
	await assert.rejects(inspectArtifact(Buffer.alloc(MAX_ARCHIVE_BYTES + 1), input));
	await assert.rejects(inspectArtifact(zip([{ name: "large", size: MAX_MEMBER_BYTES + 1 }]), { ...input, member: "large" }));
	await assert.rejects(inspectArtifact(zip([{ name: "bomb", data: Buffer.alloc(MAX_MEMBER_BYTES + 1, 65), size: 1 }]), { ...input, member: "bomb" }));
});
await test("artifact reads reject binary data, missing files, and invalid UTF-8", async () => {
	for (const data of [Buffer.from([0]), Buffer.from([0xff])])
		await assert.rejects(inspectArtifact(zip([{ name: "binary", data }]), { ...input, member: "binary" }));
	await assert.rejects(inspectArtifact(zip([]), { ...input, member: "missing" }));
});
await test("artifact text and listing output stay bounded with explicit truncation", async () => {
	const text = await inspectArtifact(zip([{ name: "long", data: Buffer.from('"'.repeat(50000)) }]), { ...input, member: "long" });
	assert(text.truncated); assert(Buffer.byteLength(JSON.stringify(text)) < 32 * 1024);
	const listing = await inspectArtifact(zip(Array.from({ length: 100 }, (_, i) => ({ name: `${i}-${'"'.repeat(500)}` }))), input);
	assert(listing.entries!.length > 0 && listing.entries!.length < 50);
	assert(Buffer.byteLength(JSON.stringify(listing)) < 32 * 1024);
});
await test("artifact cancellation and tool registration", async () => {
	const controller = new AbortController(); controller.abort();
	await assert.rejects(inspectArtifact(zip([]), input, controller.signal));
	let tool: any;
	registerArtifactTool({ registerTool(value: any) { tool = value; } } as any);
	assert.equal(tool.name, "github_artifact"); assert.equal(tool.annotations.readOnlyHint, true);
	assert(tool.outputSchema);
	const active = new AbortController();
	const reading = inspectArtifact(zip(Array.from({ length: 1000 }, (_, i) => ({ name: `log-${i}` }))), input, active.signal);
	setImmediate(() => active.abort());
	await assert.rejects(reading);
	assert.equal(getEventListeners(active.signal, "abort").length, 0);
	const success = new AbortController();
	await inspectArtifact(zip([{ name: "log" }]), { ...input, member: "log" }, success.signal);
	assert.equal(getEventListeners(success.signal, "abort").length, 0);
});
await test("artifact download uses fixed shell-free arguments, rejects failures and bounds output", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-artifact-test-"));
	const oldPath = process.env.PATH;
	try {
		const fixture = zip([{ name: "zaqar.log" }]);
		const script = (body: string) => writeFileSync(join(dir, "gh"), `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
		process.env.PATH = `${dir}:${oldPath}`;
		script(`require('node:assert/strict').deepEqual(process.argv.slice(2), ${JSON.stringify(["api", "--hostname", "github.com", `repos/${input.repository}/actions/artifacts/${input.artifactId}/zip`])}); process.stdout.write(Buffer.from('${fixture.toString("base64")}', 'base64'));`);
		assert.deepEqual(await downloadArtifact(input, dir), fixture);
		let tool: any;
		registerArtifactTool({ registerTool(value: any) { tool = value; } } as any);
		const result = await tool.execute("artifact", { ...input, member: "zaqar.log" }, undefined, undefined, { cwd: dir });
		assert.equal(result.structuredContent.text, "hello\nworld\n");
		assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
		assert.deepEqual(result.details, result.structuredContent);
		script("process.exit(1)"); await assert.rejects(downloadArtifact(input, dir));
		script(`process.stdout.write(Buffer.alloc(${MAX_ARCHIVE_BYTES + 1}));`);
		await assert.rejects(downloadArtifact(input, dir));
		script("setInterval(() => {}, 1000)");
		const controller = new AbortController();
		const pending = downloadArtifact(input, dir, controller.signal);
		controller.abort(); await assert.rejects(pending);
	} finally { process.env.PATH = oldPath; rmSync(dir, { recursive: true, force: true }); }
});
console.log(`\nArtifact tests: ${passed} passed`);
