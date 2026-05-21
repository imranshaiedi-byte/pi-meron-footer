export const DIFF_VIEW_MODES = ["auto", "split", "unified"] as const;
export const DIFF_INDICATOR_MODES = ["bars", "classic", "none"] as const;

export type DiffViewMode = (typeof DIFF_VIEW_MODES)[number];
export type DiffIndicatorMode = (typeof DIFF_INDICATOR_MODES)[number];

export const BUILT_IN_TOOL_OVERRIDE_NAMES = [
	"read",
	"grep",
	"find",
	"ls",
	"bash",
	"edit",
	"write",
] as const;

export type BuiltInToolOverrideName = (typeof BUILT_IN_TOOL_OVERRIDE_NAMES)[number];

export interface ToolOverrideOwnership {
	read: boolean;
	grep: boolean;
	find: boolean;
	ls: boolean;
	bash: boolean;
	edit: boolean;
	write: boolean;
}

export interface ToolDisplayConfig {
	registerToolOverrides: ToolOverrideOwnership;
	diffViewMode: DiffViewMode;
	diffIndicatorMode: DiffIndicatorMode;
	diffSplitMinWidth: number;
	diffCollapsedLines: number;
	diffWordWrap: boolean;
	showTruncationHints: boolean;
	showRtkCompactionHints: boolean;
}

export const DEFAULT_TOOL_DISPLAY_CONFIG: ToolDisplayConfig = {
	registerToolOverrides: {
		read: true,
		grep: true,
		find: true,
		ls: true,
		bash: true,
		edit: true,
		write: true,
	},
	diffViewMode: "auto",
	diffIndicatorMode: "bars",
	diffSplitMinWidth: 120,
	diffCollapsedLines: 24,
	diffWordWrap: true,
	showTruncationHints: false,
	showRtkCompactionHints: false,
};
