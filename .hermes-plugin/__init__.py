"""superextensions 的 Hermes Agent 插件入口。"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Mapping
from pathlib import Path
from typing import Any

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
SKILLS_DIR = PLUGIN_ROOT / "skills"
CONSTITUTION_NAME = "constitution"
SKILL_NAMESPACE = "superextensions"
BOOTSTRAP_MARKER_PREFIX = "superextensions:constitution bootstrap for hermes"
_FRONTMATTER_RE = re.compile(
    r"\A---\r?\n(?P<header>[\s\S]*?)\r?\n---(?:\r?\n|\Z)(?P<body>[\s\S]*)\Z"
)


def register(ctx: Any) -> None:
    skills = _discover_skills()
    bootstrap, marker = _build_bootstrap(skills)

    for name, skill_path, frontmatter, _body in skills:
        ctx.register_skill(
            name,
            skill_path,
            description=frontmatter.get("description", ""),
            frontmatter=frontmatter,
        )

    def pre_llm_call(
        user_message: Any = None,
        conversation_history: Any = None,
        **_kwargs: Any,
    ) -> dict[str, str] | None:
        if _contains_marker(user_message, marker) or _contains_marker(
            conversation_history, marker
        ):
            return None
        return {"context": bootstrap}

    ctx.register_hook("pre_llm_call", pre_llm_call)


def _discover_skills() -> list[tuple[str, Path, dict[str, str], str]]:
    if not SKILLS_DIR.is_dir():
        raise RuntimeError(f"superextensions plugin: 找不到 skill 目录：{SKILLS_DIR}")

    skills: list[tuple[str, Path, dict[str, str], str]] = []
    for skill_dir in sorted(SKILLS_DIR.iterdir(), key=lambda path: path.name):
        skill_path = skill_dir / "SKILL.md"
        if not skill_path.is_file():
            continue
        frontmatter, body = _split_frontmatter(skill_path.read_text(encoding="utf-8"))
        name = frontmatter.get("name", skill_dir.name)
        if name != skill_dir.name:
            raise RuntimeError(
                f"superextensions plugin: skill 名称与目录不一致：{skill_path} 声明 {name}"
            )
        skills.append((name, skill_path, frontmatter, body))

    if not any(name == CONSTITUTION_NAME for name, *_rest in skills):
        raise RuntimeError("superextensions plugin: 缺少 constitution/SKILL.md")
    return skills


def _split_frontmatter(content: str) -> tuple[dict[str, str], str]:
    match = _FRONTMATTER_RE.match(content)
    if not match:
        return {}, content.strip()

    frontmatter: dict[str, str] = {}
    for line in match.group("header").splitlines():
        key, separator, value = line.partition(":")
        if not separator:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        frontmatter[key.strip()] = value
    return frontmatter, match.group("body").strip()


def _build_bootstrap(
    skills: list[tuple[str, Path, dict[str, str], str]],
) -> tuple[str, str]:
    constitution = next(
        body for name, _path, _meta, body in skills if name == CONSTITUTION_NAME
    )
    catalog = "\n".join(
        f'- `{SKILL_NAMESPACE}:{name}`：{frontmatter.get("description", "未提供描述")}'
        for name, _path, frontmatter, _body in skills
    )
    digest_source = f"{constitution}\n\n{catalog}"
    digest = hashlib.sha256(digest_source.encode("utf-8")).hexdigest()[:12]
    marker = f"{BOOTSTRAP_MARKER_PREFIX}:{digest}"
    constitution_dir = SKILLS_DIR / CONSTITUTION_NAME

    bootstrap = f"""<EXTREMELY_IMPORTANT>
{marker}

以下是你的全局规则总纲 constitution，本对话全程必须遵守。其中每处“详见”“阅读”或“先读”都是强制读取，不是可选参考。总纲正文已经在下方给出，不要再用 `skill_view` 重复加载 constitution。

{constitution}

## Hermes 适配说明

Hermes 不会把插件 skill 自动列入系统提示。本插件已经注册以下 namespaced skill：

{catalog}

触发其它 skill 时，使用 `skill_view("{SKILL_NAMESPACE}:<skill-name>")` 完整加载。constitution 引用的相对文件以 `{constitution_dir}` 为基准，使用 `read_file` 完整读取。
</EXTREMELY_IMPORTANT>"""
    return bootstrap, marker


def _contains_marker(value: Any, marker: str) -> bool:
    if isinstance(value, str):
        return marker in value
    if isinstance(value, Mapping):
        return any(_contains_marker(item, marker) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_contains_marker(item, marker) for item in value)
    return False
