# pi-auto-theme

[![npm version](https://img.shields.io/npm/v/pi-auto-theme.svg)](https://www.npmjs.com/package/pi-auto-theme)

A simple extension for the [pi coding agent](https://github.com/badlogic/pi-mono) that automatically changes the theme from dark to light (and vice versa) based on the theme of your operating system.

![pi-auto-theme demo](./pi-theme.gif)

## Features

- **Instant Reactions**: This extension does **NOT** depend on 'polling' every N seconds. Instead, it uses [crossterm-system-theme](https://github.com/championswimmer/crossterm-system-theme) with a native listener for theme changes, allowing it to react to OS-level theme changes instantly. 
- *(Note: It does fall back to a 3-second poll in certain Linux desktop environments if it cannot find a way to listen natively, but this rarely happens.)*
- **No Clutter**: This pi extension is lightweight. It adds a single `/theme` command to allow manual overrides and custom theme mappings.
- **Custom Theme Mapping**: Map OS light/dark appearance to any pi theme, e.g. `catppuccin-latte` for light and `catppuccin-macchiato` for dark.
- **Commands**: 
  - `/theme auto`: Syncs the theme with your OS natively.
  - `/theme dark`: Overrides auto-sync and forces the configured dark theme.
  - `/theme light`: Overrides auto-sync and forces the configured light theme.
  - `/theme config`: Prompts for light and dark theme names, then saves them.
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

Run `/theme config` and enter any installed pi theme names:

```text
Light theme: catppuccin-latte
Dark theme: catppuccin-macchiato
```

The mapping is stored at `~/.pi/agent/pi-auto-theme.json`. If you reset to the defaults, the file is removed.

## How it works

When the extension is loaded, it checks the current OS theme and immediately sets the configured `pi` UI theme. It also sets up a native theme change listener using `crossterm-system-theme`. If your OS switches between Light and Dark mode, the pi TUI will update instantly without restarting the session.

## License

ISC
