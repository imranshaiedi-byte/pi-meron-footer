import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

interface TurnInfo {
  index: number;
  timestamp: number;
  modelId: string;
  providerId: string;
  thinkingLevel: string;
  durationMs: number;
  tokensIn?: number;
  tokensOut?: number;
  filesChanged: string[];
  errors: string[];
  toolsUsed: string[];
}

interface SessionState {
  turns: TurnInfo[];
  currentTurnStart?: number;
  currentTurnModel?: string;
  currentTurnProvider?: string;
  currentTurnThinking?: string;
  filesChanged: Set<string>;
  errors: string[];
  toolsUsed: string[];
  totalTokensIn: number;
  totalTokensOut: number;
}

// Module-level state — persists across all event handlers in this extension instance
let state: SessionState = createFreshState();

function createFreshState(): SessionState {
  return { turns: [], filesChanged: new Set(), errors: [], toolsUsed: [], totalTokensIn: 0, totalTokensOut: 0 };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function extractPathFromArgs(toolName: string, args: unknown): string | undefined {
  if (!isRecord(args)) return undefined;
  const p = args.file_path ?? args.path;
  return typeof p === "string" ? p : undefined;
}

function extractUsage(message: unknown): { tokensIn?: number; tokensOut?: number } {
  if (!isRecord(message)) return {};
  const usage = message.usage;
  if (!isRecord(usage)) return {};
  const tokensIn = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
  const tokensOut = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  return { tokensIn, tokensOut };
}

export function registerSessionTracker(pi: ExtensionAPI): void {
  pi.on("session_start", async () => {
    state = createFreshState();
  });

  pi.on("turn_start", async (event, ctx) => {
    state.currentTurnStart = event.timestamp ?? Date.now();
    state.currentTurnModel = ctx.model?.id;
    state.currentTurnProvider = ctx.model?.provider;
    state.currentTurnThinking = pi.getThinkingLevel();
    state.toolsUsed = [];
    state.errors = [];
  });

  pi.on("turn_end", async (event, ctx) => {
    if (state.currentTurnStart == null) return;

    const usage = extractUsage(event.message);
    if (usage.tokensIn) state.totalTokensIn += usage.tokensIn;
    if (usage.tokensOut) state.totalTokensOut += usage.tokensOut;

    const turn: TurnInfo = {
      index: state.turns.length,
      timestamp: state.currentTurnStart,
      modelId: state.currentTurnModel ?? ctx.model?.id ?? "unknown",
      providerId: state.currentTurnProvider ?? ctx.model?.provider ?? "unknown",
      thinkingLevel: state.currentTurnThinking ?? "off",
      durationMs: Date.now() - state.currentTurnStart,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      filesChanged: [...state.filesChanged],
      errors: [...state.errors],
      toolsUsed: [...state.toolsUsed],
    };
    state.turns.push(turn);
    state.currentTurnStart = undefined;
  });

  pi.on("tool_call", async (event) => {
    state.toolsUsed.push(event.toolName);

    const filePath = extractPathFromArgs(event.toolName, event.input);
    if (filePath && (event.toolName === "edit" || event.toolName === "write")) {
      state.filesChanged.add(filePath);
    }
  });

  pi.on("tool_execution_end", async (event) => {
    if (event.isError) {
      state.errors.push(event.toolName);
    }
  });

  pi.on("message_end", async (event) => {
    if (!isRecord(event.message) || event.message.role !== "assistant") return;
    const usage = extractUsage(event.message);
    if (usage.tokensIn) state.totalTokensIn += usage.tokensIn;
    if (usage.tokensOut) state.totalTokensOut += usage.tokensOut;
  });
}

export function getState(): SessionState {
  return state;
}

export function getSessionFilesChanged(): string[] {
  return [...state.filesChanged];
}

export function getSessionErrors(): string[] {
  return [...state.errors];
}

export function getTotalTokens(): { in: number; out: number } {
  return { in: state.totalTokensIn, out: state.totalTokensOut };
}

export function getTurnCount(): number {
  return state.turns.length;
}

export function getActiveToolCount(): number {
  return state.toolsUsed.length;
}

export function getLastTurn(): TurnInfo | undefined {
  return state.turns.length > 0 ? state.turns[state.turns.length - 1] : undefined;
}
