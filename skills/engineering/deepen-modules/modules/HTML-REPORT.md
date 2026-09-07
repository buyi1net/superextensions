# HTML 报告格式

架构审查的报告是一个自包含的 HTML 文件，放在项目的临时目录里。Tailwind 和 Mermaid 都走 CDN。图状关系用 Mermaid 画最稳；要编辑风的图（体量图、横截面）就手工搭 div 和内联 SVG。两种混着用，别什么都靠 Mermaid，会显得千篇一律。

## 脚手架

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>{{repo name}} 架构审查</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
    </script>
    <style>
      /* 自定义小层，补 Tailwind 盖不干净的东西：
         虚线接缝线、手绘感的箭头头部等 */
      .seam { stroke-dasharray: 4 4; }
      .leak { stroke: #dc2626; }
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <header>...</header>
      <section id="candidates" class="space-y-10">...</section>
      <section id="top-recommendation">...</section>
    </main>
  </body>
</html>
```

## 页头

仓库名、日期，加一个紧凑的图例：实线框 = 模块，虚线 = 接缝，红色箭头 = 泄漏，加粗深色框 = 深模块。不写介绍段落，直接进候选。

## 候选卡片

图示扛大头。文字少，写得平实，直接用 `codebase-design` skill 词汇表的术语，不搞花活。

每个候选是一个 `<article>`：

- **标题**：要短，点出深化动作（比如「收拢订单接入管线」）。
- **徽章行**：推荐强度（`Strong` 强烈推荐 = emerald 翡翠绿，`Worth exploring` 值得探索 = amber 琥珀色，`Speculative` 观望 = slate 石板灰），外加一个依赖类别标签（`in-process` 进程内、`local-substitutable` 本地可替换、`ports & adapters` 端口与适配器、`mock` 模拟）。
- **文件**：等宽字体列表，`font-mono text-sm`。
- **前后对比图**：整张卡的主角，左右两栏并排，画法见下文。
- **问题**：一句话说清哪里疼。
- **方案**：一句话说清改什么。
- **收益**：条目，每条不超过 10 个字。比如「测试只打一个接口」「定价逻辑不再泄漏」「删掉 4 个浅包装」。
- **ADR 标注**（如有）：琥珀色底框里的一行话。

不写解释性段落。一张图要靠一段话才看得懂，就重画这张图。

## 图示模式

按候选挑合适的模式。混着用。别让每张图长得一样，多样本身就是要求。

### Mermaid 图（依赖/调用流的主力）

想表达「X 调 Y 调 Z，看这一团糟」，就用 Mermaid 的 `flowchart` 或 `graph`。包在一个 Tailwind 样式的卡片里，免得显得像空投进来的。用 classDef 上色：泄漏边标红，深模块标深色。时序图适合画「前：6 次往返；后：1 次」这类对比。

```html
<div class="rounded-lg border border-slate-200 bg-white p-4">
  <pre class="mermaid">
    flowchart LR
      A[OrderHandler] --> B[OrderValidator]
      B --> C[OrderRepo]
      C -.leak.-> D[PricingClient]
      classDef leak stroke:#dc2626,stroke-width:2px;
      class C,D leak
  </pre>
</div>
```

### 手绘框线箭头（Mermaid 布局不听话时）

模块画成带边框和标签的 `<div>`。箭头用内联 SVG 的 `<line>` 或 `<path>`，绝对定位盖在一个相对定位容器上。「后」图想要一个粗边框深模块、内部细节灰掉的样子，就手画。这种分量感 Mermaid 做不出来。

### 横截面（适合层层皆浅）

堆叠水平条带（`h-12 border-l-4`）展示一次调用穿过的层。前：6 个薄层，每层啥也不干。后：1 条厚带，标上合并后的职责。

### 体量图（适合「接口跟实现一样宽」）

每个模块画两个矩形：一个代表接口表面积，一个代表实现。前：接口矩形跟实现矩形差不多高（浅）。后：接口矩形矮，实现矩形高（深）。

### 调用图坍缩

前：函数调用树画成嵌套盒子。后：同一棵树坍缩成一个盒子，收进盒子的调用画淡些。

## 样式指南

- 走编辑风，不走企业仪表盘风。留白要大方。标题可用衬线体（`font-serif` 配 stone/slate 色系效果好）。
- 用色克制：一个强调色（emerald 或 indigo），红色留给泄漏，琥珀色留给警告。
- 图保持 ~320px 高，让前后对比并排放得舒服，不用滚动。
- 图内模块标签用 `text-xs uppercase tracking-wider`，读起来是示意图，不是 UI。
- 脚本只有 Tailwind CDN 和 Mermaid 的 ESM 引入。报告其余部分是纯静态：没有应用代码，除 Mermaid 自身渲染外没有任何交互。

## 首推小节

一张更大的卡片。候选名、推荐理由一句话、指向该卡片的锚链接。就这样。

## 语气

大白话、简洁，但架构名词和动词一律来自 `codebase-design` skill。简洁不是术语漂移的借口。

**只用**：模块、接口、实现、深度、深、浅、接缝、适配器、杠杆效应、局部性。

**禁止替换**：组件、服务、单元（指模块时）；API、签名（指接口时）；边界（指接缝时）；层、包装（指模块时）。

**符合风格的措辞：**

- 「订单接入模块是浅的：接口几乎跟实现一样大。」
- 「定价逻辑从接缝处泄漏。」
- 「深化：一个接口，一处测试。」
- 「两个适配器撑得起接缝：生产用 HTTP，测试用内存实现。」

**收益条目**用词汇表术语把收益讲明白：*「局部性：bug 聚到一个模块里」*、*「杠杆效应：一个接口，N 个调用点」*、*「接口收窄；实现吞掉包装层」*。不写*「更好维护」*、*「代码更干净」*，这些词不在词汇表里，配不上位置。

不含糊、不铺垫、不写「值得注意的是……」。一句话能写成条目就写成条目；一条能删就删。一个术语不在 `codebase-design` 词汇表里，先找词汇表里有的词，实在没有再造新词。
