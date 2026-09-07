---
name: express-translate
description: 中英互译与软件汉化的语言标准：术语统一、力度保真、占位符保留。写作和对话不走本 skill。
---

只管语言转换：英译中、中译英、软件汉化；写作走 `express-writing`（给人）或 `express-agents`（给 Agent）。

## 翻译外文 skill

产物是给 Agent 读的文档，先加载 `express-agents` 再动笔，顺序决定返工次数：

1. 加载 `express-agents`，按它定目标形态：结构、层级、完成标准、指针，直接对着目标写，不走「先保真翻译、再重构」的两段路；
2. 落笔按中文骨架组织语言，手法见下方「骨架重组」；
3. 按 `express-agents` 的标准删改原文结构（去重、合并清单、砍否定式）超出翻译范畴，属于重构：先向用户说明要改什么，点头后再动。

## 英译中

像母语者转述，不是逐词搬运：先读完原文，想清楚一个中文母语者会怎么讲这件事，再落笔。

**范文**

原文：

> Tests should verify behavior through the public interface, not implementation details. Code can be rewritten from scratch, but tests shouldn't have to change with it. A good test reads like a specification: "a user with the correct password can log in." It tells you what the system does, and it keeps passing after a refactor, because it never cared how the system did it.

译文：

> 测试应该通过公开接口验证行为，而不是去测内部实现。代码可以推倒重来，测试不该跟着改。好测试读起来像一份规格说明：「用户输入正确密码就能登录」。这句话直接告诉你系统能做什么，而且重构后照样跑得通，因为它根本不关心内部怎么实现。

**骨架重组**

词换对了骨架还可能是英文的，按四条过：

- 主语用全称重复：中文不靠代词回指，「提示用户……引导用户」比「提示他……引导他」清晰；
- 动宾补全：疑问代词后带名词，写「点什么地方、复制什么信息」，不写「点什么、复制什么」；
- 抽象名词落地：state、transition 这类词直译就悬空，配具体场景，如「整体切换（换服务商、换数据库）」；
- 意义先行：介绍段先立主语的意义再展开能力，「X 的意义是……」比「它可能用来……」自然。

**骨架对照**

原文：It opens each URL, says exactly what to click and copy, and captures the values.

不合格（词对词）：它替人打开每个 URL，提示点哪里、复制什么，再捕获值。

合格（骨架重组后）：向导的意义是可以替用户打开各种 URL，并提示用户应该点什么地方、复制什么信息，再引导用户把信息写到对应位置。

## 中译英

补齐中文省略的主语；中文靠语序暗示的逻辑（因果、条件、让步）写成明确的连接词（because / so / although）；时态和单复数按上下文定；文化词（「关系」「面子」）意译，不硬译。

**范文**

原文：

> 这个接口设计得太复杂了：调用方要传七个参数，其中三个还是可选的。我建议把配置收拢成一个对象，必填的留在参数里，可选的放进配置。

译文：

> This API is overdesigned: callers have to pass seven parameters, three of them optional. I suggest collapsing the configuration into a single object, with required values as parameters and optional ones in the config.

## 全程生效的硬规则

- **术语统一**：同一概念全文一个译法，首次出现且可能歧义时标「中文（English）」。稳定译法查 [terms.md](./modules/terms.md)，表里没有的按语境定。
- **受保护内容原样保留**：代码、命令、路径、API 名、占位符、报错原文、版本号、commit hash、产品名，不翻译。
- **力度保真**：推测、建议、承诺、拒绝，译出去力度一致，不升级不降级。

| 中文原意 | 正确方向 | 错误方向 |
|---|---|---|
| 我怀疑是X，还没确认 | I suspect this is related to X, but I haven't confirmed it | This is caused by X |
| 建议考虑A | You might consider A | You must use A |
| 我准备修 | I plan to fix this | This will be fixed by Friday |
| 可能暂时不做 | We may deprioritize this for now | We will never fix this |

## 软件汉化

1. 按钮和标签：译文宽度不超过原文，通常 3-8 个字，动词优先（「保存」而不是「进行保存」）。
2. 术语固定：同一操作（如 `Save`）全软件一个词，不轮换同义词。
3. 动作一致：同一操作在按钮、菜单、提示里的动词保持一致。
4. 占位符：`%s`、`%d`、`{count}`、`{{name}}` 必须保留并核对数量，不改变占位符之间的相对顺序。
5. 人称统一：全软件统一用「你」或「您」。
6. 变量位置可调：`{{count}} items deleted` 译成「已删除 {{count}} 项」，位置可动名称不改。
7. 快捷键原样：`Ctrl+S` 等标记不翻译。

**示例**：

| 原文 | 译文 |
|---|---|
| Save changes | 保存更改 |
| Are you sure you want to delete this item? | 确认删除此项？ |
| {{count}} items deleted | 已删除 {{count}} 项 |

## 译后自查

- 占位符数量一致、相互顺序不变，句中位置按规则 6 可调；
- 术语全文一个译法；
- 力度保真表过一遍；
- 骨架重组四条过一遍：代词悬空、动宾不完整、抽象直译悬空、意义先行；
- 踩过坑的对译词（被用户纠正、多轮摇摆的）定稿后回填 [terms.md](./modules/terms.md)。

自查完用 skill 工具加载 `express-check` 做语言检测。顺的终审走冷读或人审：作者自评偏乐观，自己觉得顺的句子冷读者未必觉得顺；派不了子 Agent 冷读时，交稿请用户抽查语言。
