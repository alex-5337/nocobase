# @my-project/plugin-template-print

在线设计 Word / Excel 模板，并基于 NocoBase 数据表记录生成可下载文档。

## 功能概述

- **模板管理**：在插件设置页中创建、编辑、启用/禁用、删除打印模板。
- **Word 模板**：使用富文本编辑器（支持表格）设计模板，通过 `{字段路径}` 占位符填充数据，生成 `.docx`，支持：
  - 页面设置：纸张大小（含自定义尺寸）、方向、页边距；
  - 页眉/页脚：文本、图片、页码（`{page}` / `{pages}`）、数据变量；
  - 背景图（水印）：拉伸 / 平铺 / 适应 / 裁剪四种显示方式，可调不透明度；
  - 插入二维码（固定值或数据字段）；
  - 自定义字体（字体白名单管理）。
- **Excel 模板**：电子表格式网格编辑器，单元格支持字段映射、序号、默认值、加粗、公式（SUM / AVERAGE / COUNT / MAX / MIN / IF / CONCATENATE），以及数组字段的浮动扩展（向下 / 向右），生成 `.xlsx`。
- **批量打印**：在数据详情页或表格页选择模板，支持单条记录下载或多条记录打包为 ZIP 下载。

## 安装与部署

插件名：`@my-project/plugin-template-print`（私有插件，不发布到 npm，需源码构建或离线安装）。

### 方式一：源码构建（本仓库内）

在 NocoBase 源码仓库（monorepo）中：

```bash
# 1. 构建插件，生成 dist 产物
yarn build @my-project/plugin-template-print

# 2. 启用插件
yarn pm enable @my-project/plugin-template-print
```

启用后进入 **插件设置 → 模板打印** 即可使用。

> 提示：若构建在生成 `.d.ts` 阶段报 `Property 'db' does not exist` 之类的类型错误，通常是某个 `@nocobase/*` core 包的 `lib/*.d.ts` 缺失所致。可改用仓库根目录的脚本自动补齐缺失类型并构建：
>
> ```bash
> node scripts/build-plugin-with-deps.js @my-project/plugin-template-print
> ```

### 方式二：打包离线分发（部署到其他 NocoBase 实例）

在源码仓库中构建并打包为 tgz：

```bash
# 1. 构建插件（生成 dist）
yarn build @my-project/plugin-template-print

# 2. 打包（复用 dist，生成 tgz 到 storage/tar/）
yarn nocobase-build @my-project/plugin-template-print --only-tar
```

产物路径：`storage/tar/@my-project/plugin-template-print-2.1.19.tgz`（其中 `@my-project` 为子目录，文件名为 `<包名>-<版本号>.tgz`）。

在目标 NocoBase 应用目录中离线安装：

```bash
# 1. 将 tgz 拷贝到目标应用目录（例如 ./plugins/ 下）

# 2. 安装插件（从本地文件安装）
yarn pm add ./plugin-template-print-2.1.19.tgz

# 3. 启用插件
yarn pm enable @my-project/plugin-template-print
```

> 说明：
> - 插件的运行时依赖（`archiver`、`exceljs`、`html-docx-js`、`jszip`、`qrcode` 等）在构建时已打入 `dist/node_modules`，离线安装无需额外安装依赖。
> - 插件要求 NocoBase 主版本 `2.x`（见 `package.json` 的 `peerDependencies`）。
> - 升级流程：重新构建打包新版 tgz → `yarn pm add` 覆盖安装 → `yarn pm enable` 重新启用。

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
- **页面设置**：工具栏可打开页面设置，配置纸张大小（A4 等或自定义宽高）、方向（纵向/横向）、页边距。
- **页眉/页脚**：支持文本、图片、页码占位符 `{page}` / `{pages}` 及数据变量，可设置对齐、字体、字号、行距，一次配置对整篇文档所有页面生效。
- **背景图（水印）**：上传图片作为页面背景，支持 拉伸/平铺/适应/裁剪 四种显示方式，并可调节不透明度。
- **二维码**：在光标处插入二维码，可绑定固定内容或数据字段值（如 `{contractNo}`），并设置显示宽高。
- **自定义字体**：字体下拉列表来自字体白名单，可在 **插件设置 → 模板打印 → 字体设置** 中维护。

#### 2.2 Excel 模板编辑

Excel 模板采用电子表格式网格编辑器：先设置行列数量，再在单元格中配置内容。

单元格支持：

| 能力 | 说明 |
| --- | --- |
| 文本 / 字段 | 直接输入文本，或用 `{字段路径}`（如 `customer.name`）映射数据字段 |
| 序号 | 标记为序号单元格，按行自动输出序号 |
| 默认值 | 字段为空时使用的兜底值 |
| 公式 | 输入 `=` 开头的公式（SUM / AVERAGE / COUNT / MAX / MIN / IF / CONCATENATE） |
| 加粗 | 设置单元格文字加粗 |
| 浮动方向 | 字段值为数组时纵向扩展（Float Downward）或横向扩展（Float Rightward） |

配置完成后点击 **保存模板**，表格内容会以 JSON 格式保存到模板的 `content` 字段中。

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

插件会创建以下内部数据表：

`printTemplates`（打印模板）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| name | string | 模板名称 |
| type | string | 模板类型：`word` 或 `excel` |
| collectionName | string | 目标数据表 |
| content | text | 模板内容（Word 为 HTML；Excel 为 JSON） |
| variables | json | 变量/默认值配置 |
| pageSettings | json | 页面设置（纸张/方向/边距/页眉页脚/背景图） |
| description | text | 描述 |
| enabled | boolean | 是否启用 |

`printTemplateFonts`（字体白名单，单例记录）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| fontWhitelist | jsonb | 字体白名单数组，如 `["SimSun", "SimHei", "Arial"]` |

## 接口

- `printTemplates:list` — 查询模板列表
- `printTemplates:create` — 创建模板
- `printTemplates:update/{id}` — 更新模板
- `printTemplates:destroy/{id}` — 删除模板
- `printTemplates:render` — 渲染并下载文档
  - 请求体：`{ templateId: number, recordIds: number[], appends?: string[] }`
  - 返回：文件流（`application/octet-stream` 或对应文档 MIME 类型）
- `printTemplateFonts:get` — 读取字体白名单（首次访问自动创建默认白名单）
- `printTemplateFonts:set` — 更新字体白名单（请求体：`{ fontWhitelist: string[] }`）

## 依赖

- `archiver`：多记录 Word 模板打包为 ZIP
- `exceljs`：生成 Excel 文件（含公式、浮动扩展）
- `html-docx-js`：将 HTML 转换为 Word 文档
- `jszip`：docx 二次加工（页眉/页脚/背景图注入）
- `qrcode`：Word 模板二维码生成
- `quill-table-better`：Word 编辑器表格模块
- `react-quill-new`：Word 富文本编辑器
