/**
 * Meron UI Extension
 *
 * Adds a clean padded footer/status bar and transparent bordered tool rows.
 * Theme resources are provided via the package manifest.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const LEFT_PAD = 3;
const RIGHT_PAD = 3;
const ASCII_ELLIPSIS = "...";
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const TRANSPARENT_RESET = "\x1b[0m\x1b[49m";
const TOOL_BORDER_PATCH_FLAG = Symbol.for("meron-ui:tool-border-patch");
const TOOL_RENDER_CACHE = Symbol.for("meron-ui:tool-render-cache");

let currentTheme: Theme | null = null;

type Theme = {
	fg: (name: string, value: string) => string;
};

type FooterData = {
	getGitBranch: () => string | null;
	onBranchChange: (listener: () => void) => () => void;
};

type ToolBackgroundMode = "default" | "transparent" | "border" | "outlines";

// ═══════════════════════════════════════════════════════════════════════════════
// Tool rendering
// ═══════════════════════════════════════════════════════════════════════════════

function settingsPath(): string | null {
	const home = process.env.HOME || process.env.USERPROFILE;
	return home ? join(home, ".pi", "agent", "settings.json") : null;
}

function readToolBackgroundMode(): ToolBackgroundMode {
	const path = settingsPath();
	if (!path || !existsSync(path)) return "border";

	try {
		const settings = JSON.parse(readFileSync(path, "utf8")) as { toolBackground?: ToolBackgroundMode };
		return settings.toolBackground ?? "border";
	} catch {
		return "border";
	}
}

function setThemeBg(theme: unknown, key: string, value: string): void {
	const themeAny = theme as any;
	if (themeAny.bgColors instanceof Map) {
		themeAny.bgColors.set(key, value);
	} else if (themeAny.bgColors && typeof themeAny.bgColors === "object") {
		themeAny.bgColors[key] = value;
	}
}

function applyToolBackgroundMode(theme: unknown): void {
	const mode = readToolBackgroundMode();
	if (mode === "default") return;
	setThemeBg(theme, "toolPendingBg", "\x1b[49m");
	setThemeBg(theme, "toolSuccessBg", "\x1b[49m");
	setThemeBg(theme, "toolErrorBg", "\x1b[49m");
}

function stripAnsi(text: string): string {
	return text.replace(ANSI_RE, "");
}

function isBlankLine(line: string): boolean {
	return stripAnsi(line).trim().length === 0;
}

function isToolExecutionLike(value: unknown): value is { toolName: string; toolCallId: string } {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return typeof candidate.toolName === "string" && typeof candidate.toolCallId === "string";
}

function borderLine(width: number): string {
	const line = "─".repeat(Math.max(1, width));
	return currentTheme ? `${currentTheme.fg("borderMuted", line)}${TRANSPARENT_RESET}` : line;
}

function clampLine(line: string, width: number): string {
	if (width <= 0) return "";
	return visibleWidth(line) > width ? truncateToWidth(line, width, "") : line;
}

function patchToolBorders(): void {
	const proto = Container.prototype as any;
	if (proto[TOOL_BORDER_PATCH_FLAG]) return;

	const originalRender = proto.render;
	proto.render = function meronToolBorderRender(width: number): string[] {
		if (isToolExecutionLike(this)) {
			const mode = readToolBackgroundMode();
			const cached = this[TOOL_RENDER_CACHE];
			if (cached?.width === width && cached?.mode === mode) return cached.lines;

			const rendered = originalRender.call(this, width) as string[];
			if (!Array.isArray(rendered) || rendered.length === 0 || mode === "default") {
				this[TOOL_RENDER_CACHE] = { width, mode, lines: rendered };
				return rendered;
			}

			let start = 0;
			while (start < rendered.length && isBlankLine(rendered[start])) start++;

			let end = rendered.length - 1;
			while (end >= start && isBlankLine(rendered[end])) end--;

			if (start > end) return rendered;

			const core = rendered.slice(start, end + 1).map((line) => clampLine(line, width));
			const spacer = " ".repeat(Math.max(0, width));
			const lines = mode === "transparent"
				? [spacer, ...core]
				: [spacer, borderLine(width), ...core, borderLine(width)];

			this[TOOL_RENDER_CACHE] = { width, mode, lines };
			return lines;
		}

		return originalRender.call(this, width);
	};

	proto[TOOL_BORDER_PATCH_FLAG] = true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Footer rendering
// ═══════════════════════════════════════════════════════════════════════════════

function formatTokens(count: number): string {
	if (!Number.isFinite(count) || count <= 0) return "?";
	if (count < 1_000) return String(count);
	if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

function padLine(line: string, width: number, innerWidth: number): string {
	if (width <= 0) return "";

	const lineWidth = visibleWidth(line);
	if (lineWidth <= innerWidth) {
		return `${" ".repeat(LEFT_PAD)}${line}${" ".repeat(Math.max(0, width - LEFT_PAD - lineWidth))}`;
	}

	return truncateToWidth(line, width, ASCII_ELLIPSIS);
}

function twoColumnLine(left: string, right: string, width: number, innerWidth: number): string {
	const leftWidth = visibleWidth(left);
	const rightWidth = visibleWidth(right);

	if (leftWidth + rightWidth + 2 <= innerWidth) {
		return padLine(`${left}${" ".repeat(innerWidth - leftWidth - rightWidth)}${right}`, width, innerWidth);
	}

	const rightWidthAvailable = Math.max(0, innerWidth - leftWidth - 2);
	if (rightWidthAvailable > 0) {
		const truncatedRight = truncateToWidth(right, rightWidthAvailable, "");
		const gap = " ".repeat(Math.max(0, innerWidth - leftWidth - visibleWidth(truncatedRight)));
		return padLine(`${left}${gap}${truncatedRight}`, width, innerWidth);
	}

	return padLine(truncateToWidth(left, innerWidth, ASCII_ELLIPSIS), width, innerWidth);
}

function compactCwd(cwd: string): string {
	const home = process.env.HOME || process.env.USERPROFILE;
	return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

function renderContextUsage(ctx: any, theme: Theme): string {
	const usage = ctx.getContextUsage?.();
	const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
	const percent = typeof usage?.percent === "number" ? usage.percent : null;
	const display = percent === null
		? `?/${formatTokens(contextWindow)}`
		: `${percent.toFixed(1)}%/${formatTokens(contextWindow)}`;

	if (percent !== null && percent > 90) return theme.fg("error", display);
	if (percent !== null && percent > 70) return theme.fg("warning", display);
	return display;
}

function modelLabel(ctx: any): string {
	return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no-model";
}

function setPaddedFooter(pi: ExtensionAPI, ctx: any): void {
	ctx.ui.setFooter((tui: any, theme: Theme, footerData: FooterData) => ({
		dispose: footerData.onBranchChange(() => tui.requestRender()),
		invalidate() {},
		render(width: number): string[] {
			const innerWidth = Math.max(0, width - LEFT_PAD - RIGHT_PAD);

			let leftSide = compactCwd(ctx.sessionManager.getCwd());
			const sessionName = ctx.sessionManager.getSessionName();
			if (sessionName) leftSide += ` • ${sessionName}`;

			const branch = footerData.getGitBranch();
			if (branch) leftSide += ` • ${branch}`;

			const rightSide = [modelLabel(ctx), pi.getThinkingLevel(), renderContextUsage(ctx, theme)].join(" • ");

			return [
				twoColumnLine(theme.fg("text", leftSide), theme.fg("text", rightSide), width, innerWidth),
				"",
			];
		},
	}));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Extension entry point
// ═══════════════════════════════════════════════════════════════════════════════

export default function meronUi(pi: ExtensionAPI) {
	patchToolBorders();

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		currentTheme = ctx.ui.theme;
		applyToolBackgroundMode(ctx.ui.theme);
		setPaddedFooter(pi, ctx);
	});
}
