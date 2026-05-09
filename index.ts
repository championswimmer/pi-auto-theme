import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DynamicBorder,
  getAgentDir,
  getSelectListTheme,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  Key,
  matchesKey,
  SelectList,
  truncateToWidth,
  type AutocompleteItem,
  type Component,
  visibleWidth,
  type SelectItem,
} from "@earendil-works/pi-tui";
import { getSystemTheme, monitorSystemTheme, MonitoringUnsupportedError } from "crossterm-system-theme";

type ThemeMode = "auto" | "light" | "dark";
type SystemTheme = "light" | "dark";
type ThemeConfig = { lightTheme: string; darkTheme: string };

const DEFAULT_CONFIG: ThemeConfig = { lightTheme: "light", darkTheme: "dark" };
const CONFIG_PATH = path.join(getAgentDir(), "pi-auto-theme.json");

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function themeName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function loadConfig(): Promise<ThemeConfig> {
  try {
    const parsed = JSON.parse(await readFile(CONFIG_PATH, "utf8")) as unknown;
    if (!isObject(parsed)) return DEFAULT_CONFIG;
    return {
      lightTheme: themeName(parsed.lightTheme, DEFAULT_CONFIG.lightTheme),
      darkTheme: themeName(parsed.darkTheme, DEFAULT_CONFIG.darkTheme),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function saveConfig(config: ThemeConfig): Promise<void> {
  if (config.lightTheme === DEFAULT_CONFIG.lightTheme && config.darkTheme === DEFAULT_CONFIG.darkTheme) {
    await rm(CONFIG_PATH, { force: true });
    return;
  }
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function targetTheme(config: ThemeConfig, systemTheme: SystemTheme): string {
  return systemTheme === "light" ? config.lightTheme : config.darkTheme;
}

function canManageThemes(ctx: ExtensionContext): boolean {
  if (!ctx.hasUI) return false;
  try {
    return ctx.ui.getAllThemes().length > 0;
  } catch {
    return false;
  }
}

function setTheme(ctx: ExtensionContext, theme: string): boolean {
  try {
    const result = ctx.ui.setTheme(theme);
    if (result?.success === false) {
      ctx.ui.notify(`Could not set theme "${theme}": ${result.error ?? "unknown error"}`, "error");
      return false;
    }
    return true;
  } catch (error) {
    ctx.ui.notify(`Could not set theme "${theme}": ${error instanceof Error ? error.message : String(error)}`, "error");
    return false;
  }
}

function availableThemeNames(ctx: ExtensionCommandContext): string[] {
  const names = new Set([DEFAULT_CONFIG.lightTheme, DEFAULT_CONFIG.darkTheme]);
  for (const theme of ctx.ui.getAllThemes()) {
    if (theme.name) names.add(theme.name);
  }
  return [...names].sort((a, b) => {
    if (a === DEFAULT_CONFIG.lightTheme) return -1;
    if (b === DEFAULT_CONFIG.lightTheme) return 1;
    if (a === DEFAULT_CONFIG.darkTheme) return -1;
    if (b === DEFAULT_CONFIG.darkTheme) return 1;
    return a.localeCompare(b);
  });
}

class ThemeSubmenu implements Component {
  private query = "";
  private selectList: SelectList;

  constructor(themes: string[], currentValue: string, private done: (selectedValue?: string) => void) {
    const items: SelectItem[] = themes.map((name) => ({
      value: name,
      label: name,
      description: name === currentValue ? "current" : undefined,
    }));
    this.selectList = new SelectList(items, Math.min(items.length, 12), getSelectListTheme(), {
      minPrimaryColumnWidth: 16,
      maxPrimaryColumnWidth: 36,
    });
    const currentIndex = themes.indexOf(currentValue);
    if (currentIndex >= 0) this.selectList.setSelectedIndex(currentIndex);
    this.selectList.onSelect = (item) => this.done(item.value);
    this.selectList.onCancel = () => this.done(undefined);
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.backspace)) {
      this.query = this.query.slice(0, -1);
      this.selectList.setFilter(this.query);
      return;
    }
    if (data.length === 1 && data >= " " && data !== "\x7f") {
      this.query += data;
      this.selectList.setFilter(this.query);
      return;
    }
    this.selectList.handleInput(data);
  }

  render(width: number): string[] {
    const title = this.query ? `Search: ${this.query}` : "Theme Selection";
    return [
      truncateToWidth(title, width),
      truncateToWidth("Type to filter. enter to choose.", width),
      "",
      ">",
      "",
      ...this.selectList.render(width),
      "",
      truncateToWidth("  enter choose · type filter · backspace delete · esc back", width),
    ];
  }

  invalidate(): void {
    this.selectList.invalidate();
  }
}

type ConfigRow = {
  id: SystemTheme;
  label: string;
  description: string;
};

const CONFIG_ROWS: ConfigRow[] = [
  {
    id: "light",
    label: "Light Theme",
    description: "Used when your OS is in light appearance.",
  },
  {
    id: "dark",
    label: "Dark Theme",
    description: "Used when your OS is in dark appearance.",
  },
];

class ThemeConfigPicker implements Component {
  private selectedIndex = 0;
  private submenu: Component | null = null;

  constructor(
    private themes: string[],
    private draft: ThemeConfig,
    private style: {
      title: (text: string) => string;
      selected: (text: string) => string;
      muted: (text: string) => string;
    },
    private done: (result: ThemeConfig | undefined) => void,
    private requestRender: () => void,
  ) {}

  handleInput(data: string): void {
    if (this.submenu) {
      this.submenu.handleInput?.(data);
      this.requestRender();
      return;
    }

    if (matchesKey(data, Key.ctrl("s"))) {
      this.done({ ...this.draft });
    } else if (matchesKey(data, Key.escape)) {
      this.done(undefined);
    } else if (matchesKey(data, Key.up)) {
      this.selectedIndex = this.selectedIndex === 0 ? CONFIG_ROWS.length - 1 : this.selectedIndex - 1;
    } else if (matchesKey(data, Key.down)) {
      this.selectedIndex = this.selectedIndex === CONFIG_ROWS.length - 1 ? 0 : this.selectedIndex + 1;
    } else if (matchesKey(data, Key.enter)) {
      this.openSubmenu(CONFIG_ROWS[this.selectedIndex]!);
    }
    this.requestRender();
  }

  render(width: number): string[] {
    if (this.submenu) return this.submenu.render(width);

    const selected = CONFIG_ROWS[this.selectedIndex]!;
    return [
      truncateToWidth(this.style.title("Theme Configuration"), width),
      truncateToWidth(this.style.muted("Auto theme mapping. ctrl+s to save."), width),
      "",
      ...CONFIG_ROWS.map((row, index) => this.renderRow(row, index === this.selectedIndex, width)),
      "",
      truncateToWidth(this.style.muted(`  ${selected.label}: ${selected.description}`), width),
      "",
      truncateToWidth(this.style.muted("  enter choose · ctrl+s save · esc cancel"), width),
    ];
  }

  invalidate(): void {
    this.submenu?.invalidate();
  }

  private renderRow(row: ConfigRow, isSelected: boolean, width: number): string {
    const prefix = isSelected ? "→ " : "  ";
    const label = `${row.label}:`;
    const labelWidth = Math.max(...CONFIG_ROWS.map((item) => visibleWidth(item.label))) + 1;
    const value = this.draft[`${row.id}Theme`];
    const text = `${prefix}${label}${" ".repeat(Math.max(1, labelWidth - visibleWidth(label) + 2))}${value}`;
    return truncateToWidth(isSelected ? this.style.selected(text) : text, width);
  }

  private openSubmenu(row: ConfigRow): void {
    this.submenu = new ThemeSubmenu(this.themes, this.draft[`${row.id}Theme`], (selectedValue) => {
      if (selectedValue) this.draft[`${row.id}Theme`] = selectedValue;
      this.submenu = null;
      this.requestRender();
    });
  }
}

async function pickThemeConfig(ctx: ExtensionCommandContext, initialConfig: ThemeConfig): Promise<ThemeConfig | undefined> {
  const themes = availableThemeNames(ctx);
  const draft: ThemeConfig = { ...initialConfig };

  return ctx.ui.custom<ThemeConfig | undefined>((tui, theme, _keybindings, done) => {
    const picker = new ThemeConfigPicker(
      themes,
      draft,
      {
        title: (text) => theme.fg("accent", theme.bold(text)),
        selected: (text) => theme.fg("accent", text),
        muted: (text) => theme.fg("dim", text),
      },
      done,
      () => tui.requestRender(),
    );

    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    container.addChild(picker);
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => picker.handleInput(data),
    };
  });
}

export default function (pi: ExtensionAPI) {
  let monitor: { stop(): void } | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let currentMode: ThemeMode = "auto";
  let config: ThemeConfig = DEFAULT_CONFIG;
  let autoRunId = 0;

  const stopAutoMode = () => {
    autoRunId += 1;
    if (monitor) {
      monitor.stop();
      monitor = null;
    }
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const startAutoMode = async (ctx: ExtensionContext, options: { notifyUnavailable?: boolean } = {}): Promise<boolean> => {
    stopAutoMode(); // Ensure clean slate
    const runId = autoRunId;

    if (!canManageThemes(ctx)) {
      if (options.notifyUnavailable) ctx.ui.notify("Theme switching is unavailable in this pi mode.", "error");
      return false;
    }

    let currentTheme: SystemTheme | null = null;
    
    try {
      currentTheme = await getSystemTheme();
      if (runId !== autoRunId) return false;
      setTheme(ctx, targetTheme(config, currentTheme));
    } catch {
      // Ignored if theme detection fails initially
    }

    const updateTheme = (newTheme: SystemTheme) => {
      if (runId !== autoRunId) return;
      if (newTheme !== currentTheme) {
        currentTheme = newTheme;
        const theme = targetTheme(config, currentTheme);
        if (setTheme(ctx, theme)) {
          ctx.ui.notify(`OS theme changed, synced pi to ${theme}`, "info");
        }
      }
    };

    try {
      const nextMonitor = await monitorSystemTheme(updateTheme);
      if (runId !== autoRunId) {
        nextMonitor.stop();
        return false;
      }
      monitor = nextMonitor;
      return true;
    } catch (error) {
      if (runId !== autoRunId) return false;
      if (error instanceof MonitoringUnsupportedError) {
        // Fall back to polling for environments where monitoring isn't supported
        intervalId = setInterval(async () => {
          if (runId !== autoRunId) return;
          try {
            const newTheme = await getSystemTheme();
            updateTheme(newTheme);
          } catch {
            // Ignored if theme detection fails during polling
          }
        }, 3000);
        return true;
      } else {
        ctx.ui.notify("Error setting up system theme monitor.", "error");
        return false;
      }
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    // Only run if we have a UI (e.g. interactive mode)
    if (!ctx.hasUI) return;

    config = await loadConfig();

    if (currentMode === "auto") {
      await startAutoMode(ctx);
    } else if (canManageThemes(ctx)) {
      setTheme(ctx, targetTheme(config, currentMode));
    }
  });

  pi.on("session_shutdown", () => {
    stopAutoMode();
  });

  pi.registerCommand("theme", {
    description: "Open theme picker or switch mode: auto, light, dark, config, reset",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const options = ["auto", "light", "dark", "config", "reset"];
      const items = options.map((e) => ({ value: e, label: e }));
      const filtered = items.filter((i) => i.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      config = await loadConfig();
      
      if (arg === "auto") {
        currentMode = "auto";
        if (await startAutoMode(ctx, { notifyUnavailable: true })) {
          ctx.ui.notify(`Theme set to auto (${config.lightTheme} / ${config.darkTheme})`, "info");
        }
      } else if (arg === "light" || arg === "dark") {
        currentMode = arg;
        stopAutoMode();
        if (!canManageThemes(ctx)) {
          ctx.ui.notify("Theme switching is unavailable in this pi mode.", "error");
          return;
        }
        const theme = targetTheme(config, arg);
        if (setTheme(ctx, theme)) {
          ctx.ui.notify(`Theme set to ${theme}`, "info");
        }
      } else if (arg === "" || arg === "config") {
        if (!canManageThemes(ctx)) {
          ctx.ui.notify("Theme configuration is unavailable in this pi mode.", "error");
          return;
        }
        const nextConfig = await pickThemeConfig(ctx, config);
        if (!nextConfig) return;

        config = nextConfig;
        await saveConfig(config);
        ctx.ui.notify(`Saved theme mapping to ${CONFIG_PATH}`, "info");
        if (currentMode === "auto") await startAutoMode(ctx);
        else if (canManageThemes(ctx)) setTheme(ctx, targetTheme(config, currentMode));
      } else if (arg === "reset") {
        config = DEFAULT_CONFIG;
        await saveConfig(config);
        ctx.ui.notify("Theme mapping reset to light / dark", "info");
        if (currentMode === "auto") await startAutoMode(ctx);
        else if (canManageThemes(ctx)) setTheme(ctx, targetTheme(config, currentMode));
      } else {
        ctx.ui.notify("Invalid theme mode. Use 'auto', 'light', 'dark', 'config', or 'reset'", "error");
      }
    }
  });
}
