import { UserMessageComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const RESET = "\x1b[0m";
const TRANSPARENT_BG = "\x1b[49m";
const WHITE = "\x1b[38;2;255;255;255m";
const CHROME_RESET = `${RESET}${TRANSPARENT_BG}`;
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const PATCH_OWNER = "pi-meron-suite:user-message-box";
const CONTENT_PAD = 1;
const MIN_BOX_WIDTH = 18;

interface PatchableUserMessagePrototype {
  render(width: number): string[];
  __piMeronUserMessageOriginalRender?: (width: number) => string[];
  __piMeronUserMessagePatched?: boolean;
  __piMeronUserMessageOwner?: string;
}

function chrome(text: string): string {
  return `${WHITE}${text}${CHROME_RESET}`;
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

function isBlankLine(text: string): boolean {
  return stripAnsi(text).trim().length === 0;
}

function padToWidth(line: string, width: number): string {
  const clamped = visibleWidth(line) > width ? truncateToWidth(line, width, "") : line;
  return `${clamped}${" ".repeat(Math.max(0, width - visibleWidth(clamped)))}`;
}

function buildTopBorder(width: number): string {
  const title = " You ";
  const fixedWidth = 2 + visibleWidth(title) + 1; // ╭─, title, ╮
  const fill = "─".repeat(Math.max(0, width - fixedWidth));
  return chrome(`╭─${title}${fill}╮`);
}

function buildBottomBorder(width: number): string {
  const fillWidth = Math.max(0, width - 4);
  const fill = "─".repeat(fillWidth);
  return chrome(`╰─${fill}─╯`);
}

function buildSingleLineBox(line: string, width: number): string {
  const prefix = "╭─ You: ";
  const suffix = " ─╮";
  const contentWidth = Math.max(1, width - visibleWidth(prefix) - visibleWidth(suffix));
  const content = truncateToWidth(line, contentWidth, "…");
  const fill = "─".repeat(Math.max(0, contentWidth - visibleWidth(content)));
  return chrome(`${prefix}${content}${fill}${suffix}`);
}

function wrapLine(line: string, contentWidth: number): string {
  const pad = " ".repeat(CONTENT_PAD);
  return `${chrome("│")}${pad}${padToWidth(line, contentWidth)}${pad}${chrome("│")}`;
}

function normalizeContentLine(line: string): string {
  // Pi's native user renderer pads message rows to the provided width before
  // this wrapper sees them. Strip ANSI and right-padding so our box can size
  // itself to the actual prompt content instead of the full terminal width.
  return stripAnsi(line).trimEnd();
}

function trimBlankEdges(lines: string[]): string[] {
  const normalized = lines.map(normalizeContentLine);
  let start = 0;
  while (start < normalized.length && isBlankLine(normalized[start] ?? "")) start++;
  let end = normalized.length - 1;
  while (end >= start && isBlankLine(normalized[end] ?? "")) end--;
  return start <= end ? normalized.slice(start, end + 1) : [];
}

function patchUserMessagePrototype(): void {
  const proto = UserMessageComponent.prototype as unknown as PatchableUserMessagePrototype;
  if (typeof proto.render !== "function") return;

  if (proto.__piMeronUserMessagePatched && proto.__piMeronUserMessageOwner === PATCH_OWNER) {
    return;
  }

  if (!proto.__piMeronUserMessageOriginalRender) {
    proto.__piMeronUserMessageOriginalRender = proto.render;
  }

  const originalRender = proto.__piMeronUserMessageOriginalRender;
  proto.render = function renderWithMeronUserBox(this: unknown, width: number): string[] {
    const safeWidth = Math.max(0, Math.floor(width));
    if (safeWidth < 8) {
      return originalRender.call(this, safeWidth);
    }

    const maxContentWidth = Math.max(1, safeWidth - 2 - CONTENT_PAD * 2);
    const rendered = originalRender.call(this, maxContentWidth);
    const content = trimBlankEdges(Array.isArray(rendered) ? rendered : []);
    const body = content.length > 0 ? content : [""];
    const widestContentLine = body.reduce((max, line) => Math.max(max, visibleWidth(line)), 0);
    const boxWidth = Math.min(
      safeWidth,
      Math.max(MIN_BOX_WIDTH, widestContentLine + 2 + CONTENT_PAD * 2),
    );
    const contentWidth = Math.max(1, boxWidth - 2 - CONTENT_PAD * 2);

    if (body.length === 1 && !body[0]?.includes("\n")) {
      return [buildSingleLineBox(body[0] ?? "", boxWidth)];
    }

    return [
      buildTopBorder(boxWidth),
      ...body.map((line) => wrapLine(line, contentWidth)),
      buildBottomBorder(boxWidth),
    ];
  };

  proto.__piMeronUserMessagePatched = true;
  proto.__piMeronUserMessageOwner = PATCH_OWNER;
}

function restoreUserMessagePrototype(): void {
  const proto = UserMessageComponent.prototype as unknown as PatchableUserMessagePrototype;
  const original = proto.__piMeronUserMessageOriginalRender;
  if (typeof original === "function") {
    proto.render = original;
  }
  delete proto.__piMeronUserMessageOriginalRender;
  delete proto.__piMeronUserMessagePatched;
  delete proto.__piMeronUserMessageOwner;
}

export function registerUserMessageBox(pi: ExtensionAPI): void {
  patchUserMessagePrototype();

  pi.on("session_start", async () => {
    patchUserMessagePrototype();
  });

  pi.on("before_agent_start", async () => {
    patchUserMessagePrototype();
  });

  pi.on("session_shutdown", async (event: { reason?: string }) => {
    if (event?.reason === "reload") {
      restoreUserMessagePrototype();
    }
  });
}
