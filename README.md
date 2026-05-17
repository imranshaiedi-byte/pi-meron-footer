# pi-meron-ui

Pi extension that provides a clean padded status bar and the meron-custom theme.

## Features

### Status Bar
Single-row padded footer (3-space left/right padding):

```
   ~/projects/foo • main    zai/glm-5.1 • off • 45.2%/128k
```

- **Left:** current directory + git branch
- **Right:** provider/model · thinking level · context usage %
- Color-coded context (warning >70%, error >90%)
- Session name shown alongside pwd when set

## Install

```bash
pi install git:github.com/imranshaiedi-byte/pi-meron-ui
```

## Theme

Includes a **meron-custom** theme. Select it via `/settings` → Theme, or in `~/.pi/agent/settings.json`:

```json
{
  "theme": "meron-custom"
}
```

| Element | Color |
|---------|-------|
| Tool title | Blue #61afef |
| Tool success bg | Dark green tint |
| Tool error bg | Dark red tint |
| Tool pending bg | Cool dark |
| User message bg | Subtle grey |

Thinking level borders follow a cool→warm progression:

| Level | Color | Hex |
|-------|-------|-----|
| off | Steel grey | #4b5263 |
| minimal | Blue | #61afef |
| low | Purple | #8b5cf6 |
| medium | Magenta | #c678dd |
| high | Amber | #e5a55b |
| xhigh | Red | #ef4444 |

## License

MIT
