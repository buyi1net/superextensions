#!/usr/bin/env node
/**
 * superextensions 跨 agent 一键安装器（跨平台：Windows / macOS / Linux）
 *
 * 把 superextensions plugin（规则总纲 constitution + 配套 skill）装到 Claude Code / Codex / OpenCode / OMP。
 * Pi 不归这里管：Pi 有原生包机制，用 `pi install git:github.com/buyi1net/superextensions`（README「分家手动」）。
 * 各家的安装策略：
 *   - Claude Code：marketplace add --sparse，装时只拉自己的目录
 *   - Codex：plugin add 会二次完整 clone，不能 sparse（partial clone 缺 blob 会失败），
 *            必须保留原生完整缓存，不能在安装后删除仓库文件
 *   - OpenCode：先失效本插件的 Git 缓存，再调用原生 plugin 命令安装并注册
 *   - OMP：pi 同源 fork，原生读 package.json 的 pi 清单；已装走 bun update（git 依赖不走
 *          marketplace 升级），未装走 omp install
 *
 * 用法：
 *   node install.mjs                装四家
 *   node install.mjs --cc|--codex|--opencode|--omp   只装指定家（可组合）
 *   node install.mjs --uninstall    四家卸载（Pi 用 pi remove，不归这里）
 *   node install.mjs --codex --uninstall       只卸载 Codex（其它目标同理）
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = 'buyi1net/superextensions';
const GIT_URL = 'https://github.com/buyi1net/superextensions.git';
const MARKET = 'superextensions';
const PLUGIN = 'superextensions';
const HOME = os.homedir();
const isWin = os.platform() === 'win32';

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
  const spec = `${PLUGIN}@git+${GIT_URL}`;
  const removed = rmOpencodeCache();
  if (removed) log(`  ✓ 已失效 OpenCode 旧缓存包（${removed}）`);
  shLoud(`opencode plugin "${spec}" --global --force`);
  log('  ✓ OpenCode 已通过原生 plugin 命令安装并写入全局配置');
}

// 删 opencode 缓存包（整个 superextensions@git... 目录），让 opencode 下次运行从 github 重拉最新。
// 更新时必需：bun 缓存钉版本，不删旧包就一直用旧 commit。
function rmOpencodeCache() {
  const base = path.join(HOME, '.cache', 'opencode', 'packages');
  if (!fs.existsSync(base)) return null;
  const pkgs = fs.readdirSync(base).filter(d => d.startsWith(`${PLUGIN}@git`));
  if (!pkgs.length) return null;
  for (const p of pkgs) fs.rmSync(path.join(base, p), { recursive: true, force: true });
  return pkgs.join(', ');
}

// ---------- OMP (Oh My Pi) ----------
// omp 是 pi 的同源 fork，原生读 package.json 的 pi 清单和 .pi/extensions，无需 omp 专属适配。
// 插件以 bun git 依赖形式装在 ~/.omp/plugins：已装走 bun update 拉最新 commit（omp plugin
// upgrade 只认 name@marketplace，管不到 git 依赖），未装走 omp install 首次安装。
function installOmp() {
  log('\n=== OMP (Oh My Pi) ===');
  if (!has('omp')) { log('  跳过：未找到 omp CLI'); return; }
  const ompPlugins = path.join(HOME, '.omp', 'plugins');
  let installed = false;
  const pkgPath = path.join(ompPlugins, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      installed = Boolean(pkg.dependencies?.[PLUGIN]);
    } catch {}
  }
  if (installed) {
    shLoud(`bun update ${PLUGIN}`, { cwd: ompPlugins });
  } else {
    shLoud(`omp install ${GIT_URL}`);
  }
  const skillsDir = path.join(ompPlugins, 'node_modules', PLUGIN, 'skills');
  if (!fs.existsSync(path.join(skillsDir, 'constitution', 'SKILL.md'))) {
    throw new Error('OMP 插件目录不完整：没找到 skills/constitution/SKILL.md');
  }
  log('  ✓ OMP 已更新；omp 是 pi 同源 fork，.pi/extensions 原生注入 constitution，skills 由 pi 清单注册');
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
    // opencode.json 去掉 spec
    const ocJson = path.join(HOME, '.config', 'opencode', 'opencode.json');
    if (fs.existsSync(ocJson)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(ocJson, 'utf8'));
        if (Array.isArray(cfg.plugin)) {
          cfg.plugin = cfg.plugin.filter(p => !(typeof p === 'string' && p.startsWith(`${PLUGIN}@git+`)));
          fs.writeFileSync(ocJson, JSON.stringify(cfg, null, 2));
        }
      } catch {}
    }
    log('  OpenCode 已从 opencode.json 移除');
  }
  if (targets.omp && has('omp')) {
    tryQuiet(`omp plugin uninstall ${PLUGIN}`);
    rmDir(path.join(HOME, '.omp', 'plugins', 'node_modules', PLUGIN));   // uninstall 万一留残留，兜底删掉
    log('  OMP 已卸');
  }
}

// ---------- main ----------
const args = process.argv.slice(2);
const all = !args.some(a => ['--cc', '--codex', '--opencode', '--omp'].includes(a));
const targets = {
  cc: all || args.includes('--cc'),
  codex: all || args.includes('--codex'),
  opencode: all || args.includes('--opencode'),
  omp: all || args.includes('--omp'),
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
if (failures.length) {
  log(`\n安装失败：${failures.join('、')}`);
  process.exitCode = 1;
} else {
  log('\n完成。Claude Code 使用精简 cache；Codex 保留原生完整 cache；OpenCode 使用原生 plugin 注册；OMP 以 bun git 依赖维护。');
}
