# pi-meron-suite

A pi extension suite providing footer/status bar and tool display overrides with clean meron-style rendering.

## Features

### Footer
Clean padded footer/status bar showing:
- Current working directory, session name, and git branch
- Model provider/id, thinking level, context usage, session cost, and cache hit rate bar

### Tool Display Overrides
Compact, human-readable rendering for built-in tools:
- `read`, `grep`, `find`, `ls`, `bash`, `edit`, `write`
- Status dots, branch-style summaries, and diff previews
- Clean headers like `● **Read** src/file.ts (42 lines loaded)` instead of raw tool names

### Thinking Pulse
A flicker-free live indicator for active thinking, shown in the footer.

When reasoning tokens are streaming, the footer's thinking segment shows a
spinner and a running token estimate instead of the resting thinking level:

```
... | claude… | ⠹ thinking… ~1,284 | Context: 12% | ...
```

- The spinner advances **only when token deltas actually arrive** — so it can
  never lie about activity. If it freezes mid-response, the model is paused.
- The token estimate ticks up alongside it.
- When thinking ends (or text/tool-calls begin), the segment reverts to the
  normal thinking level.
- Zero extra repaints: it reads shared state on the footer's natural streaming
  repaints, so there's no flicker even on long sessions.

## Installation

```bash
git:github.com/imranshaiedi-byte/pi-meron-suite
```

Then restart your pi session.

## Usage

The extension loads automatically on session start.

## Theme

Includes the `grayscale-v5` theme for consistent styling.

## License

MIT
