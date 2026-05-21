import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerToolDisplayOverrides } from "./tool-overrides.js";
import { registerThinkingLabeling } from "./thinking-label.js";
import {
  COLLAPSED_TOOL_LAYOUTS,
  DEFAULT_TOOL_DISPLAY_CONFIG,
  type CollapsedToolLayout,
  type ToolDisplayConfig,
} from "./types.js";

const TOOL_LAYOUT_STATE_TYPE = "pi-meron-footer:tool-layout";

const toolDisplayConfig: ToolDisplayConfig = {
  ...DEFAULT_TOOL_DISPLAY_CONFIG,
  registerToolOverrides: {
    read: true,
    grep: true,
    find: true,
    ls: true,
    bash: true,
    edit: true,
    write: true,
  },
  showTruncationHints: false,
  showRtkCompactionHints: false,
};

function isCollapsedToolLayout(value: unknown): value is CollapsedToolLayout {
  return typeof value === "string" && COLLAPSED_TOOL_LAYOUTS.includes(value as CollapsedToolLayout);
}

function normalizeLayoutArg(args: string | undefined): CollapsedToolLayout | undefined {
  const normalized = (args || "").trim().toLowerCase();
  if (["a", "row", "summary", "summary-row"].includes(normalized)) {
    return "summary-row";
  }
  if (["b", "inline", "inline-summary", "single", "single-line"].includes(normalized)) {
    return "inline-summary";
  }
  return isCollapsedToolLayout(normalized) ? normalized : undefined;
}

function layoutLabel(layout: CollapsedToolLayout): string {
  return layout === "inline-summary" ? "Option B: inline summary" : "Option A: summary row";
}

function restorePersistedToolLayout(ctx: { sessionManager?: { getEntries?: () => unknown[] } } | undefined): void {
  const entries = ctx?.sessionManager?.getEntries?.() ?? [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (record.type !== "custom" || record.customType !== TOOL_LAYOUT_STATE_TYPE) continue;
    const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : undefined;
    if (isCollapsedToolLayout(data?.layout)) {
      toolDisplayConfig.collapsedToolLayout = data.layout;
    }
  }
}

export default function toolDisplayExtension(pi: ExtensionAPI): void {
  registerToolDisplayOverrides(pi, () => toolDisplayConfig);
  registerThinkingLabeling(pi);

  pi.on("session_start", async (_event, ctx) => {
    restorePersistedToolLayout(ctx);
  });

  pi.registerCommand("meron-tools", {
    description: "Switch collapsed tool rendering: A summary row or B inline summary",
    handler: async (args, ctx) => {
      let layout = normalizeLayoutArg(args);

      if (!layout && ctx.hasUI) {
        const choice = await ctx.ui.select("Collapsed tool layout", [
          "Option A: summary row",
          "Option B: inline summary",
        ]);
        layout = choice?.includes("Option B") ? "inline-summary" : "summary-row";
      }

      if (!layout) {
        ctx.ui.notify("Usage: /meron-tools a|b", "info");
        return;
      }

      toolDisplayConfig.collapsedToolLayout = layout;
      pi.appendEntry(TOOL_LAYOUT_STATE_TYPE, { layout });
      ctx.ui.notify(`Meron tool layout: ${layoutLabel(layout)}`, "info");
    },
  });
}
