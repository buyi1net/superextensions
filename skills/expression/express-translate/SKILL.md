---
name: express-translate
description: 中英互译与软件汉化的语言标准：术语统一、力度保真、占位符保留。写作和对话不走本 skill。
---

只管语言转换：英译中、中译英、软件汉化；写作走 `express-writing`（给人）或 `express-agents`（给 Agent）。

## 翻译外文 skill

产物是给 Agent 读的文档，先加载 `express-agents` 再动笔，顺序决定返工次数：

1. 加载 `express-agents`，按它定目标形态：结构、层级、完成标准、指针，直接对着目标写，不走「先保真翻译、再重构」的两段路；
2. 落笔按中文骨架组织语言，手法见下方「骨架重组」；
3. 按 `express-agents` 的标准删改原文结构（去重、合并清单、砍否定式）超出翻译范畴，属于重构：先向用户说明要改什么，点头后再动；
4. 体系并轨：外文 skill 引用的机制逐个对到本仓库体系：词汇表文件（`CONTEXT.md` 对 `GLOSSARY.md`）、决策门槛（ADR 准入归 `domain-modeling`，不在译文里抄第二份）、skill 调用统一写「调用 `skill名`」。拿不准的先查本仓库对应 skill 怎么定的，以它为准。

## 英译中

像母语者转述，不是逐词搬运：先读完原文，想清楚一个中文母语者会怎么讲这件事，再落笔。

**文风**：译完读起来，要像一个中文母语工程师在跟同事讲怎么干活。句子舒展，长短跟着内容走，该连就连、该断就断；连接词用活的口语（「要是」「就」「立马」），不端「当……时」「对……进行」那种腔；动词平实但有画面，「翻一段提交历史」「总在提交里冒头」「该收留它们的深模块」；规则引用点到为止，判断给个方向就收，细则让归属的 skill 去讲。一句话检验：读着像中文原创，不像译稿。

**范文**（技术内容）

原文：

> Tests should verify behavior through the public interface, not implementation details. Code can be rewritten from scratch, but tests shouldn't have to change with it. A good test reads like a specification: "a user with the correct password can log in." It tells you what the system does, and it keeps passing after a refactor, because it never cared how the system did it.

译文：

> 测试应该通过公开接口验证行为，而不是去测内部实现。代码可以推倒重来，测试不该跟着改。好测试读起来像一份规格说明：「用户输入正确密码就能登录」。这句话直接告诉你系统能做什么，而且重构后照样跑得通，因为它根本不关心内部怎么实现。

**范文**（给 Agent 的指令文档，翻译外文 skill 的目标形态，同时做了体系并轨；节选）

原文：

> Once the user picks a candidate, call the Skill tool with "grilling" to walk the decision tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.
>
> Side effects happen inline as decisions crystallize; call the Skill tool with "domain-modeling" to keep the domain model current as you go:
>
> - Naming a deepened module after a concept not in `CONTEXT.md`? Add the term to `CONTEXT.md`. Create the file lazily if it doesn't exist.
> - Sharpening a fuzzy term during the conversation? Update `CONTEXT.md` right there.
> - User rejects the candidate with a load-bearing reason? Offer an ADR, framed as: "Want me to record this as an ADR so future architecture reviews don't re-suggest it?" Only offer when the reason would actually be needed by a future explorer; skip ephemeral reasons ("not worth it right now") and self-evident ones.

译文：

> 一旦用户选定某个候选方案，就调用 `grilling`，陪用户走一遍决策树：理清约束条件、依赖关系、深化后模块长什么样、接缝后面藏着什么、哪些测试还能跑通。决策过程中冒出的事项，当场就落进文件；调用 `domain-modeling`，随时让领域模型跟得上最新进展：
>
> - 深化后的模块用了 `GLOSSARY.md` 里没有的概念来命名？把这个概念补进去。文件要是还没建，就按 `domain-modeling` 的约定建一个。
> - 聊着聊着把某个模糊的说法给敲定了？立马更新 `GLOSSARY.md`。
> - 用户因为某个硬理由把这个方案否了？主动问一句要不要记成 ADR，可以这么说：「要我把这条记下来吗？以后做架构评审时，省得别人再提一遍。」但这个理由得是真的值得后人知道，才记；临时性的（比如「现在顾不上」）或不说也明白的，就算了。

**骨架重组**

词换对了骨架还可能是英文的，逐条过：

- 主语用全称重复：中文不靠代词回指，「提示用户……引导用户」比「提示他……引导他」清晰；
- 动宾补全：疑问代词后带名词，写「点什么地方、复制什么信息」，不写「点什么、复制什么」；
- 抽象名词落地：state、transition 这类词直译就悬空，配具体场景，如「整体切换（换服务商、换数据库）」；
- 意义先行：介绍段先立主语的意义再展开能力，「X 的意义是……」比「它可能用来……」自然；
- 长句拆短：原文一句带着从句和插入语，译文拆成流水短句，一句一个重点；前置定语两层「的」到头，再多就拆句或改成话题句（「这份文件管的是部署行为」）；
- 名词化还原成动词：the implementation of X、对 Y 的使用这类名词串，写回动词句「怎么实现 X」「用 Y 做什么」，不写「X 的实现」「对 Y 的使用」；
- 连接词看语序：because、when、if 的逻辑中文常靠语序暗示，能省就省，「当…时」缩成「…时」，语序救不回来才上「因为、如果」；
- 泛指不带量词：a、the 不逐个译，泛指直接说名词，「点击一个按钮」写「点击按钮」；
- 压缩留全称：压完读者能从字面推出完整意思才算数；「有地方归」推不回「背后有个该收留它们的深模块」，就是压过了头；
- 禁电报体：名词短语各自成句（「主角。两栏并排。模式见下文。」）收成完整句「整张卡的主角，左右两栏并排，画法见下文」；
- 判定句摊开逻辑链：结论带上依据和后果；「答『能收拢』才是你要的信号」只有结论，摊成「能收拢，说明……，值得记进候选」；
- 动词别用力过猛：舒展的口语优先于精雕的字，「这活就白干了」好过「白忙」、「那步就省了」好过「推断跳过」；俏皮词一多，读着像表演。

**骨架对照**

原文：It opens each URL, says exactly what to click and copy, and captures the values.

不合格（词对词）：它替人打开每个 URL，提示点哪里、复制什么，再捕获值。

合格（骨架重组后）：向导的意义是可以替用户打开各种 URL，并提示用户应该点什么地方、复制什么信息，再引导用户把信息写到对应位置。

原文：If you encounter an error while the system is processing your request, you should check the log file that was created when the application started.

不合格（从句一句到底）：如果你在系统正在处理你的请求时遇到一个错误，你应该检查那个在应用启动时被创建的日志文件。

合格（拆句）：系统处理请求时出错，就查日志文件；这份文件在应用启动时生成。

原文：Apply the deletion test to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

不合格（结论裸奔+压缩过头）：对疑似浅的模块做删除测试：删掉它，复杂度能收拢到一处，还是只是挪个位置？答「能收拢」才是你要的信号。

合格（逻辑链摊开）：凡是看着像浅模块的，都拿删除测试验一验：假想删掉它，复杂度是能收拢到一处，还是只是挪个地方？能收拢，说明这些复杂度背后有个该收留它们的深模块，并进去就是一次真正的深化，值得记进候选；只是挪地方的话，复杂度换个地方继续散着，这活就白干了。

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
- 骨架重组逐条过一遍：代词、动宾、抽象词、意义先行、长句、名词化、连接词、量词、压缩、电报体、逻辑链、动词力度；
- 踩过坑的对译词（被用户纠正、多轮摇摆的）定稿后回填 [terms.md](./modules/terms.md)。

自查完用 skill 工具加载 `express-check` 做语言检测和冷读终审。
