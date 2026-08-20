# pi-auto-theme

[![npm version](https://img.shields.io/npm/v/pi-auto-theme.svg)](https://www.npmjs.com/package/pi-auto-theme)

A simple extension for the [pi coding agent](https://github.com/earendil-works/pi-mono) that automatically changes the theme from dark to light (and vice versa) based on the theme of your operating system.

![pi-auto-theme demo](./pi-theme.gif)

## Check out my other Pi extensions

- [![pi-auto-theme](https://img.shields.io/badge/🎨_pi--auto--theme-blue?style=flat-square)](https://github.com/championswimmer/pi-auto-theme) — Automatically syncs Pi's theme with your OS dark/light mode appearance in real-time.
- [![pi-cache-graph](https://img.shields.io/badge/📊_pi--cache--graph-orange?style=flat-square)](https://github.com/championswimmer/pi-cache-graph) — Visualizes LLM prompt cache hit rates and token statistics across turns in your TUI.
- [![pi-context-prune](https://img.shields.io/badge/✂️_pi--context--prune-green?style=flat-square)](https://github.com/championswimmer/pi-context-prune) — Automatically prunes verbose tool outputs from future LLM context while preserving full history.
- [![pi-context-usage](https://img.shields.io/badge/🪟_pi--context--usage-purple?style=flat-square)](https://github.com/championswimmer/pi-context-usage) — Visualizes context window token distribution (system prompt, tools, messages, buffer) in a dot-grid summary.
- [![pi-speedometer](https://img.shields.io/badge/⚡_pi--speedometer-yellow?style=flat-square)](https://github.com/championswimmer/pi-speedometer) — Displays live LLM generation speed (tokens/sec) and time-to-first-token (TTFT) in the status bar.
- [![pi-subscription-meter](https://img.shields.io/badge/💳_pi--subscription--meter-red?style=flat-square)](https://github.com/championswimmer/pi-subscription-meter) — Surfaces subscription tiers, rate limits, and quota consumption across AI providers in a tabbed dialog.

## Features

- **Instant Reactions**: This extension does **NOT** depend on 'polling' every N seconds. Instead, it uses [crossterm-system-theme](https://github.com/championswimmer/crossterm-system-theme) with a native listener for theme changes, allowing it to react to OS-level theme changes instantly. 
- *(Note: It does fall back to a 3-second poll in certain Linux desktop environments if it cannot find a way to listen natively, but this rarely happens.)*
- **No Clutter**: This pi extension is lightweight. It adds a single `/theme` command to allow manual overrides and custom theme mappings.
- **Native Theme Picker**: Choose from `light`, `dark`, and installed pi themes using a pi-native selector with filtering, navigation, and save/cancel keybindings.
- **Custom Theme Mapping**: Map OS light/dark appearance to any pi theme, e.g. `catppuccin-latte` for light and `catppuccin-macchiato` for dark.
- **Commands**: 
  - `/theme` or `/theme config`: Opens the theme mapping picker.
  - `/theme auto`: Syncs the theme with your OS natively.
  - `/theme dark`: Overrides auto-sync and forces the configured dark theme.
  - `/theme light`: Overrides auto-sync and forces the configured light theme.
  - `/theme reset`: Removes custom mapping and returns to `light` / `dark`.

## Installation

Install the extension globally:

```bash
pi install npm:pi-auto-theme
```

Install it only for the current project:

```bash
pi install npm:pi-auto-theme -l
```

Or run it temporarily without installing:

```bash
pi -e npm:pi-auto-theme
```

If you have cloned the repository, you can run it from the local directory:

```bash
pi -e ./index.ts
```

## Configuration

Run `/theme` or `/theme config` to open the picker:

- `↑` / `↓`: move between Light theme and Dark theme
- `Enter`: open the theme selector
- Type in the selector to filter installed themes
- `Ctrl+S`: save the mapping
- `Esc`: cancel or go back

The mapping is stored at `~/.pi/agent/pi-auto-theme.json`. If you reset to the defaults, the file is removed.

## How it works

When the extension is loaded, it checks the current OS theme and immediately sets the configured `pi` UI theme. It also sets up a native theme change listener using `crossterm-system-theme`. If your OS switches between Light and Dark mode, the pi TUI will update instantly without restarting the session.

## License

ISC
