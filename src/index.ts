import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { discoverModels } from "./model-discovery.js";
import { streamCursor } from "./cursor-provider.js";

export default async function (pi: ExtensionAPI) {
	const models = await discoverModels();

	pi.registerProvider("cursor", {
		name: "Cursor",
		baseUrl: "https://cursor.com",
		apiKey: "CURSOR_API_KEY",
		api: "cursor-sdk",
		models,
		streamSimple: streamCursor,
	});
}
