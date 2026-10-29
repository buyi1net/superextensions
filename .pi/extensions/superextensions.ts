/**
 * superextensions 的 Pi 扩展。
 *
 * skills/ 由 package.json 的 pi.skills 清单注册。扩展在每次用户提交提示后、
 * Agent 运行前把 constitution 追加到当前轮次的系统提示中。这样同一会话的
 * 后续轮次和压缩后的轮次都会重新注入，不依赖跨轮次状态。
 *
 * 通过 import.meta 相对定位 SKILL.md，不写死绝对路径，换机后仍随包生效。
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EXTREMELY_IMPORTANT_MARKER = "<EXTREMELY_IMPORTANT>";
const BOOTSTRAP_MARKER = "superextensions:constitution bootstrap for pi";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(extensionDir, "../..");
const skillsDir = resolve(packageRoot, "skills");
const constitutionSkillPath = resolve(skillsDir, "constitution", "SKILL.md");

let cachedBootstrap: string | null | undefined;

export default function superextensionsPiExtension(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		const bootstrap = getBootstrapContent();
		if (!bootstrap) return;
		if (event.systemPrompt.includes(BOOTSTRAP_MARKER)) return;

		return {
			systemPrompt: `${event.systemPrompt}\n\n${bootstrap}`,
		};
	});
}

function getBootstrapContent(): string | null {
	if (cachedBootstrap !== undefined) return cachedBootstrap;

	try {
		const skillContent = readFileSync(constitutionSkillPath, "utf8");
		const body = stripFrontmatter(skillContent);
		cachedBootstrap = `${EXTREMELY_IMPORTANT_MARKER}
${BOOTSTRAP_MARKER}

以下是你的全局规则总纲 constitution,本对话全程必须遵守;其中每处「详见 modules/X」都是强制读取,不是可选参考。总纲正文已在下方给出,不必再重复加载 constitution。

${body}

</EXTREMELY_IMPORTANT>`;
		return cachedBootstrap;
	} catch {
		cachedBootstrap = null;
		return null;
	}
}

function stripFrontmatter(content: string): string {
	const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
	return (match ? match[1] : content).trim();
}
