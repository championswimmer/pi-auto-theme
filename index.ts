import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AutocompleteItem } from "@mariozechner/pi-tui";
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

function setTheme(ctx: ExtensionContext, theme: string): boolean {
  const result = ctx.ui.setTheme(theme);
  if (result?.success === false) {
    ctx.ui.notify(`Could not set theme "${theme}": ${result.error ?? "unknown error"}`, "error");
    return false;
  }
  return true;
}

async function promptTheme(ctx: ExtensionCommandContext, label: string, currentValue: string): Promise<string | undefined> {
  const next = await ctx.ui.input(label, currentValue);
  if (next === undefined) return undefined;
  return next.trim() || currentValue;
}

export default function (pi: ExtensionAPI) {
  let monitor: { stop(): void } | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let currentMode: ThemeMode = "auto";
  let config: ThemeConfig = DEFAULT_CONFIG;

  const stopAutoMode = () => {
    if (monitor) {
      monitor.stop();
      monitor = null;
    }
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const startAutoMode = async (ctx: ExtensionContext) => {
    stopAutoMode(); // Ensure clean slate
    let currentTheme: SystemTheme = "dark"; // Fallback initial theme
    
    try {
      currentTheme = await getSystemTheme();
      setTheme(ctx, targetTheme(config, currentTheme));
    } catch (e) {
      // Ignored if theme detection fails initially
    }

    const updateTheme = (newTheme: SystemTheme) => {
      if (newTheme !== currentTheme) {
        currentTheme = newTheme;
        const theme = targetTheme(config, currentTheme);
        if (setTheme(ctx, theme)) {
          ctx.ui.notify(`OS theme changed, synced pi to ${theme}`, "info");
        }
      }
    };

    try {
      monitor = await monitorSystemTheme((newTheme) => {
        updateTheme(newTheme);
      });
    } catch (error) {
      if (error instanceof MonitoringUnsupportedError) {
        // Fall back to polling for environments where monitoring isn't supported
        intervalId = setInterval(async () => {
          try {
            const newTheme = await getSystemTheme();
            updateTheme(newTheme);
          } catch (e) {
            // Ignored if theme detection fails during polling
          }
        }, 3000);
      } else {
        ctx.ui.notify("Error setting up system theme monitor.", "error");
      }
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    // Only run if we have a UI (e.g. interactive mode)
    if (!ctx.hasUI) return;

    config = await loadConfig();

    if (currentMode === "auto") {
      await startAutoMode(ctx);
    } else {
      setTheme(ctx, targetTheme(config, currentMode));
    }
  });

  pi.on("session_shutdown", () => {
    stopAutoMode();
  });

  pi.registerCommand("theme", {
    description: "Switch theme mode: auto, light, dark, config, or reset",
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
        await startAutoMode(ctx);
        ctx.ui.notify(`Theme set to auto (${config.lightTheme} / ${config.darkTheme})`, "info");
      } else if (arg === "light" || arg === "dark") {
        currentMode = arg;
        stopAutoMode();
        const theme = targetTheme(config, arg);
        if (setTheme(ctx, theme)) {
          ctx.ui.notify(`Theme set to ${theme}`, "info");
        }
      } else if (arg === "config") {
        const lightTheme = await promptTheme(ctx, "Light theme", config.lightTheme);
        if (lightTheme === undefined) return;
        const darkTheme = await promptTheme(ctx, "Dark theme", config.darkTheme);
        if (darkTheme === undefined) return;

        config = { lightTheme, darkTheme };
        await saveConfig(config);
        ctx.ui.notify(`Saved theme mapping to ${CONFIG_PATH}`, "info");
        if (currentMode === "auto") await startAutoMode(ctx);
        else setTheme(ctx, targetTheme(config, currentMode));
      } else if (arg === "reset") {
        config = DEFAULT_CONFIG;
        await saveConfig(config);
        ctx.ui.notify("Theme mapping reset to light / dark", "info");
        if (currentMode === "auto") await startAutoMode(ctx);
        else setTheme(ctx, targetTheme(config, currentMode));
      } else {
        ctx.ui.notify("Invalid theme mode. Use 'auto', 'light', 'dark', 'config', or 'reset'", "error");
      }
    }
  });
}
