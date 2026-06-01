# @my-project/plugin-office-oxide

基于 [office-oxide](https://github.com/yfedoseev/office_oxide)（Rust 原生库）将 Office 文档（DOCX、XLSX、PPTX 等）转换为 Markdown 或 HTML 的 NocoBase 插件。

## 安装

```bash
yarn pm enable @my-project/plugin-office-oxide
```

## 权限

所有接口仅登录用户可访问（`loggedIn`）。

## 支持的格式

| 类型 | 扩展名 |
|------|--------|
| Word | `.docx` `.doc` |
| Excel | `.xlsx` `.xls` |
| PowerPoint | `.pptx` `.ppt` |

---

## API 接口列表

### 1. `POST /api/officeOxide:toMarkdown`

将 Office 文件转为 Markdown。XLSX/XLS 文件会自动应用合并单元格复制策略。

#### 请求方式一：multipart/form-data（推荐）

**请求头：**

```
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

**表单字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | 原始文件二进制 |

**curl 示例：**

```bash
curl -X POST http://localhost:13000/api/officeOxide:toMarkdown \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@report.xlsx"
```

**React 示例：**

```tsx
import { useAPIClient } from '@nocobase/client';

const api = useAPIClient();
const formData = new FormData();
formData.append('file', file);

const res = await api.request({
  method: 'post',
  url: 'officeOxide:toMarkdown',
  data: formData,
  headers: { 'Content-Type': 'multipart/form-data' },
});

console.log(res.data?.data?.markdown);
```

#### 请求方式二：Base64 编码

**请求体（JSON）：**

```json
{
  "file": "<base64>",
  "filename": "report.xlsx"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | string | 是 | 文件内容的 base64 编码 |
| `filename` | string | 是 | 原始文件名（含扩展名，用于判断格式） |

**curl 示例：**

```bash
curl -X POST http://localhost:13000/api/officeOxide:toMarkdown \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"file\":\"$(base64 -w0 report.xlsx)\",\"filename\":\"report.xlsx\"}"
```

#### 请求方式三：服务器文件路径

**请求体（JSON）：**

```json
{
  "path": "/tmp/report.docx"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | 是 | 服务器上的文件绝对路径 |

#### 响应

```json
{
  "data": {
    "markdown": "## Sheet 1\n\n| Name | Age | City |\n|------|-----|------|\n| Alice | 30 | Beijing |"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `data.markdown` | string | 转换后的 Markdown 字符串 |

---

### 2. `POST /api/officeOxide:toHtml`

将 Office 文件转为 HTML。

#### 请求方式一：multipart/form-data（推荐）

**请求头：**

```
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

**表单字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | 原始文件二进制 |

**curl 示例：**

```bash
curl -X POST http://localhost:13000/api/officeOxide:toHtml \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@report.docx"
```

**React 示例：**

```tsx
import { useAPIClient } from '@nocobase/client';

const api = useAPIClient();
const formData = new FormData();
formData.append('file', file);

const res = await api.request({
  method: 'post',
  url: 'officeOxide:toHtml',
  data: formData,
  headers: { 'Content-Type': 'multipart/form-data' },
});

console.log(res.data?.data?.html);
```

#### 请求方式二：Base64 编码

**请求体（JSON）：**

```json
{
  "file": "<base64>",
  "filename": "report.docx"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | string | 是 | 文件内容的 base64 编码 |
| `filename` | string | 是 | 原始文件名（含扩展名，用于判断格式） |

#### 请求方式三：服务器文件路径

**请求体（JSON）：**

```json
{
  "path": "/tmp/report.docx"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | 是 | 服务器上的文件绝对路径 |

#### 响应

```json
{
  "data": {
    "html": "<h2>Sheet 1</h2>\n<table>...</table>"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `data.html` | string | 转换后的 HTML 字符串 |

---

## 合并单元格处理

XLSX/XLS 表格转 Markdown 时，合并单元格在标准 Markdown 中无法表达。本插件采用**复制策略**：将被合并区域的值复制到所有覆盖的单元格中，确保数据不丢失。

> `toHtml` 接口不使用此策略，由浏览器原生的表格渲染自动处理合并单元格。

---

## 依赖说明

本插件依赖 [office-oxide](https://www.npmjs.com/package/office-oxide)，这是一个 Rust 原生库的 Node.js 绑定，通过 [koffi](https://koffi.dev/) 加载 `.node` 原生二进制。因此：

- `office-oxide` 已在构建配置中标记为 `external`，**不会被打包进 `dist/node_modules`**。
- 部署时需确保 `office-oxide` 作为运行时依赖存在于 `node_modules` 中（`yarn install` 即可）。
- `office-oxide` 自带 Windows / Linux / macOS 的预编译二进制，无需 `node-gyp`。

相关构建配置见 `packages/core/build/src/buildPlugin.ts` 中的 `external` 列表。
