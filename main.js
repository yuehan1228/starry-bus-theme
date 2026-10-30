const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const PLUGIN_ID = "local.starry-bus-theme";
const AUTO_ID = "starry-bus-auto";
const NIGHT_ID = "starry-bus-night";
const DAY_ID = "starry-bus-day";
const FULL_AUTO_ID = `plugin:${PLUGIN_ID}:${AUTO_ID}`;
const FULL_NIGHT_ID = `plugin:${PLUGIN_ID}:${NIGHT_ID}`;
const FULL_DAY_ID = `plugin:${PLUGIN_ID}:${DAY_ID}`;

let pollTimer = null;
let lastSystemScheme = null;
let currentMode = "auto";
let cachedDataDir = "";
let cachedWallpaperUrlPath = "";
let settingsChangeHandler = null;
let appearanceChangeHandler = null;
let syncQueue = Promise.resolve();
let disposed = false;

function ensureWallpaperInDataDir(dataDir) {
  const bundled = path.join(__dirname, "assets", "starry-bus-bg.jpg");
  const target = path.join(dataDir, "starry-bus-bg.jpg");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(bundled) && !fs.existsSync(target)) {
      fs.copyFileSync(bundled, target);
    }
  } catch {
    // Fallback to existing target path if copy fails
  }
  return target.replace(/\\/g, "/");
}

function loadThemeCss(filename, wallpaperUrlPath) {
  const cssPath = path.join(__dirname, "themes", filename);
  const raw = fs.readFileSync(cssPath, "utf8");
  if (!wallpaperUrlPath) return raw;
  return raw.replace(
    /\/\* __STARRY_BUS_WALLPAPER__ \*\//g,
    `, url("${wallpaperUrlPath}")`
  );
}

function execFileText(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 2500, windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve("");
        return;
      }
      resolve(String(stdout || ""));
    });
  });
}

async function detectOsColorScheme() {
  if (process.platform === "win32") {
    const out = await execFileText("reg.exe", [
      "query",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
      "/v",
      "AppsUseLightTheme"
    ]);
    if (/0x0\b/i.test(out)) return "dark";
    if (/0x1\b/i.test(out)) return "light";
  } else if (process.platform === "darwin") {
    const out = await execFileText("defaults", ["read", "-g", "AppleInterfaceStyle"]);
    return /dark/i.test(out) ? "dark" : "light";
  } else if (process.platform === "linux") {
    const out = await execFileText("gsettings", [
      "get",
      "org.gnome.desktop.interface",
      "color-scheme"
    ]);
    if (/dark/i.test(out)) return "dark";
    if (/light|default/i.test(out)) return "light";
  }
  return lastSystemScheme || null;
}

async function syncAndRegisterThemes(systemScheme) {
  if (!cachedDataDir) {
    cachedDataDir = await pi.plugin.getDataPath();
  }
  if (!cachedWallpaperUrlPath) {
    cachedWallpaperUrlPath = ensureWallpaperInDataDir(cachedDataDir);
  }
  const nightCss = loadThemeCss("starry-bus-night.css", cachedWallpaperUrlPath);
  const dayCss = loadThemeCss("starry-bus-day.css", cachedWallpaperUrlPath);
  const autoBase = systemScheme === "light" ? "light" : "dark";
  const autoCss = autoBase === "light" ? dayCss : nightCss;

  await pi.themes.upsert({
    id: AUTO_ID,
    label: "星夜巴士 · 跟随系统 (Starry Bus Auto)",
    base: autoBase,
    css: autoCss
  });

  await pi.themes.upsert({
    id: NIGHT_ID,
    label: "星夜巴士 · 夜空版 (Starry Bus Night)",
    base: "dark",
    css: nightCss
  });

  await pi.themes.upsert({
    id: DAY_ID,
    label: "星夜巴士 · 云昼版 (Starry Bus Day)",
    base: "light",
    css: dayCss
  });

  return { dataDir: cachedDataDir, wallpaperUrlPath: cachedWallpaperUrlPath };
}

function modeForTheme(themeId) {
  if (themeId === FULL_AUTO_ID) return "auto";
  if (themeId === FULL_NIGHT_ID) return "night";
  if (themeId === FULL_DAY_ID) return "day";
  return null;
}

function syncActiveThemeWithMode(options = {}) {
  const task = syncQueue.then(() => performSync(options));
  syncQueue = task.catch(() => {});
  return task;
}

async function performSync(options = {}) {
  if (disposed) return { ok: false };
  const detectedScheme = await detectOsColorScheme();
  if (disposed) return { ok: false };
  const systemScheme = detectedScheme || lastSystemScheme || "dark";
  const schemeChanged = systemScheme !== lastSystemScheme;

  if (options.forceUpsert || schemeChanged) {
    await syncAndRegisterThemes(systemScheme);
  }
  lastSystemScheme = systemScheme;

  const appearance = await pi.app.getAppearance().catch(() => null);
  const currentTheme = appearance?.theme || "";

  let targetThemeId = null;
  if (currentMode === "night") {
    targetThemeId = FULL_NIGHT_ID;
  } else if (currentMode === "day") {
    targetThemeId = FULL_DAY_ID;
  } else {
    targetThemeId = FULL_AUTO_ID;
  }

  const shouldSwitch = options.forceApply || currentTheme === FULL_AUTO_ID;

  if (shouldSwitch && targetThemeId && currentTheme !== targetThemeId) {
    await pi.app.setTheme(targetThemeId);
  }

  const appearanceAfter = await pi.app.getAppearance().catch(() => null);
  if (cachedDataDir && (schemeChanged || options.forceApply || options.forceUpsert)) {
    try {
      fs.writeFileSync(
        path.join(cachedDataDir, "applied-status.json"),
        JSON.stringify(
          {
            appliedAt: new Date().toISOString(),
            mode: currentMode,
            systemScheme,
            targetThemeId,
            detectionAvailable: Boolean(detectedScheme),
            appearanceAfter: { theme: appearanceAfter?.theme, base: appearanceAfter?.base }
          },
          null,
          2
        ),
        "utf8"
      );
    } catch {
      // ignore status write error
    }
  }

  return {
    ok: true,
    mode: currentMode,
    systemScheme,
    themeId: appearanceAfter?.theme || targetThemeId
  };
}

async function setModeAndApply(mode) {
  const normalized = mode === "night" || mode === "day" ? mode : "auto";
  currentMode = normalized;
  await pi.plugin.setSettings({ themeMode: normalized });
  return syncActiveThemeWithMode({ forceUpsert: true, forceApply: true });
}

async function onLoad() {
  disposed = false;
  const settings = await pi.plugin.getSettings().catch(() => ({}));
  currentMode =
    settings?.themeMode === "night" || settings?.themeMode === "day"
      ? settings.themeMode
      : "auto";
  const initialAppearance = await pi.app.getAppearance();
  const selectedMode = modeForTheme(initialAppearance?.theme);
  if (selectedMode && selectedMode !== currentMode) {
    currentMode = selectedMode;
    await pi.plugin.setSettings({ themeMode: currentMode });
  }

  await syncActiveThemeWithMode({ forceUpsert: true, forceApply: false });

  settingsChangeHandler = (nextSettings) => {
    const nextMode =
      nextSettings?.themeMode === "night" || nextSettings?.themeMode === "day"
        ? nextSettings.themeMode
        : "auto";
    if (nextMode !== currentMode) {
      currentMode = nextMode;
      void syncActiveThemeWithMode({ forceUpsert: true, forceApply: true }).catch(console.error);
    }
  };
  pi.events.on("plugin:settingsChanged", settingsChangeHandler);

  appearanceChangeHandler = (appearance) => {
    const nextMode = modeForTheme(appearance?.theme);
    if (nextMode && nextMode !== currentMode) {
      currentMode = nextMode;
      void pi.plugin.setSettings({ themeMode: nextMode }).catch(console.error);
    }
    if (nextMode === "auto") {
      void syncActiveThemeWithMode().catch(console.error);
    }
  };
  pi.events.on("appearance:changed", appearanceChangeHandler);

  pollTimer = setInterval(() => {
    if (currentMode === "auto") {
      void syncActiveThemeWithMode({ forceUpsert: false, forceApply: false }).catch(console.error);
    }
  }, 4000);
  if (typeof pollTimer?.unref === "function") {
    pollTimer.unref();
  }

  await pi.commands.register({
    id: "starry-bus-theme.open",
    title: "Starry Bus Theme: Open Theme Panel / 打开星夜巴士主题面板",
    keywords: ["theme", "starry", "bus", "主题", "星夜巴士"],
    run: async () => {
      await pi.ui.openPanel();
    }
  });

  await pi.commands.register({
    id: "starry-bus-theme.apply-auto",
    title: "Starry Bus Theme: Follow System Light/Dark / 跟随系统深浅色自动切换",
    keywords: ["theme", "auto", "system", "星夜巴士", "跟随系统"],
    run: async () => {
      const res = await setModeAndApply("auto");
      const label = res.systemScheme === "light" ? "云昼版 (Light)" : "夜空版 (Dark)";
      await pi.ui.showToast(`已开启跟随系统深浅色（当前系统为 ${label}）`);
    }
  });

  await pi.commands.register({
    id: "starry-bus-theme.apply-night",
    title: "Starry Bus Theme: Apply Night Theme / 应用星夜巴士夜空版",
    keywords: ["theme", "dark", "night", "星夜巴士", "夜空"],
    run: async () => {
      await setModeAndApply("night");
      await pi.ui.showToast("已固定为「星夜巴士 · 夜空版」");
    }
  });

  await pi.commands.register({
    id: "starry-bus-theme.apply-day",
    title: "Starry Bus Theme: Apply Day Theme / 应用星夜巴士云昼版",
    keywords: ["theme", "light", "day", "星夜巴士", "云昼"],
    run: async () => {
      await setModeAndApply("day");
      await pi.ui.showToast("已固定为「星夜巴士 · 云昼版」");
    }
  });
}

async function onUnload() {
  disposed = true;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (settingsChangeHandler) {
    pi.events.off("plugin:settingsChanged", settingsChangeHandler);
    settingsChangeHandler = null;
  }
  if (appearanceChangeHandler) {
    pi.events.off("appearance:changed", appearanceChangeHandler);
    appearanceChangeHandler = null;
  }
  await pi.commands.unregister("starry-bus-theme.open").catch(() => {});
  await pi.commands.unregister("starry-bus-theme.apply-auto").catch(() => {});
  await pi.commands.unregister("starry-bus-theme.apply-night").catch(() => {});
  await pi.commands.unregister("starry-bus-theme.apply-day").catch(() => {});
}

async function onPanelInvoke(channel, payload) {
  if (channel === "theme.setMode") {
    return setModeAndApply(payload?.mode);
  }
  if (channel === "theme.status") {
    const systemScheme = await detectOsColorScheme();
    const appearance = await pi.app.getAppearance().catch(() => null);
    return {
      ok: true,
      mode: currentMode,
      systemScheme,
      appearance
    };
  }
  return { ok: false };
}

module.exports = { onLoad, onUnload, onPanelInvoke };
