/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * 模板变量解析与渲染工具。
 *
 * 占位符格式为 {fieldPath}（点分隔字段路径，如 {user.name}）。
 * - 一对多关联字段（hasMany/belongsToMany/belongsToArray）整体作为变量时，
 *   在 Word 模板中渲染为 HTML 表格（表头为关联表字段标题，每行一条关联记录）；
 * - 其他值渲染为纯文本（数组/对象自动格式化为可读文本，HTML 转义）。
 */

/** 关联字段类型集合（与客户端 qrcode-utils 保持一致） */
export const ASSOCIATION_TYPES = new Set(['belongsTo', 'hasOne', 'hasMany', 'belongsToMany', 'belongsToArray']);

/** 一对多关联字段类型（整体插入变量时渲染为表格） */
export const TO_MANY_TYPES = new Set(['hasMany', 'belongsToMany', 'belongsToArray']);

/** 保留占位符：由页眉/页脚模块处理（页码域），不作为数据字段替换 */
export const RESERVED_PLACEHOLDERS = new Set(['page', 'pages']);

/** 一对多表格中不展示的系统/元数据字段 */
const TABLE_EXCLUDED_FIELD_NAMES = new Set([
  'id',
  'sort',
  'createdAt',
  'updatedAt',
  'createdById',
  'updatedById',
  'createdBy',
  'updatedBy',
]);

/** 对象值转文本时的常见标题字段名（按优先级取第一个可用值） */
const LABEL_KEYS = ['name', 'title', 'label', 'nickname', 'value', 'text'];

/** 表格列定义（name 为字段名，title 为展示标题） */
export interface TableColumn {
  name: string;
  title: string;
}

/** 字段配置（结构化子集，用于关联路径推导与表格列构建） */
export interface PrintFieldOptions {
  name: string;
  type?: string;
  target?: string;
  interface?: string;
  hidden?: boolean;
  sort?: number;
  uiSchema?: { title?: string };
}

/** 按数据表名获取字段配置列表 */
export type CollectionFieldsGetter = (collectionName: string) => PrintFieldOptions[] | undefined;

/** 页眉/页脚配置（结构化子集，用于收集其中的变量路径） */
interface HeaderFooterLike {
  text?: string;
  items?: Array<{ type?: string; text?: string }>;
}

/** 变量替换选项 */
export interface ReplaceVariablesOptions {
  /**
   * 解析一对多字段路径对应的表格列。
   * 返回非空数组时占位符渲染为表格；否则按普通文本渲染。
   */
  getTableColumns?: (fieldPath: string) => TableColumn[];
}

/** HTML 文本转义（用于变量值注入 HTML） */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 从数据对象中根据点分隔的字段路径提取值。
 * 例如 "user.profile.name" 会访问 data.user.profile.name。
 * 路径中途遇到数组时（一对多关联数据），对剩余路径逐元素映射，
 * 例如 data.items 为数组时 "items.name" 返回各元素的 name 组成的数组。
 */
export function extractFieldValue(data: Record<string, unknown>, fieldPath: string): unknown {
  return fieldPath.split('.').reduce((obj: unknown, key: string) => {
    if (obj == null) return undefined;
    if (Array.isArray(obj)) {
      return obj.map((item) =>
        item != null && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined,
      );
    }
    if (typeof obj === 'object') {
      return (obj as Record<string, unknown>)[key];
    }
    return undefined;
  }, data);
}

/**
 * 清理占位符内部内容，得到纯字段路径（去掉可能混入的 HTML 标签与大括号）。
 * 仅接受「标识符以点分隔」形式的合法路径；其余内容（如普通文本）返回空字符串，
 * 表示不是变量占位符、不参与替换。
 */
export function cleanFieldPath(inner: string): string {
  const path = inner
    .replace(/<[^>]*>/g, '')
    .replace(/[{}]/g, '')
    .trim();
  return /^[\w$]+(\.[\w$]+)*$/.test(path) ? path : '';
}

/** 对象转可读文本：优先取常见标题字段，否则 JSON 序列化 */
function getObjectLabel(value: Record<string, unknown>): string {
  for (const key of LABEL_KEYS) {
    const item = value[key];
    if (typeof item === 'string' && item.trim()) return item;
    if (typeof item === 'number') return String(item);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 将任意值格式化为可读文本：
 * - null/undefined → 空字符串
 * - 数组 → 逐项格式化后以 ", " 拼接
 * - 对象 → 取常见标题字段（如 name/title），否则 JSON
 * - 其他 → String()
 */
export function formatDisplayValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => formatDisplayValue(item))
      .filter((item) => item !== '')
      .join(', ');
  }
  if (typeof value === 'object') {
    return getObjectLabel(value as Record<string, unknown>);
  }
  return String(value);
}

/**
 * 将一对多关联记录列表渲染为 HTML 表格。
 * 表头为列标题，每条记录一行；单元格值经格式化与 HTML 转义。
 */
export function buildRelationTableHtml(rows: unknown[], columns: TableColumn[]): string {
  const headerCells = columns.map((column) => `<th>${escapeHtml(column.title)}</th>`).join('');
  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const cellValue =
            row != null && typeof row === 'object' ? (row as Record<string, unknown>)[column.name] : row;
          return `<td>${escapeHtml(formatDisplayValue(cellValue))}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

/** 尝试把字段路径解析为一对多关联的表格（非一对多或无列时返回 null） */
function buildTableForFieldPath(
  fieldPath: string,
  data: Record<string, unknown>,
  getTableColumns: (fieldPath: string) => TableColumn[],
): string | null {
  const value = extractFieldValue(data, fieldPath);
  if (!Array.isArray(value)) return null;
  const columns = getTableColumns(fieldPath);
  if (!columns || columns.length === 0) return null;
  return buildRelationTableHtml(
    value.filter((item) => item != null),
    columns,
  );
}

/**
 * 替换 HTML 模板中的 {fieldPath} 变量占位符。
 * 支持跨 HTML 标签内部的字段路径匹配。
 *
 * 一对多字段渲染规则（需提供 options.getTableColumns）：
 * - 占位符独占一个块级元素（p/div/li/h1-h6）时，整个元素替换为表格，
 *   避免 <table> 嵌套在 <p> 内产生非法结构；
 * - 其他情况就地替换为表格 HTML。
 *
 * @param html - 模板 HTML 字符串
 * @param data - 数据对象
 * @param options - 可选配置（表格列解析器）
 * @returns 替换后的 HTML 字符串
 */
export function replaceVariables(
  html: string,
  data: Record<string, unknown>,
  options?: ReplaceVariablesOptions,
): string {
  const getTableColumns = options?.getTableColumns;
  const renderText = (fieldPath: string): string => escapeHtml(formatDisplayValue(extractFieldValue(data, fieldPath)));

  /** 替换单个 {…} 占位符（保留非法路径与页码占位符） */
  const substitutePlaceholder = (placeholder: string): string => {
    const fieldPath = cleanFieldPath(placeholder.slice(1, -1));
    if (!fieldPath || RESERVED_PLACEHOLDERS.has(fieldPath)) return placeholder;
    if (getTableColumns) {
      const tableHtml = buildTableForFieldPath(fieldPath, data, getTableColumns);
      if (tableHtml) return tableHtml;
    }
    return renderText(fieldPath);
  };

  // 单个正则同时匹配「占位符独占块级元素」与「普通占位符」，
  // 一次遍历完成替换，避免先插入的表格 HTML 被再次扫描误匹配
  const combined = /<(p|div|li|h[1-6])(\s[^>]*)?>\s*\{([\s\S]*?)\}\s*<\/\1>|\{([\s\S]*?)\}/gi;
  return html.replace(combined, (match, blockTag: string, _attrs: string, blockInner: string) => {
    if (!blockTag) {
      // 普通行内占位符
      return substitutePlaceholder(match);
    }

    // 块级元素被单个占位符独占：一对多字段时整个元素替换为表格，
    // 避免 <table> 嵌套在 <p> 内产生非法结构
    const fieldPath = cleanFieldPath(blockInner);
    if (fieldPath && !RESERVED_PLACEHOLDERS.has(fieldPath)) {
      if (getTableColumns) {
        const tableHtml = buildTableForFieldPath(fieldPath, data, getTableColumns);
        if (tableHtml) return tableHtml;
      }
      // 非表格值：保留原元素，仅替换其中的占位符（函数式替换避免 $ 特殊字符问题）
      return match.replace(/\{[\s\S]*?\}/, () => renderText(fieldPath));
    }

    // 块内是多个占位符或非法路径：逐个处理其中的占位符
    return match.replace(/\{[\s\S]*?\}/g, (placeholder) => substitutePlaceholder(placeholder));
  });
}

/**
 * 从 SVG <desc> 文本中解码二维码配置。
 * 格式: qrcode:valueType:value:width:height
 */
export function decodeQrcodeDesc(
  descText: string,
): { valueType: string; value: string; width: number; height: number } | null {
  if (!descText) return null;
  const idx = descText.indexOf('qrcode:');
  if (idx === -1) return null;
  const parts = descText.slice(idx).split(':');
  if (parts.length < 5) return null;
  const width = parseInt(parts[parts.length - 2], 10);
  const height = parseInt(parts[parts.length - 1], 10);
  if (isNaN(width) || isNaN(height)) return null;
  // 值可能包含冒号，所以将中间部分重新拼接
  const value = parts.slice(2, -2).join(':');
  return { valueType: parts[1], value, width, height };
}

/**
 * 收集模板中用到的所有字段路径，用于计算需要预加载的关联字段（appends）。
 * 来源包括：模板正文占位符、页眉/页脚文本占位符、二维码占位符（字段类型值）。
 */
export function collectTemplateFieldPaths(
  templateContent: string,
  pageSettings?: { header?: HeaderFooterLike; footer?: HeaderFooterLike },
): string[] {
  const paths = new Set<string>();

  const addFromText = (text?: string) => {
    if (!text) return;
    const re = /{([\s\S]*?)}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const path = cleanFieldPath(match[1]);
      if (path && !RESERVED_PLACEHOLDERS.has(path)) {
        paths.add(path);
      }
    }
  };

  addFromText(templateContent);

  for (const cfg of [pageSettings?.header, pageSettings?.footer]) {
    if (!cfg) continue;
    if (Array.isArray(cfg.items) && cfg.items.length > 0) {
      for (const item of cfg.items) {
        if (item?.type === 'text') addFromText(item.text);
      }
    } else {
      addFromText(cfg.text);
    }
  }

  // 二维码占位符：字段类型的值同样需要预加载关联数据
  const imgRegex = /<img\s+src="data:image\/svg\+xml,([^"]*)"/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgRegex.exec(templateContent))) {
    try {
      const svgText = decodeURIComponent(imgMatch[1]);
      const descMatch = /<desc>([\s\S]*?)<\/desc>/i.exec(svgText);
      if (!descMatch) continue;
      const config = decodeQrcodeDesc(descMatch[1]);
      if (config && config.valueType === 'field' && config.value) {
        paths.add(config.value);
      }
    } catch {
      // 解码失败的占位符跳过
    }
  }

  return Array.from(paths);
}

/**
 * 计算字段路径需要预加载（append）的关联路径。
 * 沿路径逐级向下：遇到关联字段继续进入目标表；
 * 返回最深的关联前缀路径（路径本身是关联字段时返回完整路径）。
 * 无需预加载（纯本表字段）时返回 null。
 *
 * 例如：items → "items"；items.name → "items"；user.profile.name → "user.profile"
 */
export function findRelationAppend(
  getCollectionFields: CollectionFieldsGetter,
  baseCollectionName: string,
  fieldPath: string,
): string | null {
  const segments = fieldPath.split('.');
  let collectionName = baseCollectionName;
  const assocSegments: string[] = [];

  for (const segment of segments) {
    const field = getCollectionFields(collectionName)?.find((item) => item.name === segment);
    // 字段不存在：若已进入过关联路径，仍需预加载该关联（子字段可能来自动态字段等场景）
    if (!field) return assocSegments.length > 0 ? assocSegments.join('.') : null;
    if (!ASSOCIATION_TYPES.has(field.type || '')) {
      return assocSegments.length > 0 ? assocSegments.join('.') : null;
    }
    assocSegments.push(segment);
    if (!field.target) return null;
    collectionName = field.target;
  }

  return assocSegments.length > 0 ? assocSegments.join('.') : null;
}

/** 去除标题中的 i18n 模板包装（如 {{t("Name")}} → Name） */
function getPlainTitle(title?: string): string {
  if (!title) return '';
  return title.replace(/\{\{t\((['"])(.*?)\1\)\}\}/g, '$2');
}

/**
 * 从字段配置列表构建一对多表格的列：
 * 与客户端变量选择器口径一致——有界面组件且未隐藏的字段；
 * 排除关联字段（避免表格单元格嵌套对象）与系统字段；按 sort 排序。
 */
export function buildTableColumns(fields: PrintFieldOptions[]): TableColumn[] {
  return fields
    .filter(
      (field) =>
        field.interface &&
        !field.hidden &&
        !ASSOCIATION_TYPES.has(field.type || '') &&
        !TABLE_EXCLUDED_FIELD_NAMES.has(field.name),
    )
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((field) => ({ name: field.name, title: getPlainTitle(field.uiSchema?.title) || field.name }));
}

/**
 * 解析字段路径对应的表格列。
 * 仅当整条路径均为关联字段且最后一级为一对多关联时，
 * 返回其目标表中可展示的字段列；否则返回空数组。
 */
export function getToManyRelationTableColumns(
  getCollectionFields: CollectionFieldsGetter,
  baseCollectionName: string,
  fieldPath: string,
): TableColumn[] {
  const segments = fieldPath.split('.');
  let collectionName = baseCollectionName;
  let lastField: PrintFieldOptions | undefined;

  for (const segment of segments) {
    const field = getCollectionFields(collectionName)?.find((item) => item.name === segment);
    if (!field || !ASSOCIATION_TYPES.has(field.type || '') || !field.target) return [];
    lastField = field;
    collectionName = field.target;
  }

  if (!lastField || !TO_MANY_TYPES.has(lastField.type || '')) return [];
  return buildTableColumns(getCollectionFields(collectionName) || []);
}

// ============================================================
// 一对多可编辑表格（repeat table）渲染
// ============================================================

/**
 * 一对多可编辑表格的标记 class。
 * 客户端在模板中插入真实表格时写入这些 class（quill-table-better 会保留 table 的 class），
 * 服务端据此识别"按关联记录重复的行/列"，其余普通表格不做展开。
 */
export const REPEAT_TABLE_CLASS = 'ql-print-repeat';
export const REPEAT_RIGHTWARD_CLASS = 'ql-print-repeat-rightward';

/**
 * 剥离 quill-table-better 残留的 <temporary> 暂存元素。
 *
 * 背景：插入表格时 quill-table-better 会把当前光标所在块的内容暂存进 <temporary>
 * （例如二维码图片），正常流程中该元素会被库移除，但存在残留并随 innerHTML 保存的情况。
 * 编辑器内 .ql-table-temporary{display:none} 使其不可见，而 Word 打印（不识别该 CSS）时
 * 会把暂存内容渲染在表格内部，导致与表格内容重叠/遮盖。
 * 与 quill 官方 getCopyTable 的处理一致：直接删除 <temporary>...</temporary>。
 */
export function stripTemporaryTags(html: string): string {
  return html.replace(/<temporary\b[^>]*>[\s\S]*?<\/temporary>/gi, '');
}

/** 表格行结构（保留原始开标签与内容） */
interface RepeatRow {
  open: string;
  content: string;
}

/** 表格单元格结构 */
interface RepeatCell {
  tag: string;
  attrs: string;
  body: string;
}

/** 转义重复表格单元格值：HTML 转义 + 花括号转实体，避免展开后的值与模板占位符混淆 */
function escapeRepeatCellValue(value: unknown): string {
  return escapeHtml(formatDisplayValue(value)).replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
}

/**
 * 构造「字段路径指向 item」的嵌套数据对象，供单元格变量替换使用。
 * 例如 path=items 时返回 { ...data, items: item }；
 * path=user.items 时返回 { ...data, user: { ...data.user, items: item } }。
 */
function buildRepeatItemData(data: Record<string, unknown>, path: string, item: unknown): Record<string, unknown> {
  const segments = path.split('.');
  const result: Record<string, unknown> = { ...data };
  let current = result;
  for (let i = 0; i < segments.length - 1; i++) {
    const existing = current[segments[i]];
    const next =
      existing != null && typeof existing === 'object' && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
    current[segments[i]] = next;
    current = next;
  }
  current[segments[segments.length - 1]] = item;
  return result;
}

/** 判断内容中是否含有「{toManyPath.xxx}」形式的重复单元格变量 */
function hasRepeatVariable(content: string, toManyPath: string): boolean {
  const escaped = toManyPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\{${escaped}\\.`).test(content);
}

/** 从表格中解析所有行（保留行开标签与内容） */
function parseRepeatRows(inner: string): RepeatRow[] {
  const rows: RepeatRow[] = [];
  const re = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    rows.push({ open: `<tr${m[1]}>`, content: m[2] });
  }
  return rows;
}

/** 解析一行中的单元格 */
function parseRepeatCells(rowContent: string): RepeatCell[] {
  const cells: RepeatCell[] = [];
  const re = /<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowContent))) {
    cells.push({ tag: m[1], attrs: m[2], body: m[3] });
  }
  return cells;
}

/** 替换单元格中的 {toManyPath.field} 变量（item 为单条关联记录） */
function fillRepeatCell(cellContent: string, itemData: Record<string, unknown>): string {
  return cellContent.replace(/{([\s\S]*?)}/g, (placeholder, inner: string) => {
    const path = cleanFieldPath(inner);
    if (!path || RESERVED_PLACEHOLDERS.has(path)) return placeholder;
    return escapeRepeatCellValue(extractFieldValue(itemData, path));
  });
}

/**
 * 从表格变量中推导重复的一对多字段路径。
 * 单元格变量格式为 {toManyPath.subField}，所有变量的父路径应一致；
 * 不一致或不存在时返回 null（视为普通表格）。
 */
function findRepeatToManyPath(rows: RepeatRow[]): string | null {
  const candidates = new Set<string>();
  for (const row of rows) {
    const re = /{([\s\S]*?)}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(row.content))) {
      const path = cleanFieldPath(m[1]);
      if (!path) continue;
      const segments = path.split('.');
      if (segments.length >= 2) {
        candidates.add(segments.slice(0, -1).join('.'));
      }
    }
  }
  return candidates.size === 1 ? Array.from(candidates)[0] : null;
}

/** 从 table 开标签属性中移除重复表格标记 class（避免影响 Word 输出） */
function removeRepeatMarkerClasses(attrs: string): string {
  return attrs.replace(/\sclass="([^"]*)"/gi, (_m, cls: string) => {
    const clean = cls
      .replace(new RegExp(`\\b${REPEAT_RIGHTWARD_CLASS}\\b`, 'g'), '')
      .replace(new RegExp(`\\b${REPEAT_TABLE_CLASS}\\b`, 'g'), '')
      .replace(/\s+/g, ' ')
      .trim();
    return clean ? ` class="${clean}"` : '';
  });
}

/**
 * 展开模板中的「一对多可编辑表格」：
 * 识别带有 REPEAT_TABLE_CLASS 标记的 <table>，按浮动方向展开关联记录：
 * - downward（默认）：含 {items.xxx} 变量的数据行按记录重复（表头行保留一次）；
 * - rightward：每行中含 {items.xxx} 变量的数据单元格按记录重复一列（表头列保留一次）。
 *
 * 展开时保留表格的 thead/tbody 等结构（仅就地替换行/单元格内容）。
 * 展开后移除标记 class；单元格值经 HTML 转义（花括号转实体，避免与后续变量替换混淆）。
 * 展开时机必须在 replaceVariables 之前（否则单元格中的 {items.xxx} 会被整体格式化）。
 *
 * @param html - 模板 HTML
 * @param data - 数据记录
 * @returns 展开后的 HTML
 */
export function expandRepeatTables(html: string, data: Record<string, unknown>): string {
  return html.replace(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi, (match, attrs: string, inner: string) => {
    if (!new RegExp(`\\b${REPEAT_TABLE_CLASS}\\b`).test(attrs)) return match;

    const rows = parseRepeatRows(inner);
    if (rows.length === 0) return match;

    const toManyPath = findRepeatToManyPath(rows);
    if (!toManyPath) return match;

    const items = extractFieldValue(data, toManyPath);
    if (!Array.isArray(items)) return match;

    const isRightward = new RegExp(`\\b${REPEAT_RIGHTWARD_CLASS}\\b`).test(attrs);

    // 在 original（原行/原单元格序列）位置替换为 expansion，就地展开，保留 thead/tbody 结构
    const applyReplacements = (original: string, replacements: { original: string; replacement: string }[]) => {
      let out = original;
      for (const item of replacements) {
        out = out.replace(item.original, item.replacement);
      }
      return out;
    };

    let expandedInner = inner;
    const rowReplacements: { original: string; replacement: string }[] = [];
    const rowRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(inner))) {
      const rowOpen = m[0];
      const rowAttrs = m[1];
      const rowContent = m[2];

      if (isRightward) {
        // 向右浮动：行内数据单元格按记录重复一列（表头列保留）
        const cells = parseRepeatCells(rowContent);
        const dataCells = cells.filter((cell) => hasRepeatVariable(cell.body, toManyPath));
        if (dataCells.length === 0) continue;
        const labelCells = cells.filter((cell) => !hasRepeatVariable(cell.body, toManyPath));
        const parts = labelCells.map((cell) => `<${cell.tag}${cell.attrs}>${cell.body}</${cell.tag}>`);
        for (const item of items) {
          const itemData = buildRepeatItemData(data, toManyPath, item);
          for (const cell of dataCells) {
            parts.push(`<${cell.tag}${cell.attrs}>${fillRepeatCell(cell.body, itemData)}</${cell.tag}>`);
          }
        }
        rowReplacements.push({
          original: rowOpen,
          replacement: `<tr${rowAttrs}>${parts.join('')}</tr>`,
        });
      } else if (hasRepeatVariable(rowContent, toManyPath)) {
        // 向下浮动：数据行按记录重复（表头行保留原位）
        const expandedRows = items
          .map((item) => {
            const itemData = buildRepeatItemData(data, toManyPath, item);
            return `<tr${rowAttrs}>${fillRepeatCell(rowContent, itemData)}</tr>`;
          })
          .join('');
        rowReplacements.push({ original: rowOpen, replacement: expandedRows });
      }
    }
    expandedInner = applyReplacements(inner, rowReplacements);

    return `<table${removeRepeatMarkerClasses(attrs)}>${expandedInner}</table>`;
  });
}
