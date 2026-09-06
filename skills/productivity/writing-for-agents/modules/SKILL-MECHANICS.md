# Skill 机制

主 `SKILL.md` 讲了怎么写给 AI 看的文档。这份文档接着说写 Skill 的部分，也就是说当你写的文档是 skill 时，有哪些不一样的地方，比如frontmatter、调用方式、路由 skill。其它的都按主 `SKILL.md` 的通用规范来。

## 调用方式

skill 的调用方式有两种：模型调用和用户调用。区别有两点：谁可以触发这个 skill；代价以哪种形式支付。

**模型调用**：不写 `disable-model-invocation` 字段；`description` 面向模型编写，写明全部触发条件；SKILL.md 的指针写作规则全部适用。agent 可以自主触发；其它 skill 可以调用它；用户仍然可以按 skill 名称手动调用它。模型调用包含用户调用，`description`字段只是增加 agent 的发现路径，并不会取消用户的手动调用权限。而对应的代价就是 `description` 常驻 agent 上下文窗口，每一轮对话都保持加载，但是换来的效果是 agent 能自动发现并触发这个 skill。

**用户调用**：写 `disable-model-invocation: true` 字段；`description` 仅面向用户编写，所以只需要保留一行摘要，触发条件可以全部删除，这样做的好处是只有用户按照skill名称来调用，agent不能自动触发，代价就是用户必须记住这个skill的存在，并在需要时手动调用。

所以，满足以下任一条件，选模型调用：

 1. agent 必须能自主触发这个 skill；
 2. 其它 skill 必须能调用这个 skill。

 两个条件都不满足，说明这个 skill 只靠手动触发。把它设为用户调用，不承担上下文开销。
