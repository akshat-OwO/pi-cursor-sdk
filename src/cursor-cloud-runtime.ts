export interface CursorCloudSelection {
	url: string;
	displayPath: string;
}

const state = {
	selection: undefined as CursorCloudSelection | undefined,
};

export function getCursorCloudSelection(): CursorCloudSelection | undefined {
	return state.selection;
}

export function setCursorCloudSelection(selection: CursorCloudSelection | undefined): void {
	state.selection = selection;
}

export function isCursorCloudRuntime(): boolean {
	return state.selection !== undefined;
}

export function formatRepositoryDisplayPath(url: string): string {
	const trimmed = url.trim();
	if (!trimmed) return trimmed;

	if (trimmed.startsWith("git@")) {
		const match = trimmed.match(/^git@[^:]+:(.+?)(?:\.git)?$/);
		return match?.[1] ?? trimmed;
	}

	try {
		const normalized = trimmed.replace(/\.git(?:#.*)?$/, "");
		const parsed = new URL(normalized);
		const parts = parsed.pathname.split("/").filter(Boolean);
		if (parts.length >= 2) {
			return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
		}
		return parts[parts.length - 1] ?? trimmed;
	} catch {
		return trimmed;
	}
}

export function createCursorCloudSelection(url: string): CursorCloudSelection {
	return {
		url: url.trim(),
		displayPath: formatRepositoryDisplayPath(url),
	};
}

export const __testUtils = {
	reset: (): void => {
		state.selection = undefined;
	},
};
