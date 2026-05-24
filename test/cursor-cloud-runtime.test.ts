import { describe, expect, it, beforeEach } from "vitest";
import {
	__testUtils,
	createCursorCloudSelection,
	formatRepositoryDisplayPath,
	getCursorCloudSelection,
	setCursorCloudSelection,
} from "../src/cursor-cloud-runtime.js";

describe("cursor-cloud-runtime", () => {
	beforeEach(() => {
		__testUtils.reset();
	});

	it("formats GitHub repository URLs as org/repo", () => {
		expect(formatRepositoryDisplayPath("https://github.com/acme/widgets")).toBe("acme/widgets");
		expect(formatRepositoryDisplayPath("https://github.com/acme/widgets.git")).toBe("acme/widgets");
	});

	it("formats SSH repository URLs as org/repo", () => {
		expect(formatRepositoryDisplayPath("git@github.com:acme/widgets.git")).toBe("acme/widgets");
	});

	it("stores and clears cloud selection", () => {
		expect(getCursorCloudSelection()).toBeUndefined();
		const selection = createCursorCloudSelection("https://github.com/acme/widgets");
		setCursorCloudSelection(selection);
		expect(getCursorCloudSelection()).toEqual({
			url: "https://github.com/acme/widgets",
			displayPath: "acme/widgets",
		});
		setCursorCloudSelection(undefined);
		expect(getCursorCloudSelection()).toBeUndefined();
	});
});
