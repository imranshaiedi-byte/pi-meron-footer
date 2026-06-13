/**
 * Thinking State (shared)
 *
 * Pure state + helpers for the thinking-pulse indicator. No UI calls, no
 * timers, no requestRender() — nothing here triggers a repaint.
 *
 * The footer reads this state in its own render(), which pi already calls on
 * every natural streaming repaint (driven by thinking_delta events). So the
 * indicator updates for free:
 *
 *   - Streaming: each token delta advances the spinner frame + count, riding
 *     along on repaints that already happen. Zero extra repaint work.
 *   - Paused:    no deltas -> frame + count freeze -> immediate "stuck" signal.
 *
 * The spinner frame only advances when a token batch actually arrived, so it
 * can never lie about activity.
 */

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
// Min ms between spinner frame advances. Throttles the visual spin rate so a
// fast token stream doesn't blur the spinner into noise.
const FRAME_MS = 140;
// Rough chars-per-token estimate, for the display approximation only.
const CHARS_PER_TOKEN = 4;

interface ThinkingState {
  active: boolean; // currently inside a thinking phase
  charCount: number; // cumulative thinking chars in the current message
  frameIdx: number; // current spinner frame
  lastFrameAdvanceAt: number; // timestamp (ms) of the last frame advance
}

export const thinkingState: ThinkingState = {
  active: false,
  charCount: 0,
  frameIdx: 0,
  lastFrameAdvanceAt: 0,
};

/** Begin a thinking phase. Resets counters for the new assistant message. */
export function beginThinking(): void {
  thinkingState.active = true;
  thinkingState.charCount = 0;
  thinkingState.frameIdx = 0;
  thinkingState.lastFrameAdvanceAt = 0;
}

/**
 * Record a thinking token delta. `chars` is the cumulative thinking char count
 * across all thinking blocks in the current message (monotonic). Advances the
 * spinner frame at most once per FRAME_MS, only because a delta arrived.
 */
export function noteThinkingDelta(chars: number): void {
  thinkingState.charCount = chars;
  const now = Date.now();
  if (now - thinkingState.lastFrameAdvanceAt >= FRAME_MS) {
    thinkingState.frameIdx =
      (thinkingState.frameIdx + 1) % SPINNER_FRAMES.length;
    thinkingState.lastFrameAdvanceAt = now;
  }
}

/** End the thinking phase (thinking done, text/tools starting, or message/agent end). */
export function endThinking(): void {
  thinkingState.active = false;
}

/**
 * Sum thinking chars across all thinking blocks in an assistant message.
 * The AgentMessage union also permits string content, so this is loosely typed
 * on purpose; message_update only ever passes an assistant message here.
 */
export function thinkingCharCount(message: any): number {
  let n = 0;
  const content = message?.content;
  if (!Array.isArray(content)) return n;
  for (const c of content) {
    if (c?.type === "thinking" && typeof c.thinking === "string") {
      n += c.thinking.length;
    }
  }
  return n;
}

/** Snapshot for the footer to format with theme colors. null when idle. */
export function thinkingPulse(): { frame: string; tokens: number } | null {
  if (!thinkingState.active) return null;
  const frame = SPINNER_FRAMES[thinkingState.frameIdx % SPINNER_FRAMES.length]!;
  const tokens = Math.round(thinkingState.charCount / CHARS_PER_TOKEN);
  return { frame, tokens };
}
