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

const SESSION_STATE_KEY = "__piMeronSessionState";

interface StateCarrier {
  [SESSION_STATE_KEY]?: SessionState;
}

function getOrCreateState(carrier: unknown): SessionState {
  const c = carrier as Record<string, unknown>;
  if (!c) {
    const fresh: SessionState = { turns: [], filesChanged: new Set(), errors: [], toolsUsed: [], totalTokensIn: 0, totalTokensOut: 0 };
    return fresh;
  }
  if (!c[SESSION_STATE_KEY]) {
    c[SESSION_STATE_KEY] = { turns: [], filesChanged: new Set(), errors: [], toolsUsed: [], totalTokensIn: 0, totalTokensOut: 0 } satisfies SessionState;
  }
  return c[SESSION_STATE_KEY] as SessionState;
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
  pi.on("session_start", async (_event, ctx) => {
    const state = getOrCreateState(ctx.state);
    state.turns = [];
    state.filesChanged = new Set();
    state.errors = [];
    state.toolsUsed = [];
    state.totalTokensIn = 0;
    state.totalTokensOut = 0;
    state.currentTurnStart = undefined;
  });

  pi.on("turn_start", async (event, ctx) => {
    const state = getOrCreateState(ctx.state);
    state.currentTurnStart = event.timestamp ?? Date.now();
    state.currentTurnModel = ctx.model?.id;
    state.currentTurnProvider = ctx.model?.provider;
    state.currentTurnThinking = pi.getThinkingLevel();
    state.toolsUsed = [];
    state.errors = [];
  });

  pi.on("turn_end", async (event, ctx) => {
    const state = getOrCreateState(ctx.state);
    if (state.currentTurnStart == null) return;

    const usage = extractUsage(event.message);
    if (usage.tokensIn) state.totalTokensIn += usage.tokensIn;
    if (usage.tokensOut) state.totalTokensOut += usage.tokensOut;

    const turn: TurnInfo = {
      index: state.turns.length,
      timestamp: state.currentTurnStart,
      modelId: state.currentTurnModel ?? "unknown",
      providerId: state.currentTurnProvider ?? "unknown",
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

  pi.on("tool_call", async (event, _ctx) => {
    const state = getOrCreateState(_ctx.state);
    state.toolsUsed.push(event.toolName);

    const filePath = extractPathFromArgs(event.toolName, event.input);
    if (filePath && (event.toolName === "edit" || event.toolName === "write")) {
      state.filesChanged.add(filePath);
    }
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    if (event.isError) {
      const state = getOrCreateState(ctx.state);
      state.errors.push(event.toolName);
    }
  });

  pi.on("message_end", async (event, ctx) => {
    if (!isRecord(event.message) || event.message.role !== "assistant") return;
    const usage = extractUsage(event.message);
    const state = getOrCreateState(ctx.state);
    if (usage.tokensIn) state.totalTokensIn += usage.tokensIn;
    if (usage.tokensOut) state.totalTokensOut += usage.tokensOut;
  });
}

export function getSessionState(ctx: ExtensionContext): SessionState {
  return getOrCreateState(ctx.state);
}

export function getCurrentTurnInfo(ctx: ExtensionContext): TurnInfo | undefined {
  const state = getOrCreateState(ctx.state);
  return state.turns.length > 0 ? state.turns[state.turns.length - 1] : undefined;
}

export function getSessionFilesChanged(ctx: ExtensionContext): string[] {
  return [...getOrCreateState(ctx.state).filesChanged];
}

export function getSessionErrors(ctx: ExtensionContext): string[] {
  return getOrCreateState(ctx.state).errors;
}

export function getTotalTokens(ctx: ExtensionContext): { in: number; out: number } {
  const state = getOrCreateState(ctx.state);
  return { in: state.totalTokensIn, out: state.totalTokensOut };
}

export function getTurnCount(ctx: ExtensionContext): number {
  return getOrCreateState(ctx.state).turns.length;
}

export function getActiveToolCount(ctx: ExtensionContext): number {
  return getOrCreateState(ctx.state).toolsUsed.length;
}
