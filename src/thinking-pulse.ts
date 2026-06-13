/**
 * Thinking Pulse — event tracker
 *
 * Drives the shared thinking-state from message_update events. This module
 * performs NO UI calls and triggers NO repaints — it only mutates the state
 * in ./thinking-state.ts. The footer renders the indicator from that state on
 * its own natural repaints, so this stays flicker-free even on long sessions.
 *
 * See ./thinking-state.ts for the rendering contract.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  beginThinking,
  endThinking,
  noteThinkingDelta,
  thinkingCharCount,
} from "./thinking-state.js";

export function registerThinkingPulse(pi: ExtensionAPI): void {
  pi.on("message_update", (event) => {
    const type = event.assistantMessageEvent?.type;
    if (type === "thinking_start") {
      beginThinking();
      const chars = thinkingCharCount(event.message);
      if (chars > 0) noteThinkingDelta(chars);
    } else if (type === "thinking_delta") {
      noteThinkingDelta(thinkingCharCount(event.message));
    } else if (
      type === "thinking_end" ||
      type === "text_start" ||
      type === "toolcall_start"
    ) {
      endThinking();
    }
  });

  // Safety nets so state never lingers "active" past the response
  // (covers aborts, errors, and multi-turn loops).
  pi.on("message_end", endThinking);
  pi.on("agent_end", endThinking);

  // Reset across reload / new session / resume / fork / quit.
  pi.on("session_shutdown", endThinking);
  pi.on("session_start", endThinking);
}
