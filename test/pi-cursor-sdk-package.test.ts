import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { __testUtils } from "../scripts/pi-cursor-sdk-package.mjs";

const {
	REPO_ROOT,
	applyMode,
	buildPackageEntry,
	isRemotePiCursorSdkSource,
	isLocalPiCursorSdkSource,
	normalizeGitSlug,
} = __testUtils;

describe("pi-cursor-sdk-package", () => {
	it("detects canonical remote package sources", () => {
		expect(isRemotePiCursorSdkSource("https://github.com/akshat-OwO/pi-cursor-sdk")).toBe(true);
		expect(isRemotePiCursorSdkSource("git:github.com/fitchmultz/pi-cursor-sdk@v1")).toBe(true);
		expect(isRemotePiCursorSdkSource("npm:pi-cursor-sdk")).toBe(true);
		expect(isRemotePiCursorSdkSource("npm:pi-cursor-sdk@0.1.18")).toBe(true);
	});

	it("does not treat unrelated repos as pi-cursor-sdk", () => {
		expect(isRemotePiCursorSdkSource("https://github.com/other/pi-cursor-sdk-fork")).toBe(false);
		expect(isRemotePiCursorSdkSource("/other/path")).toBe(false);
		expect(normalizeGitSlug("https://github.com/foo/bar/tree/main/docs/pi-cursor-sdk")).toBe(
			"foo/bar/tree/main/docs/pi-cursor-sdk",
		);
		expect(
			isRemotePiCursorSdkSource("https://github.com/foo/bar/tree/main/docs/pi-cursor-sdk"),
		).toBe(false);
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

	it("preserves filtered package object when swapping source", () => {
		const settingsDir = join(REPO_ROOT, ".pi");
		const filtered = { source: "npm:pi-cursor-sdk", extensions: ["!legacy.ts"] };
		const result = applyMode(
			[filtered],
			"remote",
			REPO_ROOT,
			settingsDir,
			"global",
			"git:github.com/akshat-OwO/pi-cursor-sdk",
		);
		expect(result.packages).toEqual([
			{ source: "git:github.com/akshat-OwO/pi-cursor-sdk", extensions: ["!legacy.ts"] },
		]);
		expect(buildPackageEntry(filtered, "https://github.com/a/b")).toEqual({
			source: "https://github.com/a/b",
			extensions: ["!legacy.ts"],
		});
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

	it("shows help when --help is the first argument", () => {
		const out = execFileSync(process.execPath, ["scripts/pi-cursor-sdk-package.mjs", "--help"], {
			cwd: REPO_ROOT,
			encoding: "utf8",
		});
		expect(out).toContain("pi-cursor-sdk-package.mjs local");
	});

	it("fails with a clear message on invalid JSON", () => {
		const tempRoot = mkdtempSync(join(tmpdir(), "pi-cursor-sdk-package-invalid-"));
		const settingsPath = join(tempRoot, "settings.json");
		writeFileSync(settingsPath, "{ not-json", "utf8");
		expect(() =>
			execFileSync(process.execPath, ["scripts/pi-cursor-sdk-package.mjs", "local"], {
				cwd: REPO_ROOT,
				env: { ...process.env, PI_SETTINGS_PATH: settingsPath },
				stdio: "pipe",
			}),
		).toThrow();
		rmSync(tempRoot, { recursive: true, force: true });
	});
});
