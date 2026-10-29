/**
 * superextensions bootstrap plugin for OpenCode.
 *
 * The package keeps both entrypoints so OpenCode 1 and OpenCode 2 can load the
 * same published artifact. OpenCode 1 calls `server()`; OpenCode 2 calls
 * `setup(ctx)`.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, '..', '..');
const SKILL_MD = path.join(pluginRoot, 'skills', 'constitution', 'SKILL.md');
const skillsDir = path.join(pluginRoot, 'skills');

// 剥 frontmatter,只留正文
const stripFrontmatter = (content) => {
  const m = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return m ? m[1] : content;
};

const frontmatterField = (content, key) => {
  const m = content.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^(["'])(.*)\\1$/, '$2') : '';
};

const skillFiles = () => {
  if (!fs.existsSync(skillsDir)) return [];
  const result = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name === 'SKILL.md') result.push(fullPath);
    }
  };
  visit(skillsDir);
  return result.sort();
};

// 模块级缓存:SKILL.md 会话期不变,读一次即可
let _cache; // undefined=未读, null=文件缺失
const getBootstrap = () => {
  if (_cache !== undefined) return _cache;
  if (!fs.existsSync(SKILL_MD)) { _cache = null; return null; }
  const body = stripFrontmatter(fs.readFileSync(SKILL_MD, 'utf8'));
  _cache = `<EXTREMELY_IMPORTANT>\n以下是你的全局规则总纲 constitution,本对话全程必须遵守;其中每处「详见 modules/X」都是强制读取,不是可选参考。总纲正文已在下方给出,不必再用 skill 工具重复加载 constitution。\n\n${body}\n</EXTREMELY_IMPORTANT>`;
  return _cache;
};

// OpenCode 2:显式把嵌套 skills/ 下的每个 SKILL.md 注册进 skill 域。
const setup = async (ctx) => {
  await ctx.skill.transform((editor) => {
    for (const file of skillFiles()) {
      const content = fs.readFileSync(file, 'utf8');
      const id = frontmatterField(content, 'name');
      if (!id) continue;
      editor.add({
        id,
        name: id,
        description: frontmatterField(content, 'description'),
        path: file,
        content: stripFrontmatter(content),
      });
    }
  });
  await ctx.skill.reload();

  const injectBootstrap = (event) => {
    const bootstrap = getBootstrap();
    if (!bootstrap) return;
    event.system ??= [];
    if (event.system.some((part) => part.type === 'text' && part.text.includes('全局规则总纲 constitution'))) return;
    event.system.unshift({ type: 'text', text: bootstrap });
  };
  await ctx.session.hook('context', injectBootstrap);
  await ctx.session.hook('compaction', injectBootstrap);
  await ctx.session.hook('generate', injectBootstrap);
};

// OpenCode 1:保留旧版 config 与 messages.transform 接缝。
const server = async () => ({
  config: async (config) => {
    config.skills = config.skills || {};
    config.skills.paths = config.skills.paths || [];
    if (!config.skills.paths.includes(skillsDir)) config.skills.paths.push(skillsDir);
  },
  'experimental.chat.messages.transform': async (_input, output) => {
    const bootstrap = getBootstrap();
    if (!bootstrap || !output.messages.length) return;
    const firstUser = output.messages.find((m) => m.info.role === 'user');
    if (!firstUser || !firstUser.parts.length) return;
    if (firstUser.parts.some((p) => p.type === 'text' && p.text.includes('全局规则总纲 constitution'))) return;
    const ref = firstUser.parts[0];
    firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrap });
  },
});

export default {
  id: 'superextensions',
  setup,
  server,
};
