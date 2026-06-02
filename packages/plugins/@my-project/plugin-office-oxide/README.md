# @my-project/plugin-office-oxide

将 Office (DOCX/XLSX/PPTX/DOC/XLS/PPT)、PDF 和图片转换为 Markdown 或 HTML 的 NocoBase 插件。

## 双引擎架构

| 引擎 | 适用格式 | 特点 |
|------|---------|------|
| **本地引擎** | Office、PDF | office-oxide + pdf-oxide Rust 原生库，速度快，无需联网 |
| **MinerU 云端** | 所有格式（含图片） | 云端 OCR + 表格识别 + 公式解析，支持扫描件和纯图片 |

- 本地引擎：Office 文件用 office-oxide，PDF 用 pdf-oxide
- MinerU：按文件类型分别开关，可混用（如 Office 走本地、PDF 走 MinerU OCR）
- 图片只能走 MinerU（本地引擎不支持图片）

## 安装

```bash
yarn pm enable @my-project/plugin-office-oxide
```

## 权限

所有接口仅登录用户可访问（`loggedIn`）。

## 支持的格式

| 类型 | 扩展名 | 本地引擎 | MinerU |
|------|--------|:--------:|:------:|
| PDF | `.pdf` | pdf-oxide | OCR + 表格 + 公式 |
| Word | `.docx` `.doc` | office-oxide | OCR + 表格 + 公式 |
| Excel | `.xlsx` `.xls` | office-oxide | OCR + 表格 + 公式 |
| PowerPoint | `.pptx` `.ppt` | office-oxide | OCR + 表格 + 公式 |
| 图片 | `.png` `.jpg` `.jpeg` `.jp2` `.webp` `.gif` `.bmp` | — | OCR |

---

## 设置页面

路径：系统设置 → MinerU OCR Settings

### 可配置项

| 配置 | 说明 | 默认值 |
|------|------|--------|
| API 地址 | MinerU 服务地址，本地部署时改为 `http://你的IP:端口` | `https://mineru.net/api/v4` |
| API 令牌 | MinerU API Token（前往 mineru.net 获取） | — |
| 使用 MinerU 处理 | 按文件类型（PDF/Word/Excel/PPT/图片）分别开关 | 全关 |
| OCR 文字识别 | 是否开启 OCR（扫描件和纯图片必须开启） | 开 |
| 表格识别 | 是否识别文档中的表格结构 | 开 |
| 公式识别 | 是否识别数学公式（LaTeX） | 关 |

> 各开关有悬停提示（Tooltip），鼠标悬停即可查看详细说明。

---

## API 接口

### 1. `POST /api/officeOxide:toMarkdown`

将文件转为 Markdown。

#### 请求方式一：multipart/form-data（推荐）

```bash
curl -X POST http://localhost:13000/api/officeOxide:toMarkdown \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@report.xlsx"
```

#### 请求方式二：Base64 编码

```json
{
  "file": "<base64>",
  "filename": "report.xlsx"
}
```

#### 请求方式三：服务器文件路径

```json
{
  "path": "/tmp/report.docx"
}
```

#### 响应

```json
{
  "data": {
    "markdown": "## Sheet 1\n\n| Name | Age |\n|------|-----|\n| Alice | 30 |"
  }
}
```

---

### 2. `POST /api/officeOxide:toHtml`

将文件转为 HTML。

#### 请求方式一：multipart/form-data（推荐）

```bash
curl -X POST http://localhost:13000/api/officeOxide:toHtml \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@report.docx"
```

#### 请求方式二：Base64 编码

```json
{
  "file": "<base64>",
  "filename": "report.docx"
}
```

#### 请求方式三：服务器文件路径

```json
{
  "path": "/tmp/report.docx"
}
```

#### 响应

```json
{
  "data": {
    "html": "<h2>Sheet 1</h2>\n<table>...</table>"
  }
}
```

---

### 3. `POST /api/officeOxide:getMineruToken`

读取 MinerU 配置（仅供设置页面调用）。

#### 响应

```json
{
  "data": {
    "token": "xxx",
    "baseUrl": "https://mineru.net/api/v4",
    "mineruCategories": { "pdf": true, "word": false },
    "ocrConfig": { "ocr": true, "formula": false, "table": true }
  }
}
```

---

### 4. `POST /api/officeOxide:setMineruToken`

保存 MinerU 配置（仅供设置页面调用）。可部分更新，只传需要改的字段即可。

#### 请求体

```json
{
  "token": "your-api-token",
  "baseUrl": "https://mineru.net/api/v4",
  "mineruCategories": { "pdf": true },
  "ocrConfig": { "ocr": true, "table": true }
}
```

---

## 处理策略

| 场景 | 行为 |
|------|------|
| MinerU 开关关闭 | 走本地引擎 |
| MinerU 开关打开且有 Token | 走 MinerU 云端 |
| 图片类型未开 MinerU | 返回错误提示 |
| XLSX Markdown 输出 | 自动应用合并单元格复制策略 |
| MinerU HTML 无结果 | 回退到 `<pre>` 包裹的 Markdown |

---

## 依赖说明

| 依赖 | 用途 |
|------|------|
| [office-oxide](https://npmjs.com/package/office-oxide) | Rust 原生库，本地处理 Office 文档 |
| [pdf-oxide](https://npmjs.com/package/pdf-oxide) | Rust 原生库，本地处理 PDF |
| [mineru-open-sdk](https://npmjs.com/package/mineru-open-sdk) | MinerU 云端 API 调用 |

- `office-oxide` 和 `pdf-oxide` 自带各平台预编译二进制，无需 node-gyp
- 两者已在构建配置中标记为 `external`，`yarn install` 即可
