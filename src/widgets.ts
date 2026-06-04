import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSessionState, getTurnCount, getSessionErrors, getTotalTokens, getActiveToolCount } from "./session-tracker.js";
import { shortenPath } from "./render-utils.js";

interface ThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function formatTokenCount(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// Feature 3: Context widget above editor (git, cwd, changed files)
export function updateContextWidget(ctx: ExtensionContext): void {
  const theme = ctx.ui.theme as unknown as ThemeLike;
  if (!theme) return;

  const parts: string[] = [];

  // Current directory
  const cwd = ctx.cwd;
  if (cwd) {
    parts.push(theme.fg("text", shortenPath(cwd)));
  }

  // Files changed in this session
  const state = getSessionState(ctx);
  const files = [...state.filesChanged];
  if (files.length > 0) {
    const fileNames = files.slice(0, 3).map((f) => {
      const parts2 = f.replace(/\\/g, "/").split("/");
      return parts2[parts2.length - 1] ?? f;
    });
    const suffix = files.length > 3 ? ` +${files.length - 3}` : "";
    parts.push(theme.fg("muted", `changed: ${fileNames.join(", ")}${suffix}`));
  }

  // Active errors
  const errors = getSessionErrors(ctx);
  if (errors.length > 0) {
    parts.push(theme.fg("error", `⚠ ${errors.length} ${errors.length === 1 ? "error" : "errors"}`));
  }

  if (parts.length > 0) {
    ctx.ui.setWidget("meron-context", parts.map((p) => ` ${p}`));
  } else {
    ctx.ui.setWidget("meron-context", [""]);
  }
}

// Feature 4: Session stats widget below editor (tokens, model, thinking)
export function updateStatsWidget(ctx: ExtensionContext): void {
  const theme = ctx.ui.theme as unknown as ThemeLike;
  if (!theme) return;

  const parts: string[] = [];

  // Model
  const model = ctx.model;
  if (model) {
    const shortModel = model.id.split("/").pop() ?? model.id;
    parts.push(theme.fg("text", `${model.provider}/${shortModel}`));
  }

  // Thinking level
  // (not directly accessible from ExtensionContext without pi instance, skip for widget)

  // Token usage
  const tokens = getTotalTokens(ctx);
  if (tokens.in > 0 || tokens.out > 0) {
    parts.push(theme.fg("muted", `${formatTokenCount(tokens.in + tokens.out)} tokens`));
  }

  // Turn count
  const turns = getTurnCount(ctx);
  if (turns > 0) {
    parts.push(theme.fg("muted", `${turns} ${turns === 1 ? "turn" : "turns"}`));
  }

  if (parts.length > 0) {
    ctx.ui.setWidget("meron-stats", [` ${parts.join(theme.fg("dim", " · "))}`], { placement: "belowEditor" });
  } else {
    ctx.ui.setWidget("meron-stats", undefined);
  }
}

// Feature 6: File change tracker widget
export function updateFileChangeWidget(ctx: ExtensionContext): void {
  // Merged into context widget — files shown there
}

// Feature 7: Error banner widget
export function updateErrorBanner(ctx: ExtensionContext): void {
  const theme = ctx.ui.theme as unknown as ThemeLike;
  if (!theme) return;

  const errors = getSessionErrors(ctx);
  if (errors.length > 0) {
    const msg = errors.map((e) => `⚠ ${e}`).join("  ");
    ctx.ui.setWidget("meron-errors", [theme.fg("error", ` ${msg}`)], { placement: "belowEditor" });
  } else {
    ctx.ui.setWidget("meron-errors", undefined);
  }
}

// Feature 10: Last action line
export function updateLastActionLine(ctx: ExtensionContext): void {
  const theme = ctx.ui.theme as unknown as ThemeLike;
  if (!theme) return;

  const state = getSessionState(ctx);
  const lastTurn = state.turns.length > 0 ? state.turns[state.turns.length - 1] : undefined;
  if (!lastTurn) return;

  const tools = lastTurn.toolsUsed;
  if (tools.length === 0) return;

  const toolSummary = tools.length <= 3
    ? tools.join(" → ")
    : `${tools[0]} → … → ${tools[tools.length - 1]}`;

  const files = lastTurn.filesChanged;
  let fileHint = "";
  if (files.length > 0) {
    const shortFiles = files.slice(0, 2).map((f) => {
      const p = f.replace(/\\/g, "/").split("/");
      return p[p.length - 1] ?? f;
    });
    fileHint = ` ${theme.fg("muted", shortFiles.join(", "))}`;
  }

  const duration = formatDuration(lastTurn.durationMs);
  ctx.ui.setStatus("meron-last", theme.fg("muted", `last: ${toolSummary}${fileHint} · ${duration}`));
}

// Feature 9: Progress dots for tool chains
export function updateProgressIndicator(ctx: ExtensionContext): void {
  const theme = ctx.ui.theme as unknown as ThemeLike;
  if (!theme) return;

  const toolCount = getActiveToolCount(ctx);
  if (toolCount > 0) {
    const total = Math.min(toolCount, 8);
    const dots = Array.from({ length: total }, (_, i) =>
      i < toolCount
        ? theme.fg("text", "●")
        : theme.fg("dim", "○")
    ).join(" ");
    ctx.ui.setStatus("meron-progress", `${dots}  ${theme.fg("muted", `${toolCount} ${toolCount === 1 ? "tool" : "tools"}`)}`);
  } else {
    ctx.ui.setStatus("meron-progress", undefined);
  }
}

// Feature 5: Turn separator — injected as a custom message
export function injectTurnSeparator(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const theme = ctx.ui.theme as unknown as ThemeLike;
  if (!theme) return;

  const state = getSessionState(ctx);
  const lastTurn = state.turns.length > 0 ? state.turns[state.turns.length - 1] : undefined;
  const turnIndex = state.turns.length;

  const shortModel = lastTurn
    ? (lastTurn.modelId.split("/").pop() ?? lastTurn.modelId)
    : "unknown";

  const duration = lastTurn ? formatDuration(lastTurn.durationMs) : "";
  const tokens = lastTurn && (lastTurn.tokensIn || lastTurn.tokensOut)
    ? ` · ${formatTokenCount((lastTurn.tokensIn ?? 0) + (lastTurn.tokensOut ?? 0))} tokens`
    : "";

  const label = `─── turn ${turnIndex} ─── ${shortModel}${duration ? ` · ${duration}` : ""}${tokens} ───`;

  pi.sendMessage({
    customType: "meron-turn-separator",
    content: label,
    display: true,
    details: { turnIndex, modelId: lastTurn?.modelId, duration: lastTurn?.durationMs },
  }, { triggerTurn: false });
}

// Register all widget updates
export function registerWidgets(pi: ExtensionAPI): void {
  pi.on("turn_end", async (_event, ctx) => {
    updateContextWidget(ctx);
    updateStatsWidget(ctx);
    updateLastActionLine(ctx);
    updateErrorBanner(ctx);
  });

  pi.on("tool_call", async (_event, ctx) => {
    updateProgressIndicator(ctx);
  });

  pi.on("tool_execution_end", async (_event, ctx) => {
    updateProgressIndicator(ctx);
    updateContextWidget(ctx);
    updateErrorBanner(ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    // Clear progress
    ctx.ui.setStatus("meron-progress", undefined);
  });

  pi.on("session_start", async (_event, ctx) => {
    updateContextWidget(ctx);
    updateStatsWidget(ctx);
    ctx.ui.setStatus("meron-last", undefined);
    ctx.ui.setStatus("meron-progress", undefined);
  });
}
