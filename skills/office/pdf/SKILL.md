---
name: pdf
description: "只要任务涉及任何对 PDF 文件的处理或生成，都必须使用本 skill。覆盖场景包括：读取或提取 PDF 中的文本与结构化表格；合并多个 PDF；按页拆分或截取 PDF；旋转页面方向；添加水印与印章；从零构建全新的 PDF 报告；填写 PDF 交互式表单或在扁平 PDF 上打字填报；加密保护或解密移除密码；批量抽取内嵌图片；以及对扫描件 PDF 执行 OCR 光学字符识别以使其具备全文检索复制能力。只要用户提到 .pdf 文件或要求生成 PDF 交付物，就使用本 skill。"
---

# PDF 处理全指南

## 概览

本指南系统汇总了使用 Python 生态库与命令行工具处理 PDF 文件的核心方法与最佳实践。关于高级排版技巧、JavaScript 工具库（如 `pdf-lib`）以及海量文件性能优化，请参阅 [reference.md](./modules/reference.md)；若任务涉及填写 PDF 表单，请务必阅读 [forms.md](./modules/forms.md) 并严格按其流程执行。

## 快速上手

```python
from pypdf import PdfReader, PdfWriter

# 读取 PDF 文件
reader = PdfReader("document.pdf")
print(f"总页数: {len(reader.pages)}")

# 提取全文纯文本
text = ""
for page in reader.pages:
    text += page.extract_text()
```

## Python 核心工具库

### pypdf：基础页面与文件流操作

#### 合并多个 PDF 文件

```python
from pypdf import PdfWriter, PdfReader

writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf", "doc3.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as output:
    writer.write(output)
```

#### 拆分 PDF（将每页保存为独立文件）

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as output:
        writer.write(output)
```

#### 读取文档元数据信息

```python
from pypdf import PdfReader

reader = PdfReader("document.pdf")
meta = reader.metadata
print(f"标题: {meta.title}")
print(f"作者: {meta.author}")
print(f"主题: {meta.subject}")
print(f"生成工具: {meta.creator}")
```

#### 旋转页面方向

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
writer = PdfWriter()

page = reader.pages[0]
page.rotate(90)  # 顺时针旋转 90 度
writer.add_page(page)

with open("rotated.pdf", "wb") as output:
    writer.write(output)
```

### pdfplumber：还原版式与结构化表格提取

#### 提取文本（尽可能保留原始排版与间距）

```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        print(text)
```

#### 提取页面表格

```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        for j, table in enumerate(tables):
            print(f"第 {i+1} 页第 {j+1} 个表格:")
            for row in table:
                print(row)
```

#### 高级应用：抽取所有表格并整合导出为 Excel

```python
import pdfplumber
import pandas as pd

with pdfplumber.open("document.pdf") as pdf:
    all_tables = []
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            if table:  # 过滤空表
                df = pd.DataFrame(table[1:], columns=table[0])
                all_tables.append(df)

# 将提取到的表格批量拼合并输出
if all_tables:
    combined_df = pd.concat(all_tables, ignore_index=True)
    combined_df.to_excel("extracted_tables.xlsx", index=False)
```

### reportlab：编程式构建全新 PDF

#### 基础 Canvas 坐标系自由绘制

```python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

c = canvas.Canvas("hello.pdf", pagesize=letter)
width, height = letter

# 绘制文本（左下角原点，向上 y 递增）
c.drawString(100, height - 100, "你好，世界！")
c.drawString(100, height - 120, "基于 ReportLab 自动生成")

# 绘制分割线
c.line(100, height - 140, 400, height - 140)

# 保存生成文件
c.save()
```

#### 使用 Platypus 引擎实现流式多页排版

```python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

doc = SimpleDocTemplate("report.pdf", pagesize=letter)
styles = getSampleStyleSheet()
story = []

# 第 1 页内容
title = Paragraph("项目执行汇报", styles['Title'])
story.append(title)
story.append(Spacer(1, 12))

body = Paragraph("这是第一页的正文内容。" * 20, styles['Normal'])
story.append(body)
story.append(PageBreak())  # 显式插入分页符

# 第 2 页内容
story.append(Paragraph("第二章节", styles['Heading1']))
story.append(Paragraph("进入第二页的详细技术论述...", styles['Normal']))

# 编译生成 PDF
doc.build(story)
```

#### 上标与下标的避坑重点

> [!IMPORTANT]
> **严禁在 ReportLab PDF 中直接硬编码 Unicode 上标或下标字符**（如 ₀₁₂₃₄₅₆₇₈₉、⁰¹²³⁴⁵⁶⁷⁸⁹）。ReportLab 内置的标准字体库完全不包含这些特殊字符字形，直接写入会导致它们全部被渲染成纯黑的实心方块。

正确的做法是在 `Paragraph` 段落对象中使用 ReportLab 支持的类 XML 标签：

```python
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet

styles = getSampleStyleSheet()

# 下标：使用 <sub> 标签
chemical = Paragraph("H<sub>2</sub>O", styles['Normal'])

# 上标：使用 <super> 标签
squared = Paragraph("x<super>2</super> + y<super>2</super>", styles['Normal'])
```

如果是使用底层的 `canvas` 纯手工绘制文字，请通过修改字号并微调 y 坐标上下偏移来实现，切勿直接写入 Unicode 上下标。

## 常用命令行工具

### pdftotext（来自 poppler-utils）

```bash
# 提取纯文本文件
pdftotext input.pdf output.txt

# 提取文本并尽可能还原空格与版面缩进
pdftotext -layout input.pdf output.txt

# 仅截取指定页码范围
pdftotext -f 1 -l 5 input.pdf output.txt  # 提取第 1 到第 5 页
```

### qpdf

```bash
# 高速合并多个 PDF
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf

# 截取或拆分指定页码
qpdf input.pdf --pages . 1-5 -- pages1-5.pdf
qpdf input.pdf --pages . 6-10 -- pages6-10.pdf

# 旋转指定页面方向
qpdf input.pdf output.pdf --rotate=+90:1  # 将第 1 页顺时针旋转 90 度

# 提供已知密码静默解密
qpdf --password=mypassword --decrypt encrypted.pdf decrypted.pdf
```

### pdftk（如果系统中已安装）

```bash
# 文件拼接合并
pdftk file1.pdf file2.pdf cat output merged.pdf

# 炸碎拆分为单页文件
pdftk input.pdf burst

# 旋转页面方向
pdftk input.pdf rotate 1east output rotated.pdf
```

## 常见典型场景方案

### 从扫描件 PDF 中识别文字（OCR）

```python
# 需要环境依赖：pip install pytesseract pdf2image
import pytesseract
from pdf2image import convert_from_path

# 将 PDF 逐页栅格化为高分辨率图像
images = convert_from_path('scanned.pdf')

# 逐页进行 OCR 光学字符识别
full_text = ""
for i, image in enumerate(images):
    full_text += f"--- 第 {i+1} 页 ---\n"
    full_text += pytesseract.image_to_string(image, lang='chi_sim+eng')  # 同时支持中英文
    full_text += "\n\n"

print(full_text)
```

### 添加全页水印

```python
from pypdf import PdfReader, PdfWriter

# 读取单页水印模板
watermark_page = PdfReader("watermark.pdf").pages[0]

# 将水印逐页覆盖合并到目标文档中
reader = PdfReader("document.pdf")
writer = PdfWriter()

for page in reader.pages:
    page.merge_page(watermark_page)
    writer.add_page(page)

with open("watermarked.pdf", "wb") as output:
    writer.write(output)
```

### 批量抽取内嵌原始图片

```bash
# 使用 pdfimages（属于 poppler-utils 工具集）
pdfimages -j input.pdf output_prefix

# 会将文档中的所有嵌入图无损导出为 output_prefix-000.jpg、output_prefix-001.jpg 等
```

### 文件加密与权限设定

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
writer = PdfWriter()

for page in reader.pages:
    writer.add_page(page)

# 同时设置阅读密码与管理权限密码
writer.encrypt("userpassword", "ownerpassword")

with open("encrypted.pdf", "wb") as output:
    writer.write(output)
```

## 核心任务速查表

| 任务场景            | 最佳推荐工具        | 核心命令 / 代码调用                                   |
| ------------------- | ------------------- | ----------------------------------------------------- |
| 快速合并 PDF        | pypdf 或 qpdf       | `writer.add_page(page)` 或 `qpdf --empty --pages ...` |
| 拆分与截取页码      | pypdf               | 循环选页并通过 writer 保存                            |
| 提取纯文本与版面    | pdfplumber          | `page.extract_text()`                                 |
| 提取表格到 Excel    | pdfplumber + pandas | `page.extract_tables()` 组装 DataFrame                |
| 编程式从零制表      | reportlab           | `Platypus`（流式排版）或 `Canvas`（自由绘制）         |
| 扫描版 PDF 提取文字 | pytesseract         | 先用 `pdf2image` 栅格化再跑 OCR                       |
| 填写交互/扁平表单   | 自带脚本链          | 务必参阅 [forms.md](./modules/forms.md) 流程      |

## 进阶学习路线

- 关于 Google Chromium 内核的 `pypdfium2` 高性能渲染技巧，请参阅 [reference.md](./modules/reference.md)
- 关于纯 JavaScript 生态（`pdf-lib` / `pdfjs-dist`）的用法，请参阅 [reference.md](./modules/reference.md)
- 关于超大文件内存分块处理与故障排查，请参阅 [reference.md](./modules/reference.md)
- 如需填写 PDF 表单，务必查阅 [forms.md](./modules/forms.md) 遵循规范步骤执行
