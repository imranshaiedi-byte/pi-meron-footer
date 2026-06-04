import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

let turnStartTime: number | undefined;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function registerTurnTiming(pi: ExtensionAPI): void {
  pi.on("agent_start", async () => {
    turnStartTime = Date.now();
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!turnStartTime) return;
    const duration = formatDuration(Date.now() - turnStartTime);
    turnStartTime = undefined;

    // Use a widget instead of sendMessage to avoid triggering agent loops
    const theme = ctx.ui?.theme as any;
    if (theme) {
      ctx.ui.setWidget("meron-turn-timing", [theme.fg("dim", `──── ${duration} ────`)], { placement: "belowEditor" });
    }
  });
}
