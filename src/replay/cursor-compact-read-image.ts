import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { getCapabilities, getImageDimensions, imageFallback } from "@earendil-works/pi-tui";
import {
	inferImageMimeTypeFromPath,
	readImageFileForReplay,
} from "./cursor-native-tool-display-replay.js";

type CompactToolResult = Parameters<NonNullable<ToolDefinition["renderResult"]>>[0];

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

function isImagePath(path: string): boolean {
	const lower = path.toLowerCase();
	for (const ext of IMAGE_EXTENSIONS) {
		if (lower.endsWith(ext)) return true;
	}
	return false;
}

function getArgPath(args: Record<string, unknown> | undefined): string | undefined {
	if (!args) return undefined;
	const rawPath =
		typeof args.path === "string"
			? args.path
			: typeof args.file_path === "string"
				? args.file_path
				: undefined;
	return rawPath?.trim() ? rawPath : undefined;
}

function getCompactImageContentEntry(
	result: CompactToolResult,
): { data: string; mimeType: string } | undefined {
	for (const entry of result.content) {
		if (
			entry.type === "image" &&
			typeof entry.data === "string" &&
			typeof entry.mimeType === "string"
		) {
			return { data: entry.data, mimeType: entry.mimeType };
		}
	}
	return undefined;
}

export function resolveCompactReadImage(
	result: CompactToolResult,
	args: Record<string, unknown> | undefined,
): { data: string; mimeType: string; path?: string } | undefined {
	const fromContent = getCompactImageContentEntry(result);
	if (fromContent) return fromContent;

	const rawPath = getArgPath(args);
	if (!rawPath || !isImagePath(rawPath)) return undefined;
	const mimeType = inferImageMimeTypeFromPath(rawPath);
	if (!mimeType) return undefined;
	const data = readImageFileForReplay(rawPath);
	if (!data) return undefined;
	return { data, mimeType, path: rawPath };
}

export function getCompactImageUnavailableText(image: { data: string; mimeType: string }): string {
	const caps = getCapabilities();
	if (caps.images) return "";
	const dims = getImageDimensions(image.data, image.mimeType) ?? undefined;
	return imageFallback(image.mimeType, dims);
}

export function isGenericReadImageCaption(text: string): boolean {
	return /^Read image file \[/i.test(text.trim());
}
