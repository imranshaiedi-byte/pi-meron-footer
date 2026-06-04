import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import { execSync } from "node:child_process";
import { join, relative } from "node:path";

interface ThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

interface DiffStat {
  path: string;
  added: number;
  removed: number;
}

function getDiffStats(cwd: string): DiffStat[] {
  try {
    const output = execSync(
      `git diff --numstat HEAD 2>/dev/null || git diff --numstat 2>/dev/null`,
      { cwd, encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    if (!output) return [];

    return output.split("\n").map((line) => {
      const parts = line.split("\t");
      const added = parseInt(parts[0] ?? "0", 10) || 0;
      const removed = parseInt(parts[1] ?? "0", 10) || 0;
      const path = parts[2] ?? "";
      return { path, added, removed };
    }).filter((s) => s.path);
  } catch {
    return [];
  }
}

function getStagedDiffStats(cwd: string): DiffStat[] {
  try {
    const output = execSync(
      `git diff --cached --numstat 2>/dev/null`,
      { cwd, encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    if (!output) return [];

    return output.split("\n").map((line) => {
      const parts = line.split("\t");
      const added = parseInt(parts[0] ?? "0", 10) || 0;
      const removed = parseInt(parts[1] ?? "0", 10) || 0;
      const path = parts[2] ?? "";
      return { path, added, removed };
    }).filter((s) => s.path);
  } catch {
    return [];
  }
}

export function registerSessionDiffCommand(pi: ExtensionAPI): void {
  pi.registerCommand("diff", {
    description: "Show all changes made in this session (aggregated file diff)",
    handler: async (_args, ctx) => {
      const theme = ctx.ui.theme as unknown as ThemeLike;
      if (!theme) {
        ctx.ui.notify("Theme not available", "error");
        return;
      }

      const cwd = ctx.cwd;

      await ctx.ui.custom((tui, theme2, _kb, done) => {
        const container = new Container();
        const t = theme2 as unknown as ThemeLike;

        container.addChild(new Text(t.fg("text", t.bold(" Session Diff")), 1, 0));
        container.addChild(new Text(t.fg("dim", ` ${relative(process.env.HOME ?? "/", cwd)}`), 1, 0));
        container.addChild(new Text("", 0, 0));

        // Unstaged changes
        const unstaged = getDiffStats(cwd);
        if (unstaged.length > 0) {
          container.addChild(new Text(t.fg("muted", " Unstaged:"), 1, 0));
          let totalAdded = 0;
          let totalRemoved = 0;
          for (const stat of unstaged) {
            totalAdded += stat.added;
            totalRemoved += stat.removed;
            const addedStr = stat.added > 0 ? t.fg("success", `+${stat.added}`) : "";
            const removedStr = stat.removed > 0 ? t.fg("error", `-${stat.removed}`) : "";
            const sep = addedStr && removedStr ? " " : "";
            container.addChild(new Text(
              `   ${t.fg("text", stat.path)} ${addedStr}${sep}${removedStr}`,
              0, 0
            ));
          }
          container.addChild(new Text(
            `   ${t.fg("muted", `${unstaged.length} files: `)}${t.fg("success", `+${totalAdded}`)} ${t.fg("error", `-${totalRemoved}`)}`,
            0, 0
          ));
        } else {
          container.addChild(new Text(t.fg("muted", " No unstaged changes"), 1, 0));
        }

        container.addChild(new Text("", 0, 0));

        // Staged changes
        const staged = getStagedDiffStats(cwd);
        if (staged.length > 0) {
          container.addChild(new Text(t.fg("muted", " Staged:"), 1, 0));
          let totalAdded = 0;
          let totalRemoved = 0;
          for (const stat of staged) {
            totalAdded += stat.added;
            totalRemoved += stat.removed;
            const addedStr = stat.added > 0 ? t.fg("success", `+${stat.added}`) : "";
            const removedStr = stat.removed > 0 ? t.fg("error", `-${stat.removed}`) : "";
            const sep = addedStr && removedStr ? " " : "";
            container.addChild(new Text(
              `   ${t.fg("text", stat.path)} ${addedStr}${sep}${removedStr}`,
              0, 0
            ));
          }
          container.addChild(new Text(
            `   ${t.fg("muted", `${staged.length} files: `)}${t.fg("success", `+${totalAdded}`)} ${t.fg("error", `-${totalRemoved}`)}`,
            0, 0
          ));
        }

        container.addChild(new Text("", 0, 0));
        container.addChild(new Text(t.fg("dim", " Press Escape to close"), 1, 0));

        return {
          render: (w: number) => container.render(w),
          invalidate: () => container.invalidate(),
          handleInput: (data: string) => {
            if (data === "\x1b" || data === "\r") {
              done(undefined);
            }
            tui.requestRender();
          },
        };
      });
    },
  });
}
