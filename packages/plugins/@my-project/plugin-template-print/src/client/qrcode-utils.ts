/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { QrcodeConfig } from './QrcodeInsertModal';
// @ts-ignore
import QRCode from 'qrcode';
import type { DefaultOptionType } from 'antd/es/cascader';

/**
 * 二维码配置描述前缀，用于在 SVG <desc> 元素中标识二维码配置
 */
export const QRCODE_DESC_PREFIX = 'qrcode:';

/**
 * 占位符二维码的固定文本
 */
const PLACEHOLDER_TEXT = 'QRCODE';

/**
 * 关联字段类型集合，用于判断字段是否为关联字段（可展开子级）
 */
const ASSOCIATION_TYPES = new Set(['belongsTo', 'hasOne', 'hasMany', 'belongsToMany', 'belongsToArray']);

/**
 * 一对多关联字段类型集合。
 * 一对多字段作为叶子节点可直接选中：插入 Word 模板时整体作为变量，打印渲染为表格。
 */
const TO_MANY_TYPES = new Set(['hasMany', 'belongsToMany', 'belongsToArray']);

/**
 * 级联选项类型：额外携带一对多字段元数据，
 * 供选择器判断选中后应插入变量还是打开一对多表格弹窗。
 */
export interface FieldOption extends DefaultOptionType {
  fieldMeta?: { isToMany: boolean; target?: string };
}

/**
 * 字段树最大递归深度，防止循环关联导致无限递归
 */
const MAX_DEPTH = 4;

/**
 * 递归构建字段选项树，用于 Cascader 级联选择器。
 * getCollectionFields 是同步方法（从内存缓存读取），因此直接递归构建是安全的，
 * 且避免了 Cascader loadData 动态加载带来的闪烁问题。
 *
 * @param collectionName - 数据表名称
 * @param getCollectionFields - 获取数据表字段列表的函数
 * @param compile - 编译字段标题的函数
 * @param depth - 当前递归深度
 * @returns Cascader 选项树
 */
export function buildFieldOptionsTree(
  collectionName: string,
  getCollectionFields: (name: string) => any[],
  compile: (val: any) => string,
  depth = 0,
): DefaultOptionType[] {
  // 超过最大深度或没有数据表名称时返回空数组
  if (depth >= MAX_DEPTH || !collectionName) return [];

  // 获取当前数据表的字段列表
  const fields = getCollectionFields(collectionName);
  if (!fields?.length) return [];

  return (
    fields
      // 过滤：只显示有 interface 且非隐藏的字段
      .filter((field) => field.interface && !field.hidden)
      .map((field) => {
        // 判断是否为关联字段
        const isAssociation = ASSOCIATION_TYPES.has(field.type);
        const isToMany = TO_MANY_TYPES.has(field.type);
        const option: FieldOption = {
          value: field.name,
          label: compile(field.uiSchema?.title || field.name),
          // 一对多字段是叶子节点（整体插入、打印为表格）；其余关联字段可继续展开子级
          isLeaf: !isAssociation || isToMany,
        };
        // 携带一对多元数据：选中后客户端可据此打开「一对多表格」弹窗
        if (isToMany) {
          option.fieldMeta = { isToMany: true, target: field.target };
        }
        // 一对多以外的关联字段（多对一/一对一）递归构建子级选项
        if (isAssociation && !isToMany && field.target) {
          const children = buildFieldOptionsTree(field.target, getCollectionFields, compile, depth + 1);
          if (children.length > 0) {
            option.children = children;
          }
        }
        return option;
      })
  );
}

/**
 * 将二维码配置编码为存储格式的字符串。
 * 格式: qrcode:valueType:value:width:height
 *
 * @param config - 二维码配置对象
 * @returns 编码后的配置字符串
 */
export function encodeQrcodeConfig(config: QrcodeConfig): string {
  return `qrcode:${config.valueType}:${config.value}:${config.width}:${config.height}`;
}

/**
 * 从文本中解码二维码配置（例如从 SVG <desc> 中读取）。
 * 如果不是有效的二维码配置则返回 null。
 *
 * @param text - 包含配置信息的文本
 * @returns 解码后的配置对象，或 null
 */
export function decodeQrcodeConfig(text: string): QrcodeConfig | null {
  if (!text) return null;

  const idx = text.indexOf(QRCODE_DESC_PREFIX);
  if (idx === -1) return null;

  const parts = text.slice(idx).split(':');
  if (parts.length < 5) return null;

  const valueType = parts[1] as 'constant' | 'field';
  const width = parseInt(parts[parts.length - 2], 10);
  const height = parseInt(parts[parts.length - 1], 10);
  if (isNaN(width) || isNaN(height)) return null;

  // 值可能包含冒号，所以需要将中间部分重新拼接
  const value = parts.slice(2, -2).join(':');
  return { valueType, value, width, height };
}

/**
 * 从 <img> 元素（二维码占位符）中提取配置，
 * 通过解码其 SVG data URI 的 src 属性获取。
 *
 * @param el - 二维码占位符 img 元素
 * @returns 解码后的配置对象，或 null
 */
export function getConfigFromImg(el: HTMLImageElement): QrcodeConfig | null {
  const src = el.getAttribute('src') || '';
  const m = /<desc>([\s\S]*?)<\/desc>/i.exec(src);
  if (!m) return null;
  return decodeQrcodeConfig(m[1]);
}

/**
 * 生成二维码占位符 <img> 元素的 HTML 字符串。
 * 使用一个真实二维码（内容为 "QRCODE"）作为视觉占位符，
 * 同时将实际配置嵌入 SVG <desc> 元素中以便后续识别和替换。
 *
 * @param config - 二维码配置对象
 * @returns 包含占位符 img 标签的 HTML 字符串
 */
export async function generateQrcodePlaceholderHTML(config: QrcodeConfig): Promise<string> {
  const cfg = encodeQrcodeConfig(config);

  // 使用固定的占位文本生成真实二维码 SVG
  const svgString = await QRCode.toString(PLACEHOLDER_TEXT, {
    type: 'svg',
    width: config.width,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });

  // 将实际配置通过 <desc> 注入到生成的 SVG 中
  const svgWithConfig = svgString.replace(/<svg([^>]*)>/, `<svg$1><desc>${cfg}</desc>`);
  const dataUri = `data:image/svg+xml,${encodeURIComponent(svgWithConfig)}`;

  return `<img src="${dataUri}" style="width:${config.width}px;height:${config.height}px;display:inline-block;vertical-align:middle;margin:2px;" />`;
}

/**
 * 二维码工具栏按钮的 SVG 图标（源自 Lucide，MIT 协议）
 */
export const QRCODE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect width="5" height="5" x="3" y="3" rx="1"/>
  <rect width="5" height="5" x="16" y="3" rx="1"/>
  <rect width="5" height="5" x="3" y="16" rx="1"/>
  <path d="M21 16h-3a2 2 0 0 0-2 2v3"/>
  <path d="M21 21v.01"/>
  <path d="M12 7v3a2 2 0 0 1-2 2H7"/>
  <path d="M3 12h.01"/>
  <path d="M12 3h.01"/>
  <path d="M12 16v.01"/>
  <path d="M16 12h1"/>
  <path d="M21 12v.01"/>
  <path d="M12 21v-1"/>
</svg>`;
