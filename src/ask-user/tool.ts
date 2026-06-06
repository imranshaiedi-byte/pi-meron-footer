import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { makeToolText, setToolResultStatus, toolHeader, withBranch } from "../claude-tool-style.js";
import { QuestionnaireDialog } from "./dialog.js";
import { buildQuestionnaireResponse, buildToolResult } from "./response.js";
import {
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  type QuestionAnswer,
  type QuestionnaireResult,
  type QuestionParams,
  QuestionParamsSchema,
} from "./types.js";
import { validateQuestionnaire } from "./validate.js";

const TOOL_NAME = "ask_user_question";
const TOOL_LABEL = "Questions";
const DECLINE_MESSAGE = "User declined to answer questions";

const PROMPT_SNIPPET = `Ask the user up to ${MAX_QUESTIONS} structured questions (${MIN_OPTIONS}-${MAX_OPTIONS} options each) when requirements are ambiguous`;

const PROMPT_GUIDELINES: string[] = [
  `Use ask_user_question whenever the user's request is underspecified and you cannot proceed without concrete decisions — you can ask up to ${MAX_QUESTIONS} questions per invocation.`,
  `Each question MUST have ${MIN_OPTIONS}-${MAX_OPTIONS} options. Every option requires a concise label (1-5 words) and a description explaining what the choice means or its trade-offs. The user can additionally type a custom answer ("Type something." row is appended automatically to single-select questions) or pick "Chat about this" to abandon the questionnaire.`,
  `Set multiSelect: true when multiple answers are valid; this suppresses the "Type something." row. Provide an options[].preview markdown string when an option benefits from richer side-by-side context (mockups, code snippets, diagrams, configs) — single-select only. NOTE: any non-empty preview on a single-select question ALSO suppresses the "Type something." row (no room in the side-by-side layout); "Chat about this" remains the escape hatch. If you recommend a specific option, make it the first option and append "(Recommended)" to its label.`,
  "Do not stack multiple ask_user_question calls back-to-back — group all clarifying questions into one invocation.",
];

function formatAnswerSummary(answer: QuestionAnswer): string {
  switch (answer.kind) {
    case "chat":
      return "Chat about this";
    case "multi":
      return answer.selected?.join(", ") ?? "(none)";
    case "custom":
      return answer.answer ?? "(no input)";
    case "option":
      return answer.answer ?? "(no input)";
  }
}

function renderCallSummary(args: QuestionParams, theme: any, context: any): string {
  const questions = args.questions ?? [];
  const count = questions.length;
  const headers = questions.map((q) => q.header).filter(Boolean);
  const chips = headers.length > 0 ? headers.join(", ") : `${count} ${count === 1 ? "question" : "questions"}`;
  return toolHeader(TOOL_LABEL, chips, theme, context);
}

function truncatePlain(value: string, max = 72): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

function answerLabel(answer: QuestionAnswer, params: QuestionParams | undefined): string {
  const header = params?.questions?.[answer.questionIndex]?.header?.trim();
  if (header) return header;
  return truncatePlain(answer.question.replace(/\?\s*$/, ""), 32);
}

function compactAnswerSummary(answer: QuestionAnswer, expanded: boolean): string {
  if (answer.kind === "chat") return "chat requested";
  if (answer.kind === "multi") {
    const selected = answer.selected ?? [];
    if (selected.length === 0) return "no selections";
    return truncatePlain(selected.join(", "), expanded ? 160 : 80);
  }

  const value = answer.answer ?? "";
  if (!value) return "no input";
  return truncatePlain(value, expanded ? 180 : 120);
}

function renderResultSummary(
  result: QuestionnaireResult | undefined,
  params: QuestionParams | undefined,
  theme: any,
  expanded: boolean,
): string {
  if (!result || result.cancelled) {
    return theme.fg("muted", DECLINE_MESSAGE);
  }

  const count = result.answers.length;
  if (count === 0) return theme.fg("muted", DECLINE_MESSAGE);

  const lines = [theme.fg("muted", `Answered ${count} ${count === 1 ? "question" : "questions"}`)];
  for (const answer of result.answers) {
    const label = theme.fg("accent", answerLabel(answer, params));
    const summary = theme.fg("text", compactAnswerSummary(answer, expanded));
    lines.push(`• ${label}: ${summary}`);
  }
  return lines.join("\n");
}

export function registerAskUserQuestionTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAME,
    label: "Ask User Question",
    description: `Ask the user one or more structured questions during execution. Use when you need to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take

Usage notes:
- Users will always be able to type a custom answer ("Type something." row is appended automatically to every single-select question) or pick "Chat about this" to abandon the questionnaire and continue in free-form conversation. Do NOT author "Other" / "Type something." / "Chat about this" labels yourself — duplicates are rejected at runtime.
- Use multiSelect: true to allow multiple answers to be selected for a question. The "Type something." row is suppressed on multi-select questions, and is ALSO suppressed on single-select questions where any option carries a \`preview\`.
- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label.

Preview feature:
Use the optional \`preview\` field on options when presenting concrete artifacts that users need to visually compare:
- ASCII mockups of UI layouts or components
- Code snippets showing different implementations
- Diagram variations
- Configuration examples

Preview content is rendered as markdown in a monospace box. Multi-line text with newlines is supported. When any option has a preview, the UI switches to a side-by-side layout with a vertical option list on the left and preview on the right. Do not use previews for simple preference questions where labels and descriptions suffice. Note: previews are only supported for single-select questions (not multiSelect).`,
    promptSnippet: PROMPT_SNIPPET,
    promptGuidelines: PROMPT_GUIDELINES,
    parameters: QuestionParamsSchema,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!params || typeof params !== "object") {
        return buildToolResult("Error: Invalid parameters", {
          answers: [],
          cancelled: true,
          error: "no_questions",
        });
      }

      const typed = params as unknown as QuestionParams;
      if (!ctx.hasUI) {
        return buildToolResult("Error: UI not available (running in non-interactive mode)", {
          answers: [],
          cancelled: true,
          error: "no_ui",
        });
      }

      const validation = validateQuestionnaire(typed);
      if (!validation.ok) {
        return buildToolResult(validation.message, {
          answers: [],
          cancelled: true,
          error: validation.error,
        });
      }

      try {
        const result = await ctx.ui.custom<QuestionnaireResult | null>(
          (tui, theme, _kb, done) => {
            const dialog = new QuestionnaireDialog({
              tui,
              theme,
              params: typed,
              done,
            });
            return dialog.component;
          },
          {
            overlay: true,
            overlayOptions: {
              anchor: "bottom-center",
              width: "100%",
              maxHeight: "100%",
              margin: { left: 0, right: 0, bottom: 0 },
            },
          },
        );

        return buildQuestionnaireResponse(result, typed);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return buildToolResult(`Error: ${errorMessage}`, {
          answers: [],
          cancelled: true,
        });
      }
    },

    renderCall(args, theme, context) {
      const typed = args as QuestionParams;
      const text = renderCallSummary(typed, theme, context);
      return makeToolText(context?.lastComponent, text);
    },

    renderResult(result, options, theme, context) {
      const details = result.details as QuestionnaireResult | undefined;
      const params = context?.args as QuestionParams | undefined;
      const isError = context?.isError === true;
      setToolResultStatus(context, isError);

      if (isError || !details || details.cancelled) {
        const text = withBranch(
          theme.fg("muted", isError ? "Questionnaire failed" : DECLINE_MESSAGE),
        );
        return makeToolText(context?.lastComponent, text);
      }

      const text = withBranch(renderResultSummary(details, params, theme, options.expanded === true));
      return makeToolText(context?.lastComponent, text);
    },
  });
}
