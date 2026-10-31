import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Set PI_TEST_PACKAGE_ROOT for installations outside the managed release layout.
const install = join(homedir(), ".pi", "agent", "install");
const packageRoot = process.env.PI_TEST_PACKAGE_ROOT ?? join(
	install, "releases", readFileSync(join(install, "current-version"), "utf8").trim(),
	"node_modules", "@earendil-works", "pi-coding-agent",
);
const require = createRequire(join(packageRoot, "package.json"));
const { createJiti } = await import(pathToFileURL(require.resolve("jiti")).href);
const jiti = createJiti(import.meta.url, {
	alias: {
		"@earendil-works/pi-tui": require.resolve("@earendil-works/pi-tui"),
		typebox: require.resolve("typebox"),
	},
});
await jiti.import(new URL("./utils.test.ts", import.meta.url).href);
await jiti.import(new URL("./index.test.ts", import.meta.url).href);
