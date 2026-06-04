import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

interface ThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

export function registerTurnSeparatorRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer("meron-turn-separator", (message, _options, theme) => {
    const t = theme as unknown as ThemeLike;
    const content = typeof message.content === "string" ? message.content : "";
    // Render as a single themed line
    return new Text(t.fg("dim", content), 0, 0);
  });
}
