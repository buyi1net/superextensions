#!/usr/bin/env node
/**
 * superextensions 跨 agent 一键安装器（跨平台：Windows / macOS / Linux）
 *
 * 把 superextensions plugin（规则总纲 constitution + 配套 skill）装到 Claude Code / Codex / OpenCode / OMP / ZCode。
 * ZCode Desktop 的插件市场负责普通 UI 安装；本机若提供 `zcode-cli`，安装器会走其公开插件命令完成登记、安装或更新；没有该入口时保留 UI 检查点。
 * Pi 不归这里管：Pi 有原生包机制，用 `pi install git:github.com/buyi1net/superextensions`（README「分家手动」）。
 * 各家的安装策略：
 *   - Claude Code：marketplace add --sparse，装时只拉自己的目录
 *   - Codex：plugin add 会二次完整 clone，不能 sparse（partial clone 缺 blob 会失败），
 *            必须保留原生完整缓存，不能在安装后删除仓库文件
 *   - OpenCode：原生 plugin add/update；Git 插件由 OpenCode 管理缓存和全局配置
 *   - OMP：marketplace 插件通道（omp plugin marketplace add + install）；不能用 omp install
 *          <git-url>：npm git 依赖通道只扫 skills/ 一级目录，嵌套 skill 会丢
 *   - ZCode：优先使用 `zcode-cli` 的 marketplace/install/update 命令，并核对 enabled 与 skillCount；没有该版本入口时回退到桌面插件市场。
 *
 * 用法：
 *   node install.mjs                装五家（ZCode 无 zcode-cli 时走桌面插件市场）
 *   node install.mjs --cc|--codex|--opencode|--omp|--zcode   只装指定家（可组合）
 *   node install.mjs --uninstall    五家卸载（Pi 用 pi remove，不归这里）
 *   node install.mjs --codex --uninstall       只卸载 Codex（其它目标同理）
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'buyi1net/superextensions';
const GIT_URL = 'https://github.com/buyi1net/superextensions.git';
const MARKET = 'superextensions';
const PLUGIN = 'superextensions';
const HOME = os.homedir();
const isWin = os.platform() === 'win32';
const DELIVERY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Claude Code sparse 只拉这几个目录（.claude-plugin 里同时含 marketplace.json + plugin.json）
const CC_SPARSE = ['.claude-plugin', 'hooks', 'skills'];
// post-clean 白名单：各家 cache 只保留这些，其余（仓库杂物 + 别家清单）一律删——比黑名单稳，仓库以后加新根文件也不漏
const CC_KEEP = ['.claude-plugin', 'hooks', 'skills', '.in_use'];   // .in_use 是 Claude Code 装插件的内部标记

const log = (m) => console.log(m);
const sh = (cmd) => execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
const shLoud = (cmd, opts = {}) => { log('  $ ' + cmd); return execSync(cmd, { stdio: 'inherit', ...opts }); };
const tryQuiet = (cmd) => { try { sh(cmd); return true; } catch { return false; } };
const has = (bin) => { try { sh(isWin ? `where ${bin}` : `command -v ${bin}`); return true; } catch { return false; } };

// 删目录（可传多个），不存在就跳过。统一安装器会清理目标空目录或异常残留，不触碰其它插件。
function rmDir(...dirs) {
  for (const d of dirs) { if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true }); }
}

// 白名单清理：cache 目录下只留 keepList 里的，其余全删（仓库杂物、别家清单一律清掉）
function keepOnly(cacheDir, keepList) {
  if (!cacheDir || !fs.existsSync(cacheDir)) return [];
  const removed = [];
  for (const name of fs.readdirSync(cacheDir)) {
    if (keepList.includes(name)) continue;
    fs.rmSync(path.join(cacheDir, name), { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}

// 在 <base>/<market>/<plugin>/ 下找版本目录，返回最新一个的完整路径
function findPluginCache(base) {
  const dir = path.join(base, MARKET, PLUGIN);
  if (!fs.existsSync(dir)) return null;
  const subs = fs.readdirSync(dir).filter(d => {
    try { return fs.statSync(path.join(dir, d)).isDirectory(); } catch { return false; }
  });
  return subs.length ? path.join(dir, subs.sort().pop()) : null;
}

// 装新删老：同插件下只留 mtime 最新的版本目录，其余删掉（不依赖版本号解析，稳）
function pruneOldVersions(base) {
  const dir = path.join(base, MARKET, PLUGIN);
  if (!fs.existsSync(dir)) return [];
  const subs = fs.readdirSync(dir)
    .map(d => path.join(dir, d))
    .filter(p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } })
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const removed = [];
  for (const p of subs.slice(1)) { fs.rmSync(p, { recursive: true, force: true }); removed.push(path.basename(p)); }
  return removed;
}

// ---------- Claude Code ----------
function installCC() {
  log('\n=== Claude Code ===');
  if (!has('claude')) { log('  跳过：未找到 claude CLI'); return; }
  tryQuiet(`claude plugin marketplace remove ${MARKET}`);           // 幂等：先清旧的
  shLoud(`claude plugin marketplace add ${GIT_URL} --sparse ${CC_SPARSE.join(' ')}`);   // 用完整 HTTPS URL：短格式在某些机器会被 claude 当 SSH 解析、新机器缺 host key/key 会失败
  shLoud(`claude plugin install ${PLUGIN}@${MARKET}`);
  const ccBase = path.join(HOME, '.claude', 'plugins', 'cache');
  const cache = findPluginCache(ccBase);
  const rm = keepOnly(cache, CC_KEEP);                              // 白名单清理：只留自己需要的
  const pruned = pruneOldVersions(ccBase);                          // 删老版本目录，只留刚装的
  log(`  ✓ Claude Code 装好${rm.length ? '（清理：' + rm.join(', ') + '）' : ''}${pruned.length ? '（删老版本：' + pruned.join(', ') + '）' : ''}；plugin 自带 hooks.json，新会话自动注入`);
}

// ---------- Codex ----------
function installCodex() {
  log('\n=== Codex ===');
  if (!has('codex')) { log('  跳过：未找到 codex CLI'); return; }
  const cxBase = path.join(HOME, '.codex', 'plugins', 'cache');
  tryQuiet(`codex plugin remove ${PLUGIN}@${MARKET}`);              // 先解除旧插件注册，避免重装继续命中旧 cache
  tryQuiet(`codex plugin marketplace remove ${MARKET}`);            // 再移除旧 Marketplace
  rmDir(path.join(cxBase, MARKET),                                 // Linux 实测 plugin remove 可能留下空的 Marketplace cache 父目录
        path.join(HOME, '.codex', '.tmp', 'marketplaces', MARKET));
  shLoud(`codex plugin marketplace add ${REPO}`);                   // 整仓（不能 sparse）
  shLoud(`codex plugin add ${PLUGIN}@${MARKET}`);
  const cache = findPluginCache(cxBase);
  if (!cache) throw new Error('没找到 Codex plugin cache');
  const required = ['.git', '.codex-plugin', 'skills', 'package.json', 'README.md'];
  const missing = required.filter(name => !fs.existsSync(path.join(cache, name)));
  if (missing.length) throw new Error(`Codex plugin cache 不完整：${missing.join(', ')}`);
  cleanCodexHook();                                                 // 走 skill 引用，清掉之前配过的 hook
  log('  ✓ Codex 已完成干净重装；保留原生完整 cache，走 skill 引用：开场露 description、按需调用加载全文');
}

// Codex 走 skill 引用、不用 hook（exec 不触发 SessionStart、交互全靠模型自觉调）：
// 把本 plugin 之前配过的 hook 清掉，不动别人的 hook。
function cleanCodexHook() {
  const hooksJson = path.join(HOME, '.codex', 'hooks.json');
  if (!fs.existsSync(hooksJson)) return;
  try {
    const cfg = JSON.parse(fs.readFileSync(hooksJson, 'utf8'));
    if (!cfg.hooks?.SessionStart) return;
    const isOurs = (e) => /session-start|规则总纲|constitution/.test(JSON.stringify(e));
    cfg.hooks.SessionStart = cfg.hooks.SessionStart.filter(e => !isOurs(e));
    if (!cfg.hooks.SessionStart.length) delete cfg.hooks.SessionStart;
    if (cfg.hooks && !Object.keys(cfg.hooks).length) delete cfg.hooks;
    fs.writeFileSync(hooksJson, JSON.stringify(cfg, null, 2));
  } catch {}
}

// ---------- OpenCode ----------
function installOpencode() {
  log('\n=== OpenCode ===');
  if (!has('opencode')) { log('  跳过：未找到 opencode CLI'); return; }
  // OpenCode 使用 `plugin add/update`，由原生 CLI 管理 Git 插件缓存和全局配置。
  const spec = `git+${GIT_URL}`;
  shLoud(`opencode plugin add "${spec}"`);                 // 幂等：首次安装或确保配置登记
  shLoud(`opencode plugin update "${spec}"`);              // 无版本号 Git 依赖拉取最新公开仓提交
  log('  ✓ OpenCode 已通过原生 plugin add/update 安装并写入全局配置');
}

// ---------- ZCode ----------
function installZcode() {
  log('\n=== ZCode ===');
  if (!has('zcode-cli')) {
    log('  跳过：未找到 zcode-cli；请在 ZCode 桌面插件市场刷新并更新');
    return;
  }
  // zcode-cli 是随具体 ZCode 版本提供的可选 CLI 包装入口；不碰内部 cache。
  tryQuiet(`zcode-cli plugins marketplace add ${REPO} --scope user`);
  let installed;
  try {
    const plugins = JSON.parse(sh('zcode-cli plugins list --json'));
    installed = plugins.find((item) => item.id === `${PLUGIN}@${MARKET}`);
  } catch (error) {
    throw new Error(`无法读取 ZCode 插件列表：${error.message}`);
  }
  if (installed) {
    shLoud(`zcode-cli plugins update ${PLUGIN}@${MARKET}`);
  } else {
    shLoud(`zcode-cli plugins install ${PLUGIN}@${MARKET} -s user`);
  }
  let refreshed;
  try {
    const plugins = JSON.parse(sh('zcode-cli plugins list --json'));
    refreshed = plugins.find((item) => item.id === `${PLUGIN}@${MARKET}`);
  } catch (error) {
    throw new Error(`无法核对 ZCode 插件列表：${error.message}`);
  }
  const expected = JSON.parse(fs.readFileSync(path.join(DELIVERY_ROOT, '.zcode-plugin', 'plugin.json'), 'utf8')).skills.length;
  if (!refreshed?.enabled) throw new Error('ZCode 插件未处于启用状态');
  if (refreshed.skillCount !== expected) throw new Error(`ZCode skill 数量不符：期望 ${expected}，实际 ${refreshed.skillCount ?? '(缺失)'}`);
  log(`  ✓ ZCode 已更新并启用；skill 数量 ${refreshed.skillCount}`);
}

// omp 走 marketplace 插件通道：omp plugin marketplace add 会 git clone 本仓，omp plugin install
// 登记进 ~/.omp/plugins/installed_plugins.json 并把 node_modules/superextensions 软链到版本化缓存。
// 不能用 omp install <git-url>：那是 npm git 依赖通道，omp 对它只扫 skills/ 一级目录，
// 嵌套分类 skill 全部丢失，会话里只剩 constitution。
function installOmp() {
  log('\n=== OMP (Oh My Pi) ===');
  if (!has('omp')) { log('  跳过：未找到 omp CLI'); return; }
  const ompPlugins = path.join(HOME, '.omp', 'plugins');
  // 旧 npm git 依赖通道的残留：package.json dependencies 里有本插件就先卸掉，避免两条通道并存
  let legacyInstalled = false;
  const pkgPath = path.join(ompPlugins, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      legacyInstalled = Boolean(pkg.dependencies?.[PLUGIN]);
    } catch {}
  }
  if (legacyInstalled) {
    shLoud(`omp plugin uninstall ${PLUGIN}`);
  }
  // 已在 marketplace 通道：刷新 marketplace 缓存后升级；未装：添加 marketplace 再安装
  let registered = false;
  const installedReg = path.join(ompPlugins, 'installed_plugins.json');
  if (fs.existsSync(installedReg)) {
    try {
      const reg = JSON.parse(fs.readFileSync(installedReg, 'utf8'));
      registered = Boolean(reg.plugins?.[`${PLUGIN}@${MARKET}`]);
    } catch {}
  }
  if (registered) {
    shLoud(`omp plugin marketplace update ${MARKET}`);
    shLoud(`omp plugin upgrade ${PLUGIN}@${MARKET}`);
  } else {
    tryQuiet(`omp plugin marketplace remove ${MARKET}`);           // 幂等：先清旧的
    shLoud(`omp plugin marketplace add ${REPO}`);
    shLoud(`omp plugin install ${PLUGIN}@${MARKET}`);
  }
  const skillsDir = path.join(ompPlugins, 'node_modules', PLUGIN, 'skills');
  if (!fs.existsSync(path.join(skillsDir, 'constitution', 'SKILL.md'))) {
    throw new Error('OMP 插件目录不完整：没找到 skills/constitution/SKILL.md');
  }
  log('  ✓ OMP 已更新；marketplace 通道登记，.pi/extensions 原生注入 constitution，skills 走 .claude-plugin 清单全量注册');
}

// ---------- 卸载 ----------
function uninstallSelected(targets) {
  log('\n=== 卸载 ===');
  if (targets.cc && has('claude')) {
    tryQuiet(`claude plugin uninstall ${PLUGIN}@${MARKET}`);
    tryQuiet(`claude plugin marketplace remove ${MARKET}`);
    rmDir(path.join(HOME, '.claude', 'plugins', 'cache', MARKET),
          path.join(HOME, '.claude', 'plugins', 'marketplaces', MARKET));   // uninstall/remove 不清实际文件，手动删残留
    log('  Claude Code 已卸');
  }
  if (targets.codex && has('codex')) {
    tryQuiet(`codex plugin remove ${PLUGIN}@${MARKET}`);
    tryQuiet(`codex plugin marketplace remove ${MARKET}`);
    rmDir(path.join(HOME, '.codex', 'plugins', 'cache', MARKET),
          path.join(HOME, '.codex', '.tmp', 'marketplaces', MARKET));       // 同上
    log('  Codex 已卸');
  }
  if (targets.codex) {
    // Codex hooks.json 去掉 constitution 那条
    const hooksJson = path.join(HOME, '.codex', 'hooks.json');
    if (fs.existsSync(hooksJson)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(hooksJson, 'utf8'));
        if (cfg.hooks?.SessionStart) {
          cfg.hooks.SessionStart = cfg.hooks.SessionStart.filter(e => !JSON.stringify(e).includes('constitution'));
          fs.writeFileSync(hooksJson, JSON.stringify(cfg, null, 2));
        }
      } catch {}
    }
  }
  if (targets.opencode) {
    // opencode.json 去掉 Git 插件登记
    const ocJson = path.join(HOME, '.config', 'opencode', 'opencode.json');
    if (fs.existsSync(ocJson)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(ocJson, 'utf8'));
        if (Array.isArray(cfg.plugins)) {
          cfg.plugins = cfg.plugins.filter(p => p !== `git+${GIT_URL}`);
          fs.writeFileSync(ocJson, JSON.stringify(cfg, null, 2));
        }
        // 兼容旧版 V1 配置，避免升级后留下同一插件的旧登记。
        if (Array.isArray(cfg.plugin)) {
          cfg.plugin = cfg.plugin.filter(p => !(typeof p === 'string' && (p === `git+${GIT_URL}` || p.startsWith(`${PLUGIN}@git+`))));
          fs.writeFileSync(ocJson, JSON.stringify(cfg, null, 2));
        }
      } catch {}
    }
    log('  OpenCode 已从 opencode.json 移除');
  }
  if (targets.zcode && has('zcode-cli')) {
    tryQuiet(`zcode-cli plugins uninstall ${PLUGIN}@${MARKET} -s user`);
    tryQuiet(`zcode-cli plugins marketplace remove ${MARKET} --scope user`);
    log('  ZCode 已卸');
  }
  if (targets.omp && has('omp')) {
    tryQuiet(`omp plugin uninstall ${PLUGIN}@${MARKET}`);
    tryQuiet(`omp plugin marketplace remove ${MARKET}`);
    tryQuiet(`omp plugin uninstall ${PLUGIN}`);                    // 旧 npm git 依赖通道的卸法，幂等兜底
    rmDir(path.join(HOME, '.omp', 'plugins', 'node_modules', PLUGIN),   // uninstall 万一留残留，兜底删掉
          path.join(HOME, '.omp', 'plugins', 'cache', MARKET));
    log('  OMP 已卸');
  }
}

// ---------- main ----------
const args = process.argv.slice(2);
const all = !args.some(a => ['--cc', '--codex', '--opencode', '--omp', '--zcode'].includes(a));
const targets = {
  cc: all || args.includes('--cc'),
  codex: all || args.includes('--codex'),
  opencode: all || args.includes('--opencode'),
  omp: all || args.includes('--omp'),
  zcode: all || args.includes('--zcode'),
};
if (args.includes('--uninstall')) {
  uninstallSelected(targets);
  log('\n完成。');
  process.exit(0);
}
const failures = [];
const runInstaller = (label, install) => {
  try { install(); }
  catch (error) {
    failures.push(label);
    log(`  ${label} 出错：${error.message}`);
  }
};
log(`superextensions 跨 agent 安装器  (平台: ${os.platform()})`);
if (targets.cc) runInstaller('Claude Code', installCC);
if (targets.codex) runInstaller('Codex', installCodex);
if (targets.opencode) runInstaller('OpenCode', installOpencode);
if (targets.omp) runInstaller('OMP', installOmp);
if (targets.zcode) runInstaller('ZCode', installZcode);
if (failures.length) {
  log(`\n安装失败：${failures.join('、')}`);
  process.exitCode = 1;
} else {
  log('\n完成。Claude Code 使用精简 cache；Codex 保留原生完整 cache；OpenCode 使用原生 plugin 注册；OMP 走 marketplace 插件通道；ZCode 优先使用 zcode-cli，缺少该入口时走桌面插件市场。');
}
