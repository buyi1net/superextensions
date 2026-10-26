---
name: docx
description: "只要用户需要创建、读取、编辑或处理 Word 文档（.docx 文件）及 Word 模板（.dotx 文件），就使用本 skill。触发场景包括：提到「Word 文档」、「word document」、「.docx」、「.dotx」，或要求生成排版专业的文档（包含目录、各级标题、页码或信头信纸等）。处理 .docx 或 .dotx 文件的内容提取与重新整理、在文档中插入或替换图片、在 Word 文件中执行查找替换、处理修订追踪（修订红线）或批注、以及将各类内容转换为精美排版的 Word 文档时，同样调用本 skill。如果用户需要以 Word 或 .docx 格式交付「报告」、「备忘录」、「信件」、「模板」等，均应使用本 skill。本 skill 不适用于 PDF、电子表格、Google Docs 或与文档生成无关的常规编程任务。"
---

# DOCX 文档创建、编辑与分析

`.docx` 文件本质上是一个打包了多个 XML 文件的 ZIP 压缩包。根据任务类型选择对应的处理路线：

| 任务类型         | 处理路线                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------- |
| **创建**新文档   | 编写基于 `docx`（npm）的脚本，动手前务必先看下文的避坑指南                               |
| **编辑**既有文档 | 解压 `unzip` → 修改 `word/document.xml` → 重新打包 `zip`（docx-js 无法直接打开现有文件） |
| **读取**文档内容 | 运行 `pandoc -t markdown file.docx`                                                      |

> 下文所有脚本路径均相对于本 skill 所在目录。

## 用 docx-js 创建文档（避坑指南）

环境中已预装 `docx` 库，不要先跑 `npm install`，直接在脚本中 `require('docx')` 即可。只有当 require 报错时才执行 `npm install docx`。大模型虽然熟悉它的 API，但这些暗坑极易踩翻：

- **页面尺寸默认是 A4。** 如果需要美式信纸（US Letter），必须显式配置 `page: { size: { width: 12240, height: 15840 } }`（单位为 DXA；1 英寸 = 1440 DXA）。
- **横向排版（Landscape）：** 必须传入纵向的宽高尺寸，再配合 `orientation: PageOrientation.LANDSCAPE`（因为 docx-js 内部会自动颠倒宽高）。
- **表格列宽与单元格宽度必须双重声明：** 表格本身要配置 `columnWidths`，同时内部的每个单元格也必须单独设置 `width`，单位统一用 `WidthType.DXA`（用 PERCENTAGE 在 Google Docs 里会彻底跑偏排版）。各列宽度相加必须等于表格总宽。
- **表格底纹颜色（Shading）：** 必须使用 `ShadingType.CLEAR`，千万别用 `SOLID`（后者会被直接渲染成死黑一片）。
- **列表符号：** 严禁直接手写字符 `•`；必须在 `numbering` 配置中指定 `LevelFormat.BULLET`。
- **`ImageRun` 必须传 `type:`**（比如 `"png"`、`"jpg"` 等）。
- **分页符（`PageBreak`）必须包裹在 `Paragraph` 内部。**
- **严禁在文本中用 `\n` 换行**：换行必须拆分成独立的 `Paragraph` 元素。
- **目录（TOC）：** 标题必须使用系统内置的 `HeadingLevel.*`；如果是自定义标题样式，必须配好 `outlineLevel`，否则目录根本抓取不到。
- **不要拿表格当水平分割线用**：想要分割线，直接给段落加下边框（bottom border）。
- **前导点（Dot-leader）与同行右对齐：** 在 `TextRun` 里使用 `PositionalTab`（`alignment: PositionalTabAlignment.RIGHT`，`leader: PositionalTabLeader.DOT`），不要靠手动打点或按空格来硬凑对齐。

## 视觉验证输出效果

生成 `.docx` 文件后，必须渲染成图片亲自肉眼核查：

```bash
python scripts/office/soffice.py --headless --convert-to pdf output.docx
pdftoppm -jpeg -r 100 output.pdf page
ls page-*.jpg   # 然后用 Read 工具查看这些图片
```

`pdftoppm` 会按总页数的位数自动补零填充页码（例如 `page-01.jpg` … `page-12.jpg`）。

## 编辑既有文档

老格式的 `.doc` 文件必须先转成 docx：`python scripts/office/soffice.py --headless --convert-to docx file.doc`。

完整编辑流程如下：

```bash
unzip -q doc.docx -d unpacked/
find unpacked -type l -delete   # 删掉所有符号链接（外部来源的 docx 文件一律按不可信处理，防止软链接逃逸）
python scripts/merge_runs.py unpacked/   # 合并被打碎的 run，让文字重新变得可搜索
# 原地编辑 unpacked/word/document.xml，切勿做代码美化或重排换行（pretty-print 会破坏文档）
(cd unpacked && rm -f ../out.docx && zip -Xr ../out.docx .)
python scripts/office/validate.py out.docx --original doc.docx   # 跑 XSD 校验；加上 --auto-repair 可自动修复常见小毛病
# 如果涉及审阅修订（redlining），加上 --author "<你审阅时用的名字>"，确保每一处修改都被追踪到了
```

Word 在存储文本时，经常会因为拼写检查、修订版本标记等原因，把一句话拆碎成多个 `<w:r>` 文本块（run）。因此你在文档里明明能看完整的一句话，在底层 XML 里根本不是连贯的字符串。`merge_runs.py` 会在不改动任何内容和渲染排版的前提下，将 `word/document.xml` 中格式相同的相邻 run 自动捏合成整段，方便搜索替换；它也支持直接传入 `.docx` 文件（`python scripts/merge_runs.py doc.docx -o merged.docx`）。

**修订追踪（Tracked changes）：** 在进行审阅修订时，必须带上 `--author "<你审阅时用的名字>"` 跑校验（需要传 `--original`），它会揪出所有你动过但忘了包裹 `<w:ins>`/`<w:del>` 的漏网文本；这种疏漏很容易不小心发生，而且在接受修订后的视图里根本看不出来。正确的做法是将 run 用带 `w:id`、`w:author`、`w:date` 属性的 `<w:ins>` 或 `<w:del>` 包裹起来。在 `<w:del>` 内部，文本标签必须用 `<w:delText>` 而不是 `<w:t>`。删除一个段落标记（形如 `<w:pPr><w:rPr><w:del w:id=".." w:author=".." w:date=".."/></w:rPr></w:pPr>`）在语义上表示“把当前段落与下一段合并”，所以要想彻底删除整段，除了给每个 run 加 `<w:del>` 外，还必须加上这层段落删除标记。注意：`<w:del/>` 必须排在 rPr 其他子元素的最前面，这是 XML 架构强制约束的顺序。

要生成一份所有修订都已接受的干净文档，运行：`python scripts/accept_changes.py in.docx out.docx`。

按规范，接受被删除的段落标记时，应当将该段与下一段合并；如果整段文字全部被删，整段理应彻底消失。Word 自身能完美处理这一点，但 `accept_changes.py` 和 `pandoc --track-changes=accept` 偶尔会掉链子。它们俩的通病是一致的：虽然删光了文字，却把空段落留下了；如果这处原本是自动编号列表，就会残留一个孤零零的空项目符号（bullet）：

- `pandoc --track-changes=accept` 从来不会自动合并段落。
- `accept_changes.py`（基于 LibreOffice）绝大多数时候都能正确合并，除非被删除段落后面紧跟着一个用于垫间距的空段落。

在这两种工具的预览视图里看到空项目符号，纯粹是渲染工具的兼容性瑕疵，并不是文档本身坏了。真正要核对的是 XML 里的段落删除标记是否正确。

## 批注处理（Comments）

在 Word 中插入批注需要联动改写 6 个相互引用的关系文件。手动修改极易出错，务必使用辅助脚本。如果后续还要编辑 `document.xml`，推荐使用目录模式（省去一轮解压和重新打包的开销）；如果只是加批注，可直接处理 `.docx`：

```bash
# 针对已经解压的目录操作（推荐做法：方便紧接着在 document.xml 里下锚点）
python scripts/comment.py unpacked/ "费用与报销上限设得太低了"
python scripts/comment.py unpacked/ "同意" --parent 0

# 直接针对 .docx 文件操作
python scripts/comment.py contract.docx "这个上限设得太低了" -o annotated.docx
```

该脚本会自动维护并写入 `comments.xml`、`commentsExtended.xml`、`commentsIds.xml`、`commentsExtensible.xml`、关联关系文件以及内容类型覆盖项（content-type overrides），并自动分配批注 ID。执行后，脚本会打印出对应的 `<w:commentRangeStart>` / `<w:commentRangeEnd>` / `<w:commentReference>` 代码片段，只要把这段 XML 粘贴到 `word/document.xml` 中对应的文字两端即可。如果不在正文里插好这些锚点标记，批注虽然存在于文档包里，但在 Word 里是不会显示出来的。

## 依赖工具链

`docx`（npm 库，系统预装，仅在 `require('docx')` 失败时才需安装） · `pandoc` · LibreOffice（`soffice`） · `pdftoppm`（属于 Poppler 工具集）
