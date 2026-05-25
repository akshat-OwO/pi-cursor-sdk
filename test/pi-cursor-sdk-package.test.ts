import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { __testUtils } from "../scripts/pi-cursor-sdk-package.mjs";

const {
	REPO_ROOT,
	applyMode,
	isRemotePiCursorSdkSource,
	isLocalPiCursorSdkSource,
	localPackageSource,
} = __testUtils;

describe("pi-cursor-sdk-package", () => {
	it("detects remote package sources", () => {
		expect(isRemotePiCursorSdkSource("https://github.com/akshat-OwO/pi-cursor-sdk")).toBe(true);
		expect(isRemotePiCursorSdkSource("npm:pi-cursor-sdk")).toBe(true);
		expect(isRemotePiCursorSdkSource("/other/path")).toBe(false);
	});

	it("detects local package sources", () => {
		const settingsDir = join(REPO_ROOT, ".pi");
		expect(isLocalPiCursorSdkSource(REPO_ROOT, REPO_ROOT, settingsDir)).toBe(true);
		expect(isLocalPiCursorSdkSource("..", REPO_ROOT, settingsDir)).toBe(true);
		expect(isLocalPiCursorSdkSource("/tmp/other", REPO_ROOT, settingsDir)).toBe(false);
	});

	it("replaces remote with local in packages", () => {
		const settingsDir = join(REPO_ROOT, ".pi");
		const result = applyMode(
			["npm:other", "https://github.com/akshat-OwO/pi-cursor-sdk"],
			"local",
			REPO_ROOT,
			settingsDir,
			"project",
			"https://github.com/akshat-OwO/pi-cursor-sdk",
		);
		expect(result.removed).toEqual(["https://github.com/akshat-OwO/pi-cursor-sdk"]);
		expect(result.added).toBe("..");
		expect(result.packages).toEqual(["npm:other", ".."]);
	});

	it("replaces local with remote in packages", () => {
		const settingsDir = join(REPO_ROOT, ".pi");
		const remote = "git:github.com/akshat-OwO/pi-cursor-sdk";
		const result = applyMode([REPO_ROOT], "remote", REPO_ROOT, settingsDir, "global", remote);
		expect(result.removed).toEqual([REPO_ROOT]);
		expect(result.added).toBe(remote);
		expect(result.packages).toEqual([remote]);
	});

	it("writes settings via CLI", () => {
		const tempRoot = mkdtempSync(join(tmpdir(), "pi-cursor-sdk-package-"));
		const settingsPath = join(tempRoot, "settings.json");
		writeFileSync(
			settingsPath,
			`${JSON.stringify({ packages: ["npm:pi-cursor-sdk"] }, null, 2)}\n`,
			"utf8",
		);

		execFileSync(process.execPath, ["scripts/pi-cursor-sdk-package.mjs", "local"], {
			cwd: REPO_ROOT,
			env: { ...process.env, PI_SETTINGS_PATH: settingsPath },
			stdio: "pipe",
		});

		const saved = JSON.parse(readFileSync(settingsPath, "utf8")) as { packages: string[] };
		expect(saved.packages).toEqual([REPO_ROOT]);
		rmSync(tempRoot, { recursive: true, force: true });
	});
});
