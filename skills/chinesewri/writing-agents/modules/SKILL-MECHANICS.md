# Skill 机制

主 `SKILL.md` 讲了怎么写给 AI 看的文档.这份文档补充说明写 Skill 的机制差异,包括 frontmatter,元数据,调用方式,拆分与路由.

## 目录与文件构成

新建或重构正式 skill 时,目录里必须有这三样东西:

- **独立目录**:以 skill 名称命名,放于对应分类目录下.
- **SKILL.md**:包含 frontmatter 元数据,其中 `name` 字段必须与目录名完全一致.
- **agents/openai.yaml**:Codex 界面元数据,字段写法见下一节.

## openai.yaml

`agents/openai.yaml` 是 Codex 定义的 skill 界面元数据,不少仿照 Codex 桌面版的 Agent 和插件市场也沿用它,用来展示名称,简介和图标.字段以 [Codex 官方文档](https://developers.openai.com/codex/skills) 为准,只写文档里有的字段,字符串一律加双引号.

```yaml
interface:
  display_name: "给Agent写文档"                 # 必填:中文显示名
  short_description: "给AI读文档的写作标准:指针精确,层级清晰,完成标准明确"  # 必填:一句话简介,建议 25 到 64 个字符
  icon_small: "./assets/icon-small.svg"          # 可选:小图标
  icon_large: "./assets/icon.png"                # 可选:大图标
  brand_color: "#3B82F6"                         # 可选:品牌色
  default_prompt: "按给 Agent 写文档的标准审一遍这份 skill"  # 可选:点选 skill 时预填的提示词
```

- **图标**:有图标素材就配上,没有就不写这两个字段.路径相对 skill 目录,素材放在 skill 目录下的 `assets/`.官方范例里小图标用 SVG,大图标用 PNG,照这个格式准备.写了路径,就要把对应文件一起放进去,路径指向不存在的文件,界面就拿不到图标.
- **`default_prompt`**:写成用户点选这个 skill 后最常发的那句话,不重复 `short_description`.
- **调用策略**:`policy.allow_implicit_invocation: false` 是 Codex 端关掉模型调用的开关,和 `disable-model-invocation: true` 是一个意思.选用户调用的 skill 两处都写上,判定见「调用方式」.

## 调用方式

skill 的调用方式有两种:模型调用和用户调用.区别在于谁能触发该 skill 以及代价如何支付.

**模型调用**:不写 `disable-model-invocation` 字段;`description` 面向模型编写,写明全部触发条件;指针写作规则全部适用.模型调用包含用户调用,用了模型调用,用户照样可以按名字手动调用.宿主平台若支持 `description` 自动发现,Agent 可自主识别;但在用总纲统一路由触发的插件体系里,自动发现能力在各端实现不一,主要依靠总纲场景路由来可靠触发.

**用户调用**:写 `disable-model-invocation: true` 字段;`description` 仅保留一行摘要供人阅读,触发条件全部删除.Agent 不会自动触发,必须由用户通过命令按名称手动调用.各宿主是否支持该字段以及上下文如何处理因平台而异,不可预设所有客户端行为完全一致.代价是用户必须记住该 skill 并在需要时手动触发,收益是支持这个字段的宿主不会把它的 description 放进常驻上下文.

判定条件:满足以下任一条件,选模型调用;都不满足,选用户调用:

1. Agent 必须能自主触发该 skill.
2. 其它 skill 需要跨 skill 调用该 skill.

## description 写法

模型调用的 skill 靠 `description` 决定加不加载,它就是这个 skill 的上下文指针,通则见主文件「上下文指针」.按下面三层写:

1. **开头一句写总触发条件.** 用一句话圈定这个 skill 管的任务,比如「只要任务涉及 .pptx 或 .potx 幻灯片文件(无论作为输入,输出还是中间处理环节),都必须使用本 skill」.
2. **列触发场景.** 写用户会说的词,会给的文件类型,会要求的动作.用户原话里的叫法中英文都列上(「PPT」「幻灯片」「deck」),用户随口一提时模型才对得上.容易漏触发的场景单独点名,比如「即使提取出的内容后续要用于写邮件或做摘要」.
3. **写排除边界.** 有相邻 skill 或相近任务容易误触发时,明写哪些情况不触发,并指出该去哪.比如 xlsx 写了「若主要交付目标是 Word 文档,HTML 网页报告...即便过程中涉及二维表格数据,也不要触发本 skill」.没有误触发风险的,这层不写.

范本参考 office 下的四个 skill:[docx](../../../office/docx/SKILL.md),[pdf](../../../office/pdf/SKILL.md),[pptx](../../../office/pptx/SKILL.md),[xlsx](../../../office/xlsx/SKILL.md).

长度有硬上限:pi 的 `description` 最多 1024 个字符,Claude Code 的技能列表只展示前 1536 个字符,超出部分会被截断.写在 1024 字符以内,最关键的触发条件放最前面.

用户调用的 skill 不走这三层,`description` 只留一行摘要,见「调用方式」.

## argument-hint

用户按名字调用 skill 时要带参数的,在 frontmatter 里加 `argument-hint`,用户在命令补全时就能看到该传什么.必填参数用尖括号,可选参数用方括号,值加双引号:

```yaml
argument-hint: "<issue-url>"     # 必填
argument-hint: "[instructions]"  # 可选
```

不带参数的 skill 不写这个字段.

各端支持不一致:Claude Code 的 skill 和 pi 的提示词模板认这个字段;pi 的 skill 文档没有列出它;上传 claude.ai 或走 Skills API 时,遇到这个字段会直接报错.要走这两条路分发的 skill,不得写 `argument-hint`,参数说明改写进正文.

正文里用自然语言引用参数,比如「用户调用时附带的 issue 链接」,不依赖 `$ARGUMENTS` 这类占位符.pi 只把参数追加到 skill 正文后面,不做替换,占位符会原样留在正文里;Claude Code 在正文没有占位符时也会把参数追加在末尾,所以自然语言的写法两边都能用.

## 按调用方式拆

拆分有两个维度,调用维度是其一(流程维度见主文件的「按流程拆」).满足以下任一条件,拆出一个模型调用 skill:

1. 有一个独特的引导词,希望它单独就能触发(且必须是提示词里真会用的词).
2. 别的 skill 需要调用它.

拆分的代价是新 `description` 会增加常驻开销,所以这份独立触达必须值得.如果分支仅在内部使用,通过内部引用解决,避免无收益的碎片化.

## 路由 skill

用户调用 skill 较多时,可用路由 skill 汇集索引:在一个 skill 中把其它工具及各自使用时机列出来.用户导航入口只能提示使用时机,不能充当自动路由机制.
