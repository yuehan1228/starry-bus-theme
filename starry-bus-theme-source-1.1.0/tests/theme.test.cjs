const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const prefix = 'plugin:local.starry-bus-theme:starry-bus-';
async function setup(initial = prefix + 'night') {
  let scheme = 'light', theme = initial, interval, cleared = false;
  const commands = new Map(), events = new Map(), themes = new Map(), settings = {};
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
      app: { getAppearance: async () => ({ theme, base: theme.endsWith('day') ? 'light' : 'dark' }),
        setTheme: async id => { theme = id; } },
      themes: { upsert: async t => themes.set(t.id, t) },
      commands: { register: async c => commands.set(c.id, c), unregister: async id => commands.delete(id) },
      events: { on: (n, fn) => events.set(n, fn), off: n => events.delete(n) },
      ui: { showToast: async () => {}, openPanel: async () => {} }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), context);
  await context.module.exports.onLoad();
  return { api: context.module.exports, get theme() { return theme; }, themes, events, commands,
    get cleared() { return cleared; }, change: s => { scheme = s; },
    async tick() { interval(); await new Promise(resolve => setImmediate(resolve)); } };
}
(async () => {
  const s = await setup();
  assert.equal(s.theme, prefix + 'day', 'light OS selects Day');
  assert.equal(s.themes.size, 3);
  assert.match(s.themes.get('starry-bus-day').css, /url\("C:\/theme-data\/starry-bus-bg.jpg"\)/);
  s.change('dark'); await s.tick();
  assert.equal(s.theme, prefix + 'night', 'dark OS selects Night');
  await s.api.onPanelInvoke('theme.setMode', { mode: 'day' });
  await s.tick(); assert.equal(s.theme, prefix + 'day', 'pinned Day survives dark OS');
  await s.api.onPanelInvoke('theme.setMode', { mode: 'auto' });
  assert.equal(s.theme, prefix + 'night', 'Auto resumes OS scheme');
  await s.api.onUnload();
  assert.equal(s.cleared, true); assert.equal(s.events.size, 0); assert.equal(s.commands.size, 0);
  const other = await setup('plugin:other:theme');
  assert.equal(other.theme, 'plugin:other:theme', 'startup preserves unrelated theme');
  other.change('dark'); await other.tick();
  assert.equal(other.theme, 'plugin:other:theme', 'poll preserves unrelated theme');
  await other.api.onUnload();
  console.log('PASS: OS light/dark, wallpaper injection, pinned mode, Auto resume, unrelated theme protection, unload cleanup');
})().catch(e => { console.error(e); process.exitCode = 1; });
