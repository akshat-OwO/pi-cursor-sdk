import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
	return {
		...actual,
		getAgentDir: vi.fn(),
	};
});

import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
	__cursorAgentSettingsTestUtils,
	getCursorCompactToolDisplaySetting,
	setCursorCompactToolDisplaySetting,
} from "../src/cursor-agent-settings.js";
import { isCursorCompactToolDisplayRequested } from "../src/cursor-native-tool-display-state.js";

const mockedGetAgentDir = vi.mocked(getAgentDir);

describe("cursor-agent-settings", () => {
	let tempDir: string | undefined;

	beforeEach(() => {
		mockedGetAgentDir.mockReset();
	});

	afterEach(() => {
		delete process.env.PI_CURSOR_COMPACT_TOOL_DISPLAY;
		__cursorAgentSettingsTestUtils.reset();
		if (tempDir) {
			rmSync(tempDir, { recursive: true, force: true });
			tempDir = undefined;
		}
	});

	it("reads cursorCompactToolDisplay from agent settings when process env is unset", () => {
		tempDir = mkdtempSync(join(tmpdir(), "pi-cursor-settings-"));
		mockedGetAgentDir.mockReturnValue(tempDir);
		writeFileSync(
			join(tempDir, "settings.json"),
			JSON.stringify({ cursorCompactToolDisplay: true }),
		);

		expect(getCursorCompactToolDisplaySetting(tempDir, tempDir)).toBe(true);
		expect(isCursorCompactToolDisplayRequested()).toBe(true);
	});

	it("prefers process env over cursorCompactToolDisplay setting", () => {
		tempDir = mkdtempSync(join(tmpdir(), "pi-cursor-settings-"));
		mockedGetAgentDir.mockReturnValue(tempDir);
		writeFileSync(
			join(tempDir, "settings.json"),
			JSON.stringify({ cursorCompactToolDisplay: true }),
		);
		process.env.PI_CURSOR_COMPACT_TOOL_DISPLAY = "0";

		expect(getCursorCompactToolDisplaySetting(tempDir, tempDir)).toBe(true);
		expect(isCursorCompactToolDisplayRequested()).toBe(false);
	});

	it("writes cursorCompactToolDisplay to agent settings.json", () => {
		tempDir = mkdtempSync(join(tmpdir(), "pi-cursor-settings-"));
		mockedGetAgentDir.mockReturnValue(tempDir);
		writeFileSync(
			join(tempDir, "settings.json"),
			JSON.stringify({ defaultProvider: "cursor" }),
		);

		setCursorCompactToolDisplaySetting(true, tempDir, tempDir);

		const saved = JSON.parse(readFileSync(join(tempDir, "settings.json"), "utf-8")) as {
			defaultProvider?: string;
			cursorCompactToolDisplay?: boolean;
		};
		expect(saved.defaultProvider).toBe("cursor");
		expect(saved.cursorCompactToolDisplay).toBe(true);
		expect(getCursorCompactToolDisplaySetting(tempDir, tempDir)).toBe(true);
	});
});
