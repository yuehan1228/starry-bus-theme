const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const prefix = 'plugin:local.starry-bus-theme:starry-bus-';
async function setup(initial = prefix + 'auto', savedMode = 'auto') {
  let scheme = 'light', theme = initial, interval, cleared = false;
  const commands = new Map(), events = new Map(), themes = new Map();
  const settings = { themeMode: savedMode };
  const emit = () => events.get('appearance:changed')?.({ theme });
  const context = {
    module: { exports: {} }, __dirname: root, console,
    process: { platform: 'win32' },
    require(name) {
      if (name === 'node:fs') return { ...fs, mkdirSync() {}, existsSync() { return true; }, writeFileSync() {} };
      if (name === 'node:path') return path;
      if (name === 'node:child_process') return { execFile(cmd, args, opts, cb) {
        assert.equal(cmd, 'reg.exe'); assert.equal(args.at(-1), 'AppsUseLightTheme');
        cb(null, 'AppsUseLightTheme REG_DWORD ' + (scheme === 'light' ? '0x1' : '0x0'));
      }};
      throw Error(name);
    },
    setInterval(fn) { interval = fn; return { unref() {} }; },
    clearInterval() { cleared = true; },
    pi: {
      plugin: { getDataPath: async () => 'C:/theme-data', getSettings: async () => settings,
        setSettings: async p => Object.assign(settings, p) },
      app: { getAppearance: async () => ({ theme, base: themes.get(theme.slice(prefix.length))?.base }),
        setTheme: async id => { theme = id; emit(); } },
      themes: { upsert: async t => { themes.set(t.id, t); } },
      commands: { register: async c => commands.set(c.id, c), unregister: async id => commands.delete(id) },
      events: { on: (n, fn) => events.set(n, fn), off: n => events.delete(n) },
      ui: { showToast: async () => {}, openPanel: async () => {} }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), context);
  await context.module.exports.onLoad();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { api: context.module.exports, get theme() { return theme; }, themes, events, commands, settings,
    get cleared() { return cleared; }, change: s => { scheme = s; },
    async select(mode) { theme = prefix + mode; emit(); await flush(); },
    async tick() { interval(); await flush(); } };
}
(async () => {
  const s = await setup();
  assert.equal(s.theme, prefix + 'auto');
  assert.equal(s.themes.get('starry-bus-auto').base, 'light');
  s.change('dark'); await s.tick();
  assert.equal(s.theme, prefix + 'auto');
  assert.equal(s.themes.get('starry-bus-auto').base, 'dark');
  s.change('light'); await s.select('night');
  for (let i = 0; i < 3; i++) await s.tick();
  assert.equal(s.theme, prefix + 'night', 'manual Night survives light OS polling');
  assert.equal(s.settings.themeMode, 'night');
  s.change('dark'); await s.select('day'); await s.tick();
  assert.equal(s.theme, prefix + 'day', 'manual Day survives dark OS polling');
  assert.equal(s.settings.themeMode, 'day');
  await s.select('auto'); await s.tick();
  assert.equal(s.settings.themeMode, 'auto');
  assert.equal(s.themes.get('starry-bus-auto').base, 'dark');
  await s.api.onPanelInvoke('theme.setMode', { mode: 'night' });
  assert.equal(s.theme, prefix + 'night');
  await s.api.onPanelInvoke('theme.setMode', { mode: 'auto' });
  assert.equal(s.theme, prefix + 'auto');
  await s.api.onUnload();
  assert.equal(s.cleared, true); assert.equal(s.events.size, 0); assert.equal(s.commands.size, 0);
  const reload = await setup(prefix + 'night', 'auto');
  await reload.tick(); assert.equal(reload.theme, prefix + 'night');
  assert.equal(reload.settings.themeMode, 'night', 'selected theme wins over stale saved Auto');
  await reload.api.onUnload();
  const other = await setup('plugin:other:theme');
  other.change('dark'); await other.tick();
  assert.equal(other.theme, 'plugin:other:theme');
  await other.api.onUnload();
  console.log('PASS: Auto light/dark, manual Night/Day selection, polling stability, mode persistence, panel switching, reload, unrelated theme protection, unload cleanup');
})().catch(e => { console.error(e); process.exitCode = 1; });
