import { Container, SettingsList, Text } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import {
	getCursorCompactToolDisplaySetting,
	setCursorCompactToolDisplaySetting,
} from "./cursor-agent-settings.js";
import { syncCompactNativeToolDisplayShells } from "./cursor-native-tool-display-state.js";

type CursorSettingsExtensionApi = Pick<ExtensionAPI, "registerCommand">;

class CursorSettingsPanel extends Container {
	settingsList: SettingsList;

	constructor(
		enabled: boolean,
		onChange: (enabled: boolean) => void,
		onCancel: () => void,
	) {
		super();
		this.addChild(new Text("Cursor settings", 0, 0));
		const items = [
			{
				id: "cursor-compact-tool-display",
				label: "Compact tool display",
				description: "OpenCode-style one-line rows for Cursor SDK replay tools (Cursor sessions only)",
				currentValue: enabled ? "true" : "false",
				values: ["true", "false"],
			},
		];
		this.settingsList = new SettingsList(
			items,
			items.length,
			getSettingsListTheme(),
			(id, newValue) => {
				if (id !== "cursor-compact-tool-display") return;
				onChange(newValue === "true");
			},
			onCancel,
		);
		this.addChild(this.settingsList);
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}

export function registerCursorSettingsCommand(pi: CursorSettingsExtensionApi): void {
	pi.registerCommand("cursor-settings", {
		description: "Configure pi-cursor-sdk display options",
		handler: async (_args, ctx: ExtensionContext) => {
			if (!ctx.hasUI) {
				const enabled = getCursorCompactToolDisplaySetting(ctx.cwd);
				ctx.ui.notify(`Compact tool display: ${enabled ? "on" : "off"}`, "info");
				return;
			}

			await ctx.ui.custom<void>((_tui, _theme, _keybindings, done) => {
				let enabled = getCursorCompactToolDisplaySetting(ctx.cwd);
				return new CursorSettingsPanel(
					enabled,
					(nextEnabled) => {
						enabled = nextEnabled;
						setCursorCompactToolDisplaySetting(nextEnabled, ctx.cwd);
						syncCompactNativeToolDisplayShells();
						ctx.ui.notify(`Compact tool display ${nextEnabled ? "enabled" : "disabled"}`, "info");
					},
					() => done(),
				);
			});
		},
	});
}
