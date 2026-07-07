# @my-project/plugin-template-print

在线设计 Word / Excel 模板，并基于 NocoBase 数据表记录生成可下载文档。

## 功能概述

- **模板管理**：在插件设置页中创建、编辑、启用/禁用、删除打印模板。
- **Word 模板**：使用富文本编辑器设计模板，通过 `{字段路径}` 占位符填充数据，生成 `.docx`。
- **Excel 模板**：配置列与数据字段的映射关系，生成 `.xlsx`。
- **批量打印**：在数据详情页或表格页选择模板，支持单条记录下载或多条记录打包为 ZIP 下载。

## 使用说明

### 1. 进入模板管理

进入系统 **插件设置** → **模板打印** → **模板管理**，即可查看和维护所有模板。

### 2. 新建模板

点击 **新建模板**，填写以下信息：

| 字段 | 说明 |
| --- | --- |
| 名称 | 模板名称，用于在打印时识别 |
| 类型 | 选择 **Word 文档** 或 **Excel 表格** |
| 数据表 | 目标数据表标识，例如 `contracts`。模板只能用于匹配的数据表 |
| 描述 | 可选，用于备注模板用途 |
| 启用 | 关闭后该模板不会出现在打印选择列表中 |

#### 2.1 Word 模板编辑

在富文本编辑器中直接排版，使用 `{字段路径}` 插入数据字段。

示例：

```html
<p>客户名称：{customer.name}</p>
<p>合同金额：{amount}</p>
<p>签订日期：{signDate}</p>
```

- 支持多级字段路径，例如 `{customer.name}`、`{order.items.0.name}`。
- 如果字段值为空，会使用模板中配置的默认值（可在 `variables` 中扩展）。

#### 2.2 Excel 模板编辑

在 Excel 模板编辑器中配置列：

| 列类型 | 说明 |
| --- | --- |
| 字段 | 映射到数据字段路径，例如 `customer.name`，并设置列标题、默认值 |
| 序号 | 自动输出当前行序号，无需配置字段路径 |

配置完成后点击 **保存模板**，列定义会以 JSON 格式保存到模板内容中。

### 3. 在页面中使用打印按钮

插件会自动在 **数据详情页** 和 **表格页** 的操作栏中注册 **模板打印** 动作。

操作步骤：

1. 打开包含目标数据表的详情页或表格页。
2. 点击 **模板打印** 按钮。
3. 在弹窗中选择已启用的模板。
4. 点击 **生成并下载**。

### 4. 下载规则

- **Word 模板 + 单条记录**：下载 `.docx`，文件名为 `{模板名}_{记录ID}.docx`。
- **Word 模板 + 多条记录**：将每个记录生成的 `.docx` 打包为 ZIP，文件名为 `{模板名}_records.zip`。
- **Excel 模板**：直接下载 `.xlsx`，文件名为 `{模板名}.xlsx`。

## 数据模型

插件会创建一个内部数据表 `printTemplates`，字段如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| name | string | 模板名称 |
| type | string | 模板类型：`word` 或 `excel` |
| collectionName | string | 目标数据表 |
| content | text | 模板内容（Word 为 HTML；Excel 为 JSON） |
| variables | json | 变量/默认值配置 |
| description | text | 描述 |
| enabled | boolean | 是否启用 |

## 接口

- `printTemplates:list` — 查询模板列表
- `printTemplates:create` — 创建模板
- `printTemplates:update/{id}` — 更新模板
- `printTemplates:destroy/{id}` — 删除模板
- `printTemplates:render` — 渲染并下载文档
  - 请求体：`{ templateId: number, recordIds: number[], appends?: string[] }`
  - 返回：文件流（`application/octet-stream` 或对应文档 MIME 类型）

## 依赖

- `archiver`：多记录 Word 模板打包为 ZIP
- `exceljs`：生成 Excel 文件
- `html-docx-js`：将 HTML 转换为 Word 文档
- `handlebars`：Word 模板变量替换
