# SuperExtensions

SuperExtensions 是一款面向 Claude Code、Codex、OpenCode、Pi、OMP (Oh My Pi)、Hermes Agent 的治理规范，属于每个 Agent 必不可缺的一环，推荐所有人安装该插件包。

## 工具列表

全局规则：

| Skill | 用途 |
|---|---|
| [`constitution`](./skills/constitution/SKILL.md) | 全局规则总纲，定义语言、沟通和工作纪律等基础约束。 |

工程流（engineering）：

| Skill | 用途 |
|---|---|
| [`grilling`](./skills/engineering/grilling/SKILL.md) | 在开放式需求中逐层确认决策点和边界。 |
| [`code-review`](./skills/engineering/code-review/SKILL.md) | 按规范和规格两个维度评审代码变更。 |
| [`codebase-design`](./skills/engineering/codebase-design/SKILL.md) | 设计深度模块的共享词汇，用于模块接口、深化机会和接缝布局。 |
| [`deepen-modules`](./skills/engineering/deepen-modules/SKILL.md) | 扫描代码库找深化机会，用可视化报告摆出候选再深挖。 |
| [`diagnosing-bugs`](./skills/engineering/diagnosing-bugs/SKILL.md) | 疑难 bug 和性能回归的诊断循环。 |
| [`domain-modeling`](./skills/engineering/domain-modeling/SKILL.md) | 构建和完善项目领域模型，维护 GLOSSARY 与 ADR。 |
| [`implement`](./skills/engineering/implement/SKILL.md) | 按规格说明、工单或直接任务实现代码。 |
| [`prototype`](./skills/engineering/prototype/SKILL.md) | 用一次性原型回答设计问题：验证状态模型或对比界面方案。 |
| [`tdd`](./skills/engineering/tdd/SKILL.md) | 测试驱动开发循环与测试规范。 |
| [`to-spec`](./skills/engineering/to-spec/SKILL.md) | 把当前对话的讨论与决策整理成规格说明并发布到项目跟踪。 |
| [`to-tickets`](./skills/engineering/to-tickets/SKILL.md) | 把计划、规格说明或对话拆成追踪弹式工单。 |
| [`vm-gui-verify`](./skills/engineering/vm-gui-verify/SKILL.md) | 远程验证 Windows VM 的真实桌面，覆盖连接、截图、点击、键入与环境重建。 |
| [`wizard`](./skills/engineering/wizard/SKILL.md) | 生成 bash 向导脚本，一步步带用户做完只有人类才能完成的操作流程。 |

表达（expression）：

| Skill | 用途 |
|---|---|
| [`express-agents`](./skills/expression/express-agents/SKILL.md) | 给 AI 写文档的指南，创建或修改 skill、AGENTS.md 时使用。 |
| [`express-check`](./skills/expression/express-check/SKILL.md) | 中文成稿交稿前的检测站：自查改稿，新写和大改的稿件交稿前过子代理冷读终审。 |
| [`express-translate`](./skills/expression/express-translate/SKILL.md) | 中英互译与软件汉化的语言标准：术语统一、力度保真、占位符保留。 |
| [`express-writing`](./skills/expression/express-writing/SKILL.md) | 给人写文档的写前标准：范文对齐、无歧义、一段一事。 |

通用（productivity）：

| Skill | 用途 |
|---|---|
| [`handoff`](./skills/productivity/handoff/SKILL.md) | 在切换 Agent 或主动交接时生成可继续执行的工作快照。 |
| [`management`](./skills/productivity/management/SKILL.md) | 项目管理制度，涉及文件或目录操作前的强制入口。 |
| [`teach`](./skills/productivity/teach/SKILL.md) | 多会话有状态的私人教学系统，任务、课程、学习记录、参考文档一整套。 |
| [`wait-what`](./skills/productivity/wait-what/SKILL.md) | 用户没听懂时，按受控中文技术写作标准换种方式重讲。 |

## 前置条件

- 已安装目标 Agent。
- OpenCode 需支持 `opencode plugin` 命令；运行更新脚本时还需要 Node.js。
- Windows 上的 Claude Code 需要 Bash 执行会话 hook，标准安装的 Git for Windows 已包含所需环境。

## Claude Code

通过 Marketplace 插件安装。Claude Code 原生发现 skill，并在会话启动、恢复、清空、压缩、分叉及子 Agent 启动时注入本插件。

```bash
# 安装
claude plugin marketplace add buyi1net/superextensions
claude plugin install superextensions@superextensions

# 验证
claude plugin list

# 启用
claude plugin enable superextensions@superextensions

# 禁用
claude plugin disable superextensions@superextensions

# 更新
claude plugin marketplace update superextensions
claude plugin update superextensions@superextensions

# 卸载
claude plugin uninstall superextensions@superextensions
claude plugin marketplace remove superextensions
```

## Codex

通过 Codex 内置的 Marketplace 和插件命令安装。Codex 原生发现并按需加载 skill，不使用 SessionStart hook。

```bash
# 安装
codex plugin marketplace add buyi1net/superextensions
codex plugin add superextensions@superextensions

# 验证
codex plugin list

# 更新
codex plugin marketplace upgrade superextensions
codex plugin remove superextensions@superextensions
codex plugin add superextensions@superextensions

# 卸载
codex plugin remove superextensions@superextensions
codex plugin marketplace remove superextensions
```

## OpenCode

通过 OpenCode 原生插件命令安装。插件使用正式服务端入口注册 `skills.paths`，并向会话的第一条用户消息注入本插件。

```bash
# 安装
opencode plugin "superextensions@git+https://github.com/buyi1net/superextensions.git" --global

# 验证
opencode debug skill

# 更新，在 superextensions 仓库目录执行
node scripts/install.mjs --opencode

# 卸载
# 从 ~/.config/opencode/opencode.json 或 opencode.jsonc 的 plugin 数组中删除：
# superextensions@git+https://github.com/buyi1net/superextensions.git
```

OpenCode 尚无插件更新和卸载命令。更新脚本会失效本插件的 Git 缓存后重新调用原生安装命令；安装、更新或卸载后重新启动 OpenCode，验证输出中应包含本仓提供的 skill。

## Pi Agent

通过 Pi 原生 Git 包机制安装。Pi 从包清单加载扩展和 skill，并在每次用户提交提示时注入本插件。

```bash
# 安装
pi install git:github.com/buyi1net/superextensions

# 验证
pi list

# 启用或禁用包内资源
pi config

# 更新
pi update git:github.com/buyi1net/superextensions

# 卸载
pi remove git:github.com/buyi1net/superextensions
```

安装或更新后重启 Pi，或在已打开的 Pi 中执行 `/reload`。`pi list` 应显示该包，`pi config` 中的扩展和 skill 应处于启用状态。

## OMP (Oh My Pi)

OMP 是 pi-coding-agent 的同源二次开发版，原生读取本仓 `package.json` 的 `pi` 清单与 `.pi/extensions/`，每次用户提交提示时注入 constitution，不需要 OMP 专属适配文件。

```bash
# 安装
omp install https://github.com/buyi1net/superextensions

# 验证
omp plugin list

# 更新（插件以 Git 依赖安装在 ~/.omp/plugins，不走 marketplace 升级命令）
cd ~/.omp/plugins && bun update superextensions

# 卸载
omp plugin uninstall superextensions
```

安装或更新后重启 OMP。会话的 skill 列表应包含本仓 skill，系统提示末尾应出现 constitution 注入块。

## Hermes Agent

通过 Hermes 原生插件命令安装。Hermes 从公开仓的 `.hermes-plugin/` 发现插件；插件把全部 skill 注册为 `superextensions:<skill-name>`，并通过 `pre_llm_call` 向会话注入 constitution。压缩后的历史不再包含注入标记时会自动补回。

```bash
# 安装并启用
hermes plugins install buyi1net/superextensions --enable

# 验证
hermes plugins show superextensions
hermes plugins doctor superextensions

# 禁用或重新启用
hermes plugins disable superextensions
hermes plugins enable superextensions

# 更新
hermes plugins update superextensions

# 卸载
hermes plugins remove superextensions
```

安装、更新、启用或禁用后，重启正在运行的 Hermes CLI、Gateway 或 Desktop 会话。插件 skill 不进入 Hermes 的扁平 skill 索引，需要通过 `skill_view("superextensions:grilling")` 等 namespaced 名称加载。

Hermes v0.20.2 扫描完整仓库时，可能把 `.claude-plugin/plugin.json` 和 `.codex-plugin/plugin.json` 当作 portable manifest 探测并打印两条 schema 警告；只要 `hermes plugins show superextensions` 显示插件已启用，这两条警告不影响 `.hermes-plugin` 的加载。

## 许可证

本项目使用 [MIT License](./LICENSE)。
