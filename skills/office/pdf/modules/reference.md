# PDF 进阶技术与参考手册

本文档汇总了处理 PDF 文件的高级技术特性、完整代码示例，以及主规范文档中未展开介绍的其他生态工具库。

## pypdfium2 库（Apache/BSD 许可证）

### 概述
`pypdfium2` 是 Google PDFium（Chromium 浏览器所采用的高性能 PDF 内核）的 Python 绑定。它在高速渲染 PDF 页面、生成高质量光栅图片方面性能极佳，是替换 PyMuPDF（AGPL 传染风险）的理想轻量级方案。

### 将 PDF 页面渲染为图片
```python
import pypdfium2 as pdfium
from PIL import Image

# 加载 PDF 文档
pdf = pdfium.PdfDocument("document.pdf")

# 渲染单页为图片
page = pdf[0]  # 第一页（索引从 0 开始）
bitmap = page.render(
    scale=2.0,  # 放大倍率（数值越高越清晰）
    rotation=0  # 旋转角度（不旋转）
)

# 转换为 PIL 图像对象并保存
img = bitmap.to_pil()
img.save("page_1.png", "PNG")

# 批量循环处理所有页面
for i, page in enumerate(pdf):
    bitmap = page.render(scale=1.5)
    img = bitmap.to_pil()
    img.save(f"page_{i+1}.jpg", "JPEG", quality=90)
```

### 用 pypdfium2 快速提取文本
```python
import pypdfium2 as pdfium

pdf = pdfium.PdfDocument("document.pdf")
for i, page in enumerate(pdf):
    text = page.get_text()
    print(f"第 {i+1} 页文本长度: {len(text)} 字符")
```

---

## JavaScript 工具库

### pdf-lib（MIT 许可证）

`pdf-lib` 是一套纯 JavaScript 编写的成熟 PDF 解析与生成库，可无缝运行在 Node.js、浏览器以及各类 Serverless 运行时中。

#### 加载并修改既有 PDF
```javascript
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function manipulatePDF() {
    // 读取并加载现有 PDF 字节流
    const existingPdfBytes = fs.readFileSync('input.pdf');
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // 获取总页数
    const pageCount = pdfDoc.getPageCount();
    console.log(`文档总页数: ${pageCount}`);

    // 在末尾追加一个自定义尺寸的新页面 [宽, 高]
    const newPage = pdfDoc.addPage([600, 400]);
    newPage.drawText('由 pdf-lib 动态追加的文本', {
        x: 100,
        y: 300,
        size: 16
    });

    // 序列化并写入磁盘
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('modified.pdf', pdfBytes);
}
```

#### 从零编程式构建复杂版面 PDF
```javascript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';

async function createPDF() {
    const pdfDoc = await PDFDocument.create();

    // 嵌入标准系统字体
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // 添加 A4 尺寸页面 (595 × 842 pt)
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();

    // 绘制大标题
    page.drawText('账单发票 #12345', {
        x: 50,
        y: height - 50,
        size: 18,
        font: helveticaBold,
        color: rgb(0.2, 0.2, 0.8)
    });

    // 绘制表头底色浅灰矩形块
    page.drawRectangle({
        x: 40,
        y: height - 100,
        width: width - 80,
        height: 30,
        color: rgb(0.9, 0.9, 0.9)
    });

    // 循环绘制简易表格行
    const items = [
        ['商品项', '数量', '单价', '小计'],
        ['微型组件', '2', '$50', '$100'],
        ['扩展插件', '1', '$75', '$75']
    ];

    let yPos = height - 150;
    items.forEach(row => {
        let xPos = 50;
        row.forEach(cell => {
            page.drawText(cell, {
                x: xPos,
                y: yPos,
                size: 12,
                font: helveticaFont
            });
            xPos += 120;
        });
        yPos -= 25;
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('created.pdf', pdfBytes);
}
```

#### 高级合并与跨文件页面抽取
```javascript
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function mergePDFs() {
    const mergedPdf = await PDFDocument.create();

    const pdf1Bytes = fs.readFileSync('doc1.pdf');
    const pdf2Bytes = fs.readFileSync('doc2.pdf');

    const pdf1 = await PDFDocument.load(pdf1Bytes);
    const pdf2 = await PDFDocument.load(pdf2Bytes);

    // 完整拷贝第一个文档的所有页面
    const pdf1Pages = await mergedPdf.copyPages(pdf1, pdf1.getPageIndices());
    pdf1Pages.forEach(page => mergedPdf.addPage(page));

    // 精确抽取第二个文档的特定页面（第 0, 2, 4 页）
    const pdf2Pages = await mergedPdf.copyPages(pdf2, [0, 2, 4]);
    pdf2Pages.forEach(page => mergedPdf.addPage(page));

    const mergedPdfBytes = await mergedPdf.save();
    fs.writeFileSync('merged.pdf', mergedPdfBytes);
}
```

---

### pdfjs-dist（Apache 许可证）

Mozilla 官方维护的 PDF.js 的 npm 发行包，擅长在浏览器端或 Node.js 环境下做精细的页面渲染与文本坐标提取。

#### 页面加载与 Canvas 光栅化渲染
```javascript
import * as pdfjsLib from 'pdfjs-dist';

// 配置工作线程路径（对性能和异步解析至关重要）
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.js';

async function renderPDF() {
    const loadingTask = pdfjsLib.getDocument('document.pdf');
    const pdf = await loadingTask.promise;

    console.log(`成功载入文档，总页数: ${pdf.numPages}`);

    // 获取第 1 页
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });

    // 创建虚拟或离屏 Canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
        canvasContext: context,
        viewport: viewport
    };

    await page.render(renderContext).promise;
    document.body.appendChild(canvas);
}
```

#### 提取文字内容及其绝对物理坐标
```javascript
import * as pdfjsLib from 'pdfjs-dist';

async function extractText() {
    const loadingTask = pdfjsLib.getDocument('document.pdf');
    const pdf = await loadingTask.promise;

    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        const pageText = textContent.items
            .map(item => item.str)
            .join(' ');

        fullText += `\n--- 第 ${i} 页 ---\n${pageText}`;

        // 提取带精确坐标与宽高的文本图元（常用于结构化逆向推导）
        const textWithCoords = textContent.items.map(item => ({
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height
        }));
    }

    console.log(fullText);
    return fullText;
}
```

#### 提取注释（Annotations）与表单元素
```javascript
import * as pdfjsLib from 'pdfjs-dist';

async function extractAnnotations() {
    const loadingTask = pdfjsLib.getDocument('annotated.pdf');
    const pdf = await loadingTask.promise;

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const annotations = await page.getAnnotations();

        annotations.forEach(annotation => {
            console.log(`注释子类型: ${annotation.subtype}`);
            console.log(`注释正文: ${annotation.contents}`);
            console.log(`物理矩形位置: ${JSON.stringify(annotation.rect)}`);
        });
    }
}
```

---

## 命令行高级用法

### poppler-utils 工具集进阶

#### 导出带有外接边界盒（Bounding Box）坐标的 XML 结构
```bash
# 提取带有每个字块精确物理位置的文本结构（结构化数据逆向推导利器）
pdftotext -bbox-layout document.pdf output.xml
# 导出的 XML 会完整记录每个字符和文本块的 x/y/width/height 坐标
```

#### 高分辨率批量转图技巧
```bash
# 以 300 DPI 导出高质量 PNG 图片
pdftoppm -png -r 300 document.pdf output_prefix

# 仅导出指定页码（例如前 3 页）且采用 600 DPI 超高清分辨率
pdftoppm -png -r 600 -f 1 -l 3 document.pdf high_res_pages

# 导出为 JPEG，并精确控制画质压缩率（质量 85，分辨率 200 DPI）
pdftoppm -jpeg -jpegopt quality=85 -r 200 document.pdf jpeg_output
```

#### 内嵌位图精细化剥离
```bash
# 提取所有内嵌图片并附带页码元数据
pdfimages -j -p document.pdf page_images

# 仅列出文档内嵌的所有图片尺寸与格式清单，不落地导出文件
pdfimages -list document.pdf

# 保持内嵌图片原始无损格式批量提取（png、jpeg、tiff 等不重编码）
pdfimages -all document.pdf images/img
```

---

### qpdf 高阶页面重组与底层维护

#### 复杂页面拆解与重新混编
```bash
# 每 3 页拆分成一个独立文件组
qpdf --split-pages=3 input.pdf output_group_%02d.pdf

# 按照复杂的离散页码表达式抽取重组（提取第 1 页、第 3-5 页、第 8 页和第 10 页至结尾）
qpdf input.pdf --pages input.pdf 1,3-5,8,10-end -- extracted.pdf

# 从多个不同的 PDF 中挑选指定页码合并为单份文档
qpdf --empty --pages doc1.pdf 1-3 doc2.pdf 5-7 doc3.pdf 2,4 -- combined.pdf
```

#### 文件体积优化与底层结构损坏修复
```bash
# 线性化处理（Linearize，也就是开启 Web 快显模式，支持浏览器边下边看）
qpdf --linearize input.pdf optimized.pdf

# 剔除未引用的多余冗余对象并重新执行高强度流压缩
qpdf --optimize-level=all input.pdf compressed.pdf

# 语法健全性深度扫描与破损底层修复
qpdf --check input.pdf
qpdf --fix-qdf damaged.pdf repaired.pdf

# 输出整份文档的底层对象树结构明细（底层调试定位关键工具）
qpdf --show-all-pages input.pdf > structure.txt
```

#### 高阶权限加密配置
```bash
# 使用 256 位 AES 加密，设置访问密码和管理密码，并显式禁用打印和修改权限
qpdf --encrypt user_pass owner_pass 256 --print=none --modify=none -- input.pdf encrypted.pdf

# 查看当前文件的加密状态与权限位
qpdf --show-encryption encrypted.pdf

# 剥离密码保护（需已知原密码）
qpdf --password=secret123 --decrypt encrypted.pdf decrypted.pdf
```

---

## Python 高阶编程技巧

### pdfplumber 高阶进阶

#### 坐标级字块精准探测
```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    page = pdf.pages[0]
    
    # 遍历获取每一个字符对象的绝对坐标
    chars = page.chars
    for char in chars[:10]:  # 打印前 10 个字符
        print(f"字符: '{char['text']}' 坐标 -> x:{char['x0']:.1f} y:{char['y0']:.1f}")
    
    # 精确圈定一个矩形区域并仅提取该区域内的文字（left, top, right, bottom）
    bbox_text = page.within_bbox((100, 100, 400, 200)).extract_text()
```

#### 自定义容差参数解析异形复杂表格
```python
import pdfplumber
import pandas as pd

with pdfplumber.open("complex_table.pdf") as pdf:
    page = pdf.pages[0]
    
    # 针对不规则或虚线表格，显式调整对齐吸附容差
    table_settings = {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 3,
        "intersection_tolerance": 15
    }
    tables = page.extract_tables(table_settings)
    
    # 将识别出来的表格网格线渲染成调试图片，肉眼核对判定是否准确
    img = page.to_image(resolution=150)
    img.save("debug_layout.png")
```

---

### reportlab 高阶进阶

#### 编排带复杂样式的专业数据报表
```python
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

data = [
    ['产品名称', '第一季度', '第二季度', '第三季度', '第四季度'],
    ['微型核心', '120', '135', '142', '158'],
    ['扩展模组', '85', '92', '98', '105']
]

doc = SimpleDocTemplate("report.pdf")
elements = []

styles = getSampleStyleSheet()
title = Paragraph("季度销售分析报表", styles['Title'])
elements.append(title)

# 构造表格并深度绑定样式矩阵
table = Table(data)
table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 14),
    ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
    ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
    ('GRID', (0, 0), (-1, -1), 1, colors.black)
]))
elements.append(table)

doc.build(elements)
```

---

## 复杂业务组合拳

### 提取文档中的图表与配图

#### 方案一：采用 pdfimages 直接抽取（速度最快）
```bash
# 保持原图质量直接把所有内嵌位图解压落地
pdfimages -all document.pdf images/img
```

#### 方案二：基于 pypdfium2 + 图像分析探测矢量插图
```python
import pypdfium2 as pdfium
from PIL import Image
import numpy as np

def extract_figures(pdf_path, output_dir):
    pdf = pdfium.PdfDocument(pdf_path)
    
    for page_num, page in enumerate(pdf):
        # 以 3.0 倍超高分辨率光栅化渲染页面
        bitmap = page.render(scale=3.0)
        img = bitmap.to_pil()
        
        # 转为 numpy 数组进行图像分析
        img_array = np.array(img)
        
        # 简单过滤白色背景，圈定非纯白像素聚集区域
        mask = np.any(img_array != [255, 255, 255], axis=2)
        # 后续可通过轮廓查找（cv2.findContours）提取外接矩形并裁剪出插图
```

---

### 批量处理 PDF 并做好异常容错拦截
```python
import os
import glob
from pypdf import PdfReader, PdfWriter
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def batch_process_pdfs(input_dir, operation='merge'):
    pdf_files = glob.glob(os.path.join(input_dir, "*.pdf"))
    
    if operation == 'merge':
        writer = PdfWriter()
        for pdf_file in pdf_files:
            try:
                reader = PdfReader(pdf_file)
                for page in reader.pages:
                    writer.add_page(page)
                logger.info(f"成功合并文件: {pdf_file}")
            except Exception as e:
                logger.error(f"处理文件 {pdf_file} 失败，跳过: {e}")
                continue
        
        with open("batch_merged.pdf", "wb") as output:
            writer.write(output)
    
    elif operation == 'extract_text':
        for pdf_file in pdf_files:
            try:
                reader = PdfReader(pdf_file)
                text = ""
                for page in reader.pages:
                    text += page.extract_text()
                
                output_file = pdf_file.replace('.pdf', '.txt')
                with open(output_file, 'w', encoding='utf-8') as f:
                    f.write(text)
                logger.info(f"成功导出文本: {pdf_file}")
                
            except Exception as e:
                logger.error(f"提取 {pdf_file} 文本失败: {e}")
                continue
```

---

### 精准裁切页面尺寸（Crop）
```python
from pypdf import PdfWriter, PdfReader

reader = PdfReader("input.pdf")
writer = PdfWriter()

# 调整 Mediabox 裁剪框（单位为 PDF 点 points：左、底、右、顶）
page = reader.pages[0]
page.mediabox.left = 50
page.mediabox.bottom = 50
page.mediabox.right = 550
page.mediabox.top = 750

writer.add_page(page)
with open("cropped.pdf", "wb") as output:
    writer.write(output)
```

---

## 性能优化核心技巧

### 1. 超大体积 PDF
- 避免一次性把几百兆的大文件完整塞进内存，优先使用分批流式读取；
- 需要大体量拆分文件时，优先使用 `qpdf --split-pages`；
- 需要渲染页面时，选用 `pypdfium2` 逐页渲染并主动释放对象。

### 2. 文本提取
- 纯文本提取速度最快的是 `pdftotext -bbox-layout`；
- 处理结构化表格数据首选 `pdfplumber`；
- 超大超长文档慎用 `pypdf.extract_text()`，避免内存急剧膨胀。

### 3. 图片提取
- 直接调用 `pdfimages` 提取内嵌图片比先渲染整页再切图快好几个数量级；
- 预览校验时使用 100-150 DPI 低分辨率，只有最终交付核验时才开 300+ DPI。

### 4. 表单填充
- 在 Node.js 环境下处理复杂交互表单，`pdf-lib` 对原有表单层级关系的保留度最高；
- 填充之前务必做静态校验，避免填充到中途崩溃报错。

### 5. 分批内存管理（Python 示范）
```python
# 将超大 PDF 拆分成固定大小的分块分批处理，避免撑爆内存
def process_large_pdf(pdf_path, chunk_size=10):
    reader = PdfReader(pdf_path)
    total_pages = len(reader.pages)
    
    for start_idx in range(0, total_pages, chunk_size):
        end_idx = min(start_idx + chunk_size, total_pages)
        writer = PdfWriter()
        
        for i in range(start_idx, end_idx):
            writer.add_page(reader.pages[i])
        
        with open(f"chunk_{start_idx//chunk_size}.pdf", "wb") as output:
            writer.write(output)
```

---

## 常见疑难杂症排查

### 密码保护文档处理
```python
from pypdf import PdfReader

try:
    reader = PdfReader("encrypted.pdf")
    if reader.is_encrypted:
        reader.decrypt("password")
except Exception as e:
    print(f"解密失败: {e}")
```

### 文档损坏修复
```bash
# 尝试使用 qpdf 检测并自动修复损坏的交叉引用表（XRef）
qpdf --check corrupted.pdf
qpdf --replace-input corrupted.pdf
```

### 扫描件/纯图片 PDF 乱码无法提取文字
```python
# 降级使用 OCR 图像光学识别兜底
import pytesseract
from pdf2image import convert_from_path

def extract_text_with_ocr(pdf_path):
    images = convert_from_path(pdf_path)
    text = ""
    for i, image in enumerate(images):
        text += pytesseract.image_to_string(image)
    return text
```

---

## 核心工具开源许可证一览

- **pypdf**: BSD 许可证
- **pdfplumber**: MIT 许可证
- **pypdfium2**: Apache/BSD 许可证
- **reportlab**: BSD 许可证
- **poppler-utils**: GPL-2 许可证
- **qpdf**: Apache 许可证
- **pdf-lib**: MIT 许可证
- **pdfjs-dist**: Apache 许可证
