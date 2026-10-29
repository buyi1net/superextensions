**关键原则：必须严格按顺序一步一步执行，严禁直接跳步去写代码！**

如果你需要填写一份 PDF 表单，首先第一步是检测该 PDF 到底是不是**原生可填写的交互式表单**（Interactive Fillable Form）。
在当前文件所在目录下运行检测脚本：
`python scripts/check_fillable_fields.py <file.pdf>`

根据脚本输出的检测结果，分流进入对应章节：
- 如果输出检测到可填字段，走 **第一部分：可填写表单（Fillable fields）**；
- 如果输出未检测到表单字段（扁平或扫描件表单），走 **第二部分：不可填写表单（Non-fillable fields）**。

---

# 第一部分：原生可填写的交互式表单（Fillable fields）

如果检测证实该 PDF 自带可填写的 AcroForm 表单字段，执行以下标准流程：

1. **提取表单字段元数据结构**：
   在当前目录下运行：`python scripts/extract_form_field_info.py <input.pdf> <field_info.json>`。
   该脚本会导出一个 JSON 文件，清晰列出所有可填字段的定义：
   ```json
   [
     {
       "field_id": "字段唯一标识 ID",
       "page": 1, // 所在页码，从 1 开始计数
       "rect": [100, 200, 300, 220], // [left, bottom, right, top] PDF 标准坐标系，y=0 为页面底部
       "type": "text" // 字段类型：text（文本框）、checkbox（复选框）、radio_group（单选钮组）或 choice（下拉多选）
     },
     // 复选框特有属性包含 checked_value 与 unchecked_value：
     {
       "field_id": "agree_terms",
       "page": 1,
       "type": "checkbox",
       "checked_value": "/Yes", // 赋予此值表示勾选
       "unchecked_value": "/Off" // 赋予此值表示取消勾选
     },
     // 单选钮组包含 radio_options 列表，列出所有可选分支：
     {
       "field_id": "gender_group",
       "page": 1,
       "type": "radio_group",
       "radio_options": [
         {
           "value": "male", // 赋予此值即可选中该单选项
           "rect": [100, 150, 115, 165] // 该单选钮的对应物理位置坐标
         }
       ]
     },
     // 下拉选择框包含 choice_options 列表：
     {
       "field_id": "country_select",
       "page": 1,
       "type": "choice",
       "choice_options": [
         {
           "value": "CN", // 赋予此值即代表选中此项
           "text": "China" // 选项在界面上显示的文本
         }
       ]
     }
   ]
   ```

2. **渲染并核对表单视觉布局**：
   把 PDF 各页转为高分辨率 PNG 图片：
   `python scripts/convert_pdf_to_images.py <file.pdf> <output_directory>`
   结合导出的图片与字段 ID，肉眼核对每个输入框在业务上到底对应哪一项内容（核对时注意把 PDF 坐标系与图片像素坐标对应好）。

3. **编写待填充数值清单 `field_values.json`**：
   准备一个 JSON 文件，指定要填入各字段的值：
   ```json
   [
     {
       "field_id": "last_name", // 必须与 field_info.json 里的 field_id 严丝合缝一致
       "description": "用户的姓氏",
       "page": 1, // 必须与 field_info.json 里的页码一致
       "value": "张"
     },
     {
       "field_id": "Checkbox12",
       "description": "年满 18 岁确认复选框",
       "page": 1,
       "value": "/On" // 复选框必须使用其 checked_value；单选钮必须使用 radio_options 中的对应 value
     }
   ]
   ```

4. **执行表单自动填充并输出**：
   运行填充脚本：
   `python scripts/fill_fillable_fields.py <input.pdf> <field_values.json> <output.pdf>`
   该脚本会自动校验字段 ID 及设定值的合法性；如果有任何报错信息，根据报错修正 `field_values.json` 重新执行，直到顺利完成。

---

# 第二部分：不可填写的扁平表单（Non-fillable fields）

如果 PDF 本身只是排版好的静态文档或扫描件，没有内置任何可填交互控件，就必须采用**精确计算坐标并追加文本注释（Text Annotations）**的方式来填表。

为了确保填写位置严丝合缝，**必须首选结构化坐标提取法**（精度最高）；只有当文档完全是纯图片/扫描件导致无法提取结构时，才降级使用纯肉眼视觉估算法。

## 步骤 1：优先尝试提取 PDF 结构化元素

运行以下脚本，自动分析 PDF 内部的文本标签、线段以及复选框物理坐标：
`python scripts/extract_form_structure.py <input.pdf> form_structure.json`

输出的 JSON 会包含四大核心信息：
- **labels**：页面中所有文本元素及其精确坐标范围（`x0`, `top`, `x1`, `bottom`，单位为 PDF 点 points）；
- **lines**：所有横向实线（用于界定表单表格的行边界）；
- **checkboxes**：页面中识别出的方形小方框（带中心点物理坐标）；
- **row_boundaries**：结合横线自动推算出的各行顶部与底部边界区间。

**检查分析结果**：
- 如果 `form_structure.json` 中能成功解析出有意义的文本标签（即表单题目的文字清晰可见），立即走 **方案 A：基于结构的精确定位法**。
- 如果这是一份纯扫描件或文本已经矢量化乱码（比如全是 `(cid:X)` 之类的无法识读字符），且几乎没有抓出文字标签，再转入 **方案 B：纯视觉估算法**。

---

## 方案 A：基于结构的精确定位法（强烈推荐）

适用于 `extract_form_structure.py` 能成功读出文本标签的绝大多数正常 PDF。

### A.1 分析提取出来的结构

读取 `form_structure.json` 并理清以下关系：
1. **聚合标签组**：某些相连的文字碎片其实属于同一个题干（例如 `姓` + `氏` 聚合成一个整体标签）；
2. **行结构判定**：`top` 坐标值相近的标签处于同一物理行；
3. **输入框宽度计算**：填写区域起始于题干标签的右侧（即 `entry.x0 = label.x1 + 间隙`）；
4. **复选框位置**：直接复用 structure 提取出的方框中心或外接矩形坐标。

**注意坐标系**：此处采用的是顶部原点坐标系 —— y=0 为页面顶部，y 向下递增。

### A.2 排查结构提取遗漏项

自动化结构提取难免有死角，常见遗漏包括：
- **圆形选择框**：脚本默认只提取方形框，圆圈选项会被漏掉；
- **复杂设计图形**：异形输入框或特殊设计的装饰性控件；
- **过浅或水印级线条**：因对比度太低可能漏抓。

如果后续看图片发现有些输入项在 `form_structure.json` 里根本没抓到，对这几个缺失项单独采用下文的**混合定位法**进行视觉补全。

### A.3 依据 PDF 结构构建 fields.json

根据结构算好每个输入项的物理坐标区域：

**文本填写框计算规则：**
- 输入框左侧 `entry x0` = 标签右侧 `label x1 + 5`（留出 5pt 的微小呼吸间距）；
- 输入框右侧 `entry x1` = 下一个题干标签的 `x0`，或该行的右外边框；
- 输入框顶部 `entry top` = 与题干标签的 `top` 齐平；
- 输入框底部 `entry bottom` = 下方横线位置，或 `label bottom + 行高`。

**复选框计算规则：**
- 直接复用 `form_structure.json` 里识别出来的方框矩形坐标：`entry_bounding_box = [checkbox.x0, checkbox.top, checkbox.x1, checkbox.bottom]`。

在声明 `fields.json` 时，必须使用 `pdf_width` 和 `pdf_height` 属性（这代表告诉后续脚本当前使用的是 PDF 原生坐标系）：
```json
{
  "pages": [
    {"page_number": 1, "pdf_width": 612, "pdf_height": 792}
  ],
  "form_fields": [
    {
      "page_number": 1,
      "description": "姓氏填写项",
      "field_label": "Last Name",
      "label_bounding_box": [43, 63, 87, 73],
      "entry_bounding_box": [92, 63, 260, 79],
      "entry_text": {"text": "张", "font_size": 10}
    },
    {
      "page_number": 1,
      "description": "是否为公民 - Yes 复选框",
      "field_label": "Yes",
      "label_bounding_box": [260, 200, 280, 210],
      "entry_bounding_box": [285, 197, 292, 205],
      "entry_text": {"text": "X"}
    }
  ]
}
```

### A.4 静态校验边界盒完整性

在正式执行文字写入前，必须运行边界盒校验脚本：
`python scripts/check_bounding_boxes.py fields.json`

该脚本会自动核查：
- 是否存在相互重叠交叉的输入区域（会导致填进去的文字压在一起）；
- 预留的输入框尺寸是否容纳得下所设置的字号（防止文字溢出）。
若有任何报错，修改 `fields.json` 直至全部消除。

---

## 方案 B：纯视觉估算法（保底方案）

仅在 PDF 为完全扁平的图片扫描件、且结构提取抓不出任何可用文字标签时使用。

### B.1 导出各页高清图片
`python scripts/convert_pdf_to_images.py <input.pdf> <images_dir/>`

### B.2 初步肉眼识别排版
查看整页大图，粗略框定各字段的位置：
- 识别题干文字与其大概所在坐标；
- 识别下划线、方框或空白填空区域；
- 记录每个字段的粗略像素范围（不用太精细，下一步会精修）。

### B.3 局部微距裁切放大（高精度对齐的核心手艺）
严禁凭感觉在大图上估算像素！必须针对每个输入框，使用 ImageMagick 裁切出局部特写小图，精确数出像素值：

```bash
magick <page_image> -crop <宽>x<高>+<x>+<y> +repage <crop_output.png>
```
参数含义：
- `<x>, <y>`：裁切区域左上角坐标（使用上一步的粗估坐标减去 50px 缓冲垫）；
- `<宽>, <高>`：裁切区域尺寸（目标输入框大小加上四周各 ~50px 的留白）。

*（注意：如果系统中没有 `magick` 命令，使用 `convert` 命令，参数完全一致）。*

**查看裁切出的小特写图片，直接读取精确像素点：**
1. 找出紧随标签文字之后输入区域的第一个起始像素点；
2. 找出该输入框结束的右侧像素边缘；
3. 找出输入框横线或方框的精确顶底像素坐标。

**将局部裁切坐标换算回全局图片像素坐标：**
- 全局 `full_x` = 裁切小图中的相对坐标 `crop_x` + 裁切起始偏移 `crop_offset_x`
- 全局 `full_y` = 裁切小图中的相对坐标 `crop_y` + 裁切起始偏移 `crop_offset_y`

### B.4 构建基于图像坐标的 fields.json
使用 `image_width` 和 `image_height` 属性（告诉后续脚本此处传入的是绝对图片像素坐标）：
```json
{
  "pages": [
    {"page_number": 1, "image_width": 1700, "image_height": 2200}
  ],
  "form_fields": [
    {
      "page_number": 1,
      "description": "姓氏填写项",
      "field_label": "Last Name",
      "label_bounding_box": [120, 175, 242, 198],
      "entry_bounding_box": [255, 175, 720, 218],
      "entry_text": {"text": "张", "font_size": 10}
    }
  ]
}
```

### B.5 静态校验边界盒
运行校验工具排查重叠和溢出：
`python scripts/check_bounding_boxes.py fields.json`

---

## 混合模式：结构化提取 + 局部视觉补全

当 PDF 中大部分标准字段都能被 `form_structure.json` 自动识别，但个别特殊元素（比如圆形勾选项、特殊绘制符号）被遗漏时，采用混合模式：

1. 绝大多数正常字段走 **方案 A**，直接复用结构化坐标；
2. 针对漏掉的少数特殊字段，将该页导出为图片进行肉眼分析；
3. 对缺失项采用 **方案 B** 中的微距裁切法测出精确图像像素坐标；
4. **统一坐标系统归一化**：将视觉估算出的图片像素坐标统一折算为 PDF 点坐标：
   - `pdf_x = image_x * (pdf_width / image_width)`
   - `pdf_y = image_y * (pdf_height / image_height)`
5. 在最终的 `fields.json` 中统一使用 `pdf_width` / `pdf_height` 坐标体系。

---

## 步骤 2：填入前最终静态校验

在正式调起填充脚本之前，**必须确保边界盒校验通过**：
`python scripts/check_bounding_boxes.py fields.json`

确认没有任何重合撞车，输入区域足够容纳指定字号。

## 步骤 3：正式写入注释内容

执行自动注入脚本（脚本能自动根据配置的基准宽高原语识别坐标体系并做精准投影）：
`python scripts/fill_pdf_form_with_annotations.py <input.pdf> fields.json <output.pdf>`

## 步骤 4：生成图片肉眼终审

把生成出来的最终 PDF 重新转为图片，亲自打开图片检查每一个填进去的字：
`python scripts/convert_pdf_to_images.py <output.pdf> <verify_images/>`

如果发现文字位置出现偏移：
- **方案 A**：核对是否误用了图片坐标，确保传给脚本的是 `pdf_width` / `pdf_height` 与 PDF 原生点坐标；
- **方案 B**：检查参考图片的宽高度是否与 JSON 中声明的一致，核实局部坐标换算是否漏加了偏移量；
- **混合模式**：重新核实那些手工补全项的比例换算公式 `pdf_width / image_width` 是否计算准确。
