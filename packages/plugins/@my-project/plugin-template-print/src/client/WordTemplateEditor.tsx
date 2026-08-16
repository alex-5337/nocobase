/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Button, Form } from 'antd';
import {
  FullscreenOutlined,
  FullscreenExitOutlined,
  LeftOutlined,
  RightOutlined,
  PlusOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import ReactQuill from 'react-quill-new';
import Quill from 'quill';
import QuillTableBetter from 'quill-table-better';
import 'react-quill-new/dist/quill.snow.css';
import 'quill-table-better/dist/quill-table-better.css';
import { useTranslation } from 'react-i18next';
import { useAPIClient } from '@nocobase/client';
import { NAMESPACE } from './locale';
import { CollectionFieldPicker, InsertFieldMeta } from './CollectionFieldPicker';
import { QrcodeInsertModal, type QrcodeConfig } from './QrcodeInsertModal';
import { generateQrcodePlaceholderHTML, getConfigFromImg, QRCODE_ICON_SVG } from './qrcode-utils';
import { ToManyTableModal, buildRepeatTableHtml, type ToManyTableConfig } from './ToManyTableModal';
import { registerFonts, DEFAULT_FONTS } from './font-utils';
import {
  registerSizes,
  registerLineHeights,
  FONT_SIZES,
  FONT_SIZE_LABELS,
  LINE_HEIGHTS,
  LINE_HEIGHT_ICON_SVG,
  HEADING_SIZE_MAP,
  DEFAULT_BODY_SIZE,
} from './quill-formats';

// 注册 quill-table-better 模块
Quill.register({ 'modules/table-better': QuillTableBetter }, true);

// 注册默认字体白名单（模块加载时执行），确保首次渲染就有可用字体
registerFonts(DEFAULT_FONTS);
// 注册字体大小和行间距格式
registerSizes();
registerLineHeights();

/**
 * 剥离 quill-table-better 残留的 <temporary> 暂存元素（与 quill 官方 getCopyTable 一致，直接删除）。
 * 编辑器内 .ql-table-temporary{display:none} 使其内容不可见，但保存后 Word 打印时不识别该 CSS，
 * 会把暂存内容（如二维码图片）渲染在表格内部，导致内容重叠/遮盖。
 */
const TEMPORARY_TAG_RE = /<temporary\b[^>]*>[\s\S]*?<\/temporary>/gi;
const stripTemporaryTags = (html: string) => html.replace(TEMPORARY_TAG_RE, '');

/**
 * 注册一个虚拟 blot，使 Quill 工具栏将 'qrcode' 识别为已知格式，
 * 从而不会将二维码按钮置灰（disabled）。
 */
const Embed = Quill.import('blots/embed') as any;
class QrcodeFormatBlot extends Embed {
  static blotName = 'qrcode';
  static tagName = 'span';
}
Quill.register(QrcodeFormatBlot);

/**
 * 根据浏览器语言获取 quill-table-better 的本地化语言标识
 */
function getTableLanguage(): string {
  if (typeof navigator === 'undefined') return 'en_US';
  const lang = navigator.language;
  if (/\b(Hant|TW|HK|MO)\b/i.test(lang)) return 'zh_TW';
  if (lang.startsWith('zh')) return 'zh_CN';
  return 'en_US';
}

/** quill-table-better 模块配置 */
const TABLE_MODULE_CONFIG = {
  language: getTableLanguage(),
  menus: ['column', 'row', 'merge', 'table', 'cell', 'wrap', 'copy', 'delete'],
  toolbarTable: true,
};

interface DeltaOp {
  insert?: unknown;
  attributes?: Record<string, unknown>;
}

/**
 * 为缺少字号属性的文本 op 补充正文默认字号（小四），
 * 保证编辑器内容中不存在无字号的文本。
 */
function fillDefaultFontSize(delta: { ops?: DeltaOp[] }): void {
  if (!delta?.ops) return;
  delta.ops = delta.ops.map((op) => {
    if (typeof op.insert === 'string' && !op.insert.includes('\n') && !op.attributes?.size) {
      return { ...op, attributes: { ...op.attributes, size: DEFAULT_BODY_SIZE } };
    }
    return op;
  });
}

/** 页间分页符（用于拼接/拆分多页 HTML） */
const PAGE_BREAK = '<p style="page-break-before:always"></p>';

/** Quill snow 默认文字/背景颜色（手写共享工具栏时需显式列出，Quill 才生成色板） */
const QUILL_COLORS = [
  '#000000',
  '#e60000',
  '#ff9900',
  '#ffff00',
  '#008a00',
  '#0066cc',
  '#9933ff',
  '#ffffff',
  '#facccc',
  '#ffebcc',
  '#ffffcc',
  '#cce8cc',
  '#cce0f5',
  '#ebd6ff',
  '#bbbbbb',
  '#f06666',
  '#ffc266',
  '#ffff66',
  '#66b966',
  '#66a3e0',
  '#c285ff',
  '#888888',
  '#a10000',
  '#b26b00',
  '#b2b200',
  '#006100',
  '#0047b2',
  '#6b24b2',
  '#444444',
  '#5c0000',
  '#663d00',
  '#666600',
  '#003700',
  '#294966',
  '#631c66',
];

/**
 * WordTemplateEditor 对外暴露的方法
 */
export interface WordTemplateEditorHandle {
  /** 获取编辑器中的完整 HTML 内容（所有页按顺序拼接，页间插入分页符） */
  getHTML: () => string;
}

/**
 * 页眉/页脚片段（与服务端 word-decorations.ts 定义一致）：
 * - text   文本（支持 {字段} 数据变量与 {page}/{pages} 占位符）
 * - image  图片（dataURL，width/height 为显示尺寸 px）
 * - page   当前页码（Word PAGE 域）
 * - pages  总页数（Word NUMPAGES 域）
 * - break  换行
 */
export type HeaderFooterItem =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string; width?: number; height?: number }
  | { type: 'page' }
  | { type: 'pages' }
  | { type: 'break' };

/** 页眉/页脚配置（items 为片段列表；text 为旧版纯文本，仍兼容展示） */
export interface HeaderFooterConfig {
  align?: 'left' | 'center' | 'right';
  items?: HeaderFooterItem[];
  text?: string;
  /** 字体（如 SimSun / Microsoft YaHei） */
  fontFamily?: string;
  /** 字号（pt，与内容编辑器字号体系一致，默认 9 = 小五） */
  fontSize?: number;
  /** 行间距（倍数，如 1.5） */
  lineHeight?: number;
}

/** 页面设置（含页眉/页脚/背景图装饰配置，一次配置所有页面生效） */
export interface PageSettings {
  paperSize?: string;
  orientation?: string;
  customWidth?: number;
  customHeight?: number;
  margins?: { top?: number; bottom?: number; left?: number; right?: number };
  /** 页眉：片段列表（文本/图片/页码）+ 对齐；支持 {field} 变量与 {page}/{pages} 页码占位符 */
  header?: HeaderFooterConfig;
  /** 页脚：同页眉 */
  footer?: HeaderFooterConfig;
  /** 背景图：dataURL + 原始像素尺寸 + 显示方式 + 不透明度（0-100） */
  background?: {
    image?: string;
    width?: number;
    height?: number;
    size?: 'stretch' | 'tile' | 'contain' | 'cover';
    opacity?: number;
  };
}

interface Props {
  /** Ant Design Form 实例 */
  form: any;
  /** 页面设置（纸张大小、方向、边距、页眉页脚、背景图等） */
  pageSettings?: PageSettings;
  /** 切页/新增页/删除页时触发（用于外部自动保存，防止内容丢失） */
  onPageChange?: () => void;
  /** 全屏模式下顶部「确定」按钮回调（不传则全屏不显示按钮） */
  onSave?: () => void;
  /** 全屏模式下顶部「取消」按钮回调（不传则全屏不显示按钮） */
  onCancel?: () => void;
}

/** 纸张尺寸定义（twips），与 server 端保持一致 */
const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  A4: { width: 11906, height: 16838 },
  A3: { width: 16838, height: 23814 },
  Letter: { width: 12240, height: 15840 },
  Legal: { width: 12240, height: 20160 },
  A5: { width: 8392, height: 11906 },
  B5: { width: 9919, height: 14043 },
};

/** 默认边距（twips），1 inch = 1440 twips */
const DEFAULT_MARGINS = { top: 1440, bottom: 1440, left: 1440, right: 1440 };

/**
 * 获取纸张尺寸（twips），支持自定义纸张大小。
 */
function getPaperSizeTwips(pageSettings?: Props['pageSettings']): { width: number; height: number } {
  if (pageSettings?.paperSize === 'Custom') {
    const mmW = pageSettings.customWidth || 210;
    const mmH = pageSettings.customHeight || 297;
    return {
      width: Math.round((mmW / 25.4) * 1440),
      height: Math.round((mmH / 25.4) * 1440),
    };
  }
  const paperSize = pageSettings?.paperSize || 'A4';
  return PAPER_SIZES[paperSize] || PAPER_SIZES.A4;
}

/** 页面像素布局（宽/高/内容区/边距，单位 px） */
interface PageLayout {
  widthPx: number;
  heightPx: number;
  contentWidthPx: number;
  contentHeightPx: number;
  marginHPx: number;
  marginVPx: number;
  marginBPx: number;
}

/**
 * 根据页面设置计算纸张像素布局。
 * 换算：1 inch = 1440 twips = 96 px，即 1 px = 15 twips。
 * 当边距超出纸张大小时自动等比压缩，保证内容区至少占 10%。
 */
function computePageLayout(pageSettings?: Props['pageSettings']): PageLayout {
  const paperSize = getPaperSizeTwips(pageSettings);
  const orientation = pageSettings?.orientation || 'portrait';
  const paperWT = orientation === 'landscape' ? paperSize.height : paperSize.width;
  const paperHT = orientation === 'landscape' ? paperSize.width : paperSize.height;

  let marginL = pageSettings?.margins?.left ?? DEFAULT_MARGINS.left;
  let marginR = pageSettings?.margins?.right ?? DEFAULT_MARGINS.right;
  let marginT = pageSettings?.margins?.top ?? DEFAULT_MARGINS.top;
  let marginB = pageSettings?.margins?.bottom ?? DEFAULT_MARGINS.bottom;

  if (marginL + marginR >= paperWT) {
    const maxPerSide = paperWT * 0.45;
    const ratio = maxPerSide / Math.max(marginL, marginR);
    marginL = Math.round(Math.min(marginL * ratio, maxPerSide));
    marginR = Math.round(Math.min(marginR * ratio, maxPerSide));
  }
  if (marginT + marginB >= paperHT) {
    const maxPerSide = paperHT * 0.45;
    const ratio = maxPerSide / Math.max(marginT, marginB);
    marginT = Math.round(Math.min(marginT * ratio, maxPerSide));
    marginB = Math.round(Math.min(marginB * ratio, maxPerSide));
  }

  const marginHPx = Math.round(marginL / 15);
  const marginVPx = Math.round(marginT / 15);
  const marginBPx = Math.round(marginB / 15);
  return {
    widthPx: Math.round(paperWT / 15),
    heightPx: Math.round(paperHT / 15),
    contentWidthPx: Math.round((paperWT - marginL - marginR) / 15),
    contentHeightPx: Math.round((paperHT - marginT - marginB) / 15),
    marginHPx,
    marginVPx,
    marginBPx,
  };
}

/**
 * 背景图显示方式 → 预览 CSS（与服务端 docx 注入的 DrawingML 逻辑保持一致）。
 * 覆盖整页（含页边距区域），与 Word 页面背景/水印行为一致。
 */
function getBackgroundPreviewStyle(bg: NonNullable<PageSettings['background']>): React.CSSProperties {
  const sizeStyle: React.CSSProperties =
    bg.size === 'tile'
      ? { backgroundRepeat: 'repeat', backgroundSize: 'auto' }
      : bg.size === 'cover'
        ? { backgroundRepeat: 'no-repeat', backgroundSize: 'cover' }
        : bg.size === 'contain'
          ? { backgroundRepeat: 'no-repeat', backgroundSize: 'contain' }
          : { backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%' }; // stretch（默认）
  return {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
    backgroundImage: `url("${bg.image}")`,
    backgroundPosition: 'center',
    opacity: Math.max(0, Math.min(100, bg.opacity ?? 100)) / 100,
    ...sizeStyle,
  };
}

/**
 * Word 模板编辑器。
 *
 * 「每页一个文本框」的简化实现：同一时刻只有一个 Quill 编辑器编辑某一页，
 * 每页内容保存在 pages（HTML 数组）中。页框的 padding 就是页边距，
 * 通过底部页码栏切换/新增/删除页面。切换页面时把当前页内容保存进数组，
 * 再把目标页内容加载进编辑器（即"完成一页后保存、再编辑下一页"）。
 *
 * 相比多 Quill 实例方案，这里只有一个编辑器，工具栏/变量/二维码逻辑
 * 与单编辑器完全一致，稳定且实现简单；分页由页码控制，所见即所得。
 *
 * getHTML 把所有页按顺序拼接，页间插入 Word 分页符，保证打印分页正确。
 */
/** HTML 文本/属性转义（用于构建工具栏 HTML 字符串） */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Quill 官方工具栏按钮图标（SVG 字符串，snow 主题的 .ql-stroke/.ql-fill 样式自动着色高亮） */
const QUILL_ICONS = {
  bold: '<svg viewbox="0 0 18 18"><path class="ql-stroke" d="M5,4H9.5A2.5,2.5,0,0,1,12,6.5v0A2.5,2.5,0,0,1,9.5,9H5A0,0,0,0,1,5,9V4A0,0,0,0,1,5,4Z"></path><path class="ql-stroke" d="M5,9h5.5A2.5,2.5,0,0,1,13,11.5v0A2.5,2.5,0,0,1,10.5,14H5a0,0,0,0,1,0,0V9A0,0,0,0,1,5,9Z"></path></svg>',
  italic:
    '<svg viewbox="0 0 18 18"><line class="ql-stroke" x1="7" x2="13" y1="4" y2="4"></line><line class="ql-stroke" x1="5" x2="11" y1="14" y2="14"></line><line class="ql-stroke" x1="8" x2="10" y1="14" y2="4"></line></svg>',
  underline:
    '<svg viewbox="0 0 18 18"><path class="ql-stroke" d="M5,3V9a4.012,4.012,0,0,0,4,4H9a4.012,4.012,0,0,0,4-4V3"></path><rect class="ql-fill" height="1" rx="0.5" ry="0.5" width="12" x="3" y="15"></rect></svg>',
  strike:
    '<svg viewbox="0 0 18 18"><line class="ql-stroke ql-thin" x1="15.5" x2="2.5" y1="8.5" y2="9.5"></line><path class="ql-fill" d="M9.007,8C6.542,7.791,6,7.519,6,6.5,6,5.792,7.283,5,9,5c1.571,0,2.765.679,2.969,1.309a1,1,0,0,0,1.9-.617C13.356,4.106,11.354,3,9,3,6.2,3,4,4.538,4,6.5a3.2,3.2,0,0,0,.5,1.843Z"></path><path class="ql-fill" d="M8.984,10C11.457,10.208,12,10.479,12,11.5c0,0.708-1.283,1.5-3,1.5-1.571,0-2.765-.679-2.969-1.309a1,1,0,1,0-1.9.617C4.644,13.894,6.646,15,9,15c2.8,0,5-1.538,5-3.5a3.2,3.2,0,0,0-.5-1.843Z"></path></svg>',
  blockquote:
    '<svg viewbox="0 0 18 18"><rect class="ql-fill ql-stroke" height="3" width="3" x="4" y="5"></rect><rect class="ql-fill ql-stroke" height="3" width="3" x="11" y="5"></rect><path class="ql-even ql-fill ql-stroke" d="M7,8c0,4.031-3,5-3,5"></path><path class="ql-even ql-fill ql-stroke" d="M14,8c0,4.031-3,5-3,5"></path></svg>',
  code: '<svg viewbox="0 0 18 18"><polyline class="ql-even ql-stroke" points="5 7 3 9 5 11"></polyline><polyline class="ql-even ql-stroke" points="13 7 15 9 13 11"></polyline><line class="ql-stroke" x1="10" x2="8" y1="5" y2="13"></line></svg>',
  indent:
    '<svg viewbox="0 0 18 18"><line class="ql-stroke" x1="3" x2="15" y1="14" y2="14"></line><line class="ql-stroke" x1="3" x2="15" y1="4" y2="4"></line><line class="ql-stroke" x1="9" x2="15" y1="9" y2="9"></line><polyline class="ql-fill ql-stroke" points="3 7 3 11 5 9 3 7"></polyline></svg>',
  outdent:
    '<svg viewbox="0 0 18 18"><line class="ql-stroke" x1="3" x2="15" y1="14" y2="14"></line><line class="ql-stroke" x1="3" x2="15" y1="4" y2="4"></line><line class="ql-stroke" x1="9" x2="15" y1="9" y2="9"></line><polyline class="ql-stroke" points="5 7 5 11 3 9 5 7"></polyline></svg>',
  listOrdered:
    '<svg viewbox="0 0 18 18"><line class="ql-stroke" x1="7" x2="15" y1="4" y2="4"></line><line class="ql-stroke" x1="7" x2="15" y1="9" y2="9"></line><line class="ql-stroke" x1="7" x2="15" y1="14" y2="14"></line><line class="ql-stroke ql-thin" x1="2.5" x2="4.5" y1="5.5" y2="5.5"></line><path class="ql-fill" d="M3.5,6A0.5,0.5,0,0,1,3,5.5V3.085l-0.276.138A0.5,0.5,0,0,1,2.053,3c-0.124-.247-0.023-0.324.224-0.447l1-.5A0.5,0.5,0,0,1,4,2.5v3A0.5,0.5,0,0,1,3.5,6Z"></path><path class="ql-stroke ql-thin" d="M4.5,10.5h-2c0-.234,1.85-1.076,1.85-2.234A0.959,0.959,0,0,0,2.5,8.156"></path><path class="ql-stroke ql-thin" d="M2.5,14.846a0.959,0.959,0,0,0,1.85-.109A0.7,0.7,0,0,0,3.75,14a0.688,0.688,0,0,0,.6-0.736,0.959,0.959,0,0,0-1.85-.109"></path></svg>',
  listBullet:
    '<svg viewbox="0 0 18 18"><line class="ql-stroke" x1="6" x2="15" y1="4" y2="4"></line><line class="ql-stroke" x1="6" x2="15" y1="9" y2="9"></line><line class="ql-stroke" x1="6" x2="15" y1="14" y2="14"></line><line class="ql-stroke" x1="3" x2="3" y1="4" y2="4"></line><line class="ql-stroke" x1="3" x2="3" y1="9" y2="9"></line><line class="ql-stroke" x1="3" x2="3" y1="14" y2="14"></line></svg>',
  table:
    '<svg viewbox="0 0 18 18"><rect class="ql-stroke" height="12" width="12" x="3" y="3"></rect><rect class="ql-fill" height="2" width="3" x="5" y="5"></rect><rect class="ql-fill" height="2" width="4" x="9" y="5"></rect><g class="ql-fill ql-transparent"><rect height="2" width="3" x="5" y="8"></rect><rect height="2" width="4" x="9" y="8"></rect><rect height="2" width="3" x="5" y="11"></rect><rect height="2" width="4" x="9" y="11"></rect></g></svg>',
  link: '<svg viewbox="0 0 18 18"><line class="ql-stroke" x1="7" x2="11" y1="7" y2="11"></line><path class="ql-even ql-stroke" d="M8.9,4.577a3.476,3.476,0,0,1,.36,4.679A3.476,3.476,0,0,1,4.577,8.9C3.185,7.5,2.035,6.4,4.217,4.217S7.5,3.185,8.9,4.577Z"></path><path class="ql-even ql-stroke" d="M13.423,9.1a3.476,3.476,0,0,0-4.679-.36,3.476,3.476,0,0,0,.36,4.679c1.392,1.392,2.5,2.542,4.679.36S14.815,10.5,13.423,9.1Z"></path></svg>',
  image:
    '<svg viewbox="0 0 18 18"><rect class="ql-stroke" height="10" width="12" x="3" y="4"></rect><circle class="ql-fill" cx="6" cy="7" r="1"></circle><polyline class="ql-even ql-fill" points="5 12 5 11 7 9 8 10 11 7 13 9 13 12 5 12"></polyline></svg>',
  clean:
    '<svg viewbox="0 0 18 18"><line class="ql-stroke" x1="5" x2="13" y1="3" y2="3"></line><line class="ql-stroke" x1="6" x2="9.35" y1="12" y2="3"></line><line class="ql-stroke" x1="11" x2="15" y1="11" y2="15"></line><line class="ql-stroke" x1="15" x2="11" y1="11" y2="15"></line><rect class="ql-fill" height="1" rx="0.5" ry="0.5" width="7" x="2" y="14"></rect></svg>',
};

/**
 * 构建 Quill 工具栏静态 HTML。
 * 注意：必须用 HTML 字符串而非 React JSX 渲染——Quill 初始化时会把 <select> 转换
 * 成 picker（移动并隐藏原 select），React 重渲染会 diff 并重建这些 select，摧毁
 * Quill 生成的 picker，导致下拉为空。HTML 字符串在渲染时一次性写入，之后 React
 * 不再触碰（__html 不变），Quill 转换可稳定保留。
 *
 * 列表采用按钮形式（与 Quill 默认工具栏一致）：snow 主题对 .ql-list 的下拉没有
 * 文本显示规则（仅 header/font/size 有 data-label 显示），且 Quill 的 update 会把
 * select 的 selectedIndex 置为 -1 导致闭合空白，按钮可彻底规避这些问题。
 */
function buildToolbarHtml(fonts: (string | false)[], t: (key: string) => string): string {
  // fonts 已以 false（默认字体）开头，此处直接展开，避免重复「默认字体」选项
  const fontOptions = fonts
    .map((f) => {
      const value = f === false ? '' : String(f);
      const label = f === false ? t('Default Font') : String(f);
      return `<option value="${escapeHtml(value)}"${f === false ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');
  const sizeOptions = FONT_SIZES.map(
    (s) =>
      `<option value="${escapeHtml(s)}"${s === DEFAULT_BODY_SIZE ? ' selected' : ''}>${escapeHtml(
        FONT_SIZE_LABELS[s] || s,
      )}</option>`,
  ).join('');
  const colorOptions =
    `<option value="" selected>${escapeHtml(t('Default'))}</option>` +
    QUILL_COLORS.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
  const html = `
    <span class="ql-formats"><select class="ql-font">${fontOptions}</select></span>
    <span class="ql-formats"><select class="ql-header">
      <option value="1">${escapeHtml(t('Heading 1'))}</option>
      <option value="2">${escapeHtml(t('Heading 2'))}</option>
      <option value="3">${escapeHtml(t('Heading 3'))}</option>
      <option value="4">${escapeHtml(t('Heading 4'))}</option>
      <option value="5">${escapeHtml(t('Heading 5'))}</option>
      <option value="" selected>${escapeHtml(t('Normal'))}</option>
    </select></span>
    <span class="ql-formats"><select class="ql-size">${sizeOptions}</select></span>
    <span class="ql-formats">
      <button class="ql-bold">${QUILL_ICONS.bold}</button>
      <button class="ql-italic">${QUILL_ICONS.italic}</button>
      <button class="ql-underline">${QUILL_ICONS.underline}</button>
      <button class="ql-strike">${QUILL_ICONS.strike}</button>
    </span>
    <span class="ql-formats">
      <select class="ql-color">${colorOptions}</select>
      <select class="ql-background">${colorOptions}</select>
    </span>
    <span class="ql-formats"><select class="ql-align">
      <option value="" selected>${escapeHtml(t('Left'))}</option>
      <option value="center">${escapeHtml(t('Center'))}</option>
      <option value="right">${escapeHtml(t('Right'))}</option>
      <option value="justify">${escapeHtml(t('Justify'))}</option>
    </select></span>
    <span class="ql-formats">
      <button class="ql-list" value="ordered">${QUILL_ICONS.listOrdered}</button>
      <button class="ql-list" value="bullet">${QUILL_ICONS.listBullet}</button>
    </span>
    <span class="ql-formats">
      <button class="ql-blockquote">${QUILL_ICONS.blockquote}</button>
      <button class="ql-code-block">${QUILL_ICONS.code}</button>
    </span>
    <span class="ql-formats">
      <button class="ql-indent" value="-1">${QUILL_ICONS.outdent}</button>
      <button class="ql-indent" value="+1">${QUILL_ICONS.indent}</button>
    </span>
    <span class="ql-formats"><button class="ql-table-better">${QUILL_ICONS.table}</button></span>
    <span class="ql-formats">
      <button class="ql-link">${QUILL_ICONS.link}</button>
      <button class="ql-image">${QUILL_ICONS.image}</button>
    </span>`;
  // 去掉标签间的空白字符，使各工具组间距只由 CSS margin（8px）决定，
  // 否则模板字符串的换行/缩进会渲染成空格，静态组之间会比 React 渲染的组多出一截间距
  return html.replace(/>\s+</g, '><').trim();
}

export const WordTemplateEditor = forwardRef<WordTemplateEditorHandle, Props>(
  ({ form, pageSettings, onPageChange, onSave, onCancel }, ref) => {
    const { t } = useTranslation(NAMESPACE);
    const apiClient = useAPIClient();
    // 通过 Form.useWatch 监听表单中 collectionName 字段的变化
    const collectionName = Form.useWatch('collectionName', form);

    const quillRef = useRef<any>(null);
    // 标记初始化 patch 是否已执行（仅执行一次）
    const matcherFixed = useRef(false);
    // 保存当前页最后光标选区，用于编辑器失焦时仍能正确定位插入位置
    const lastSelectionRef = useRef<any>(null);
    // 字体列表（直接传入工具栏，false 代表「清除格式」选项）
    const [fonts, setFonts] = useState<(string | false)[]>([false, ...DEFAULT_FONTS]);
    // 字体白名单是否已加载完成。完成前不渲染编辑器，避免 modules 变化触发重建
    const [fontsReady, setFontsReady] = useState(false);
    // 全屏编辑状态
    const [fullscreen, setFullscreen] = useState(false);
    // 二维码弹窗状态
    const [qrcodeModalOpen, setQrcodeModalOpen] = useState(false);
    const [editingQrcodeConfig, setEditingQrcodeConfig] = useState<QrcodeConfig | undefined>(undefined);
    // 正在编辑的二维码 DOM 元素（用于编辑模式下的替换）
    const editingQrcodeElRef = useRef<HTMLElement | null>(null);
    // 一对多表格弹窗状态（选择一对多字段时打开）
    const [toManyModal, setToManyModal] = useState<{ fieldPath: string; target: string } | null>(null);

    // 每页内容（HTML 数组），初始从表单 content 按分页符拆分
    const [pages, setPages] = useState<string[]>(() => {
      const stored = form.getFieldValue('content') || '';
      const parts = stored.split(PAGE_BREAK).filter((s: string) => s !== '');
      return parts.length > 0 ? parts : [''];
    });
    // 当前编辑的页索引
    const [currentPage, setCurrentPage] = useState(0);
    // 当前页编辑器内容（受控）
    const [value, setValue] = useState('');
    // 页面布局
    const layout = useMemo(() => computePageLayout(pageSettings), [pageSettings]);

    // 打开新建二维码弹窗（用 ref 保持工具栏按钮访问最新闭包）
    const handleOpenQrcodeModalRef = useRef<() => void>(() => {});
    handleOpenQrcodeModalRef.current = () => {
      editingQrcodeElRef.current = null;
      setEditingQrcodeConfig(undefined);
      setQrcodeModalOpen(true);
    };

    // 组件挂载时从 API 加载字体白名单
    useEffect(() => {
      (async () => {
        try {
          const res = await apiClient.request({ url: 'printTemplateFonts:get' });
          const data = res?.data?.data;
          if (data?.fontWhitelist && Array.isArray(data.fontWhitelist) && data.fontWhitelist.length > 0) {
            registerFonts(data.fontWhitelist);
            setFonts([false, ...data.fontWhitelist]);
          }
        } catch {
          // API 失败时保持默认字体
        } finally {
          setFontsReady(true);
        }
      })();
    }, [apiClient]);

    /** 工具栏静态 HTML（Quill 按钮/下拉）。用 dangerouslySetInnerHTML 渲染，避免 React 重渲染摧毁 Quill 生成的 picker */
    const toolbarHtml = useMemo(() => buildToolbarHtml(fonts, t), [fonts, t]);

    /** 工具栏按钮/选择器标题映射（i18n） */
    const toolbarTitles = useMemo(
      () => ({
        'ql-font': t('Font'),
        'ql-header': t('Heading'),
        'ql-size': t('Font Size'),
        'ql-bold': t('Bold'),
        'ql-italic': t('Italic'),
        'ql-underline': t('Underline'),
        'ql-strike': t('Strikethrough'),
        'ql-color': t('Text Color'),
        'ql-background': t('Background Color'),
        'ql-align': t('Align'),
        'ql-list': t('List'),
        'ql-blockquote': t('Blockquote'),
        'ql-code-block': t('Code Block'),
        'ql-indent': t('Indent'),
        'ql-table-better': t('Table'),
        'ql-link': t('Link'),
        'ql-image': t('Image'),
        'ql-clean': t('Clear Formatting'),
      }),
      [t],
    );

    // Quill 初始化后为工具栏按钮/下拉选择器补全 title（浏览器原生 tooltip）。
    // 注意：Quill 会把原生 <select> 转换为 .ql-picker 并隐藏 select，
    // 因此需在转换完成后针对 button 和 .ql-picker 统一设置 title。
    useEffect(() => {
      if (!fontsReady) return;
      const toolbar = document.querySelector('#word-template-toolbar');
      if (!toolbar) return;
      const apply = () => {
        toolbar.querySelectorAll('button, .ql-picker').forEach((el) => {
          for (const [name, title] of Object.entries(toolbarTitles)) {
            if (el.classList.contains(name)) {
              el.setAttribute('title', title);
              break;
            }
          }
        });
      };
      apply();
      // picker 由 Quill 同步创建，但保险起见延迟再补一次
      const timer = window.setTimeout(apply, 150);
      return () => window.clearTimeout(timer);
    }, [fontsReady, toolbarTitles]);

    /** 安全获取 Quill 编辑器实例 */
    const getEditorSafe = useCallback(() => {
      try {
        return quillRef.current?.getEditor() ?? null;
      } catch {
        return null;
      }
    }, []);

    /** 把当前编辑器内容保存到 pages[currentPage]，并同步表单 */
    const saveCurrentPage = useCallback(() => {
      const editor = getEditorSafe();
      if (!editor) return;
      const html = editor.root.innerHTML;
      setPages((prev) => {
        const next = [...prev];
        next[currentPage] = html;
        form.setFieldsValue({ content: next.join(PAGE_BREAK) });
        return next;
      });
    }, [getEditorSafe, currentPage, form]);

    /** 切换到指定页：先保存当前页，再切换页码（编辑器内容由「同步加载 effect」加载） */
    const goToPage = useCallback(
      (index: number) => {
        if (index === currentPage) return;
        saveCurrentPage();
        setCurrentPage(index);
        // 触发外部自动保存，防止切页后内容丢失
        onPageChange?.();
      },
      [currentPage, saveCurrentPage, onPageChange],
    );

    /** 新增一页（追加到末尾）并跳转过去 */
    const addPage = useCallback(() => {
      saveCurrentPage();
      setPages((prev) => {
        const next = [...prev, ''];
        form.setFieldsValue({ content: next.join(PAGE_BREAK) });
        return next;
      });
      // 新页索引 = 当前数组长度（闭包内的 pages.length 即新增后的最后索引）
      setCurrentPage(pages.length);
      // 触发外部自动保存
      onPageChange?.();
    }, [saveCurrentPage, form, pages.length, onPageChange]);

    /** 删除指定页，把内容追加到上一页末尾，跳转到上一页 */
    const removePage = useCallback(
      (index: number) => {
        if (pages.length <= 1) return;
        const editor = getEditorSafe();
        const currentHtml = editor?.root.innerHTML ?? '';
        setPages((prev) => {
          const next = prev.map((p, i) => (i === currentPage ? currentHtml : p));
          const removed = next[index] || '';
          next.splice(index, 1);
          // 删除的页内容追加到上一页（若有）
          const target = Math.max(0, index - 1);
          if (removed && removed !== '<p><br></p>') {
            next[target] = (next[target] || '') + removed;
          }
          form.setFieldsValue({ content: next.join(PAGE_BREAK) });
          return next;
        });
        // 跳转到删除后的目标页（编辑器内容由「同步加载 effect」加载）
        setCurrentPage(Math.max(0, index - 1));
        // 触发外部自动保存
        onPageChange?.();
      },
      [pages.length, currentPage, getEditorSafe, form, onPageChange],
    );

    /**
     * 数据同步核心：以 pages[currentPage] 为唯一内容源。
     * 当编辑器显示的内容（value）与当前页内容不一致时（切页/增删页/初始加载），
     * 把 value 切换为目标页内容，ReactQuill 受控更新会全量替换编辑器内容。
     * 正常输入时 handleChange 已保证 value === pages[currentPage]，此处直接返回。
     */
    useEffect(() => {
      if (!fontsReady) return;
      if (value === pages[currentPage]) return;
      setValue(pages[currentPage] ?? '');
    }, [fontsReady, currentPage, pages, value]);

    /**
     * 处理当前页内容变更：同步 value、pages 与表单。
     * 同步 state 防止 shouldComponentUpdate 在每次编辑后触发 setEditorContents 重写。
     */
    const handleChange = useCallback(
      (html: string) => {
        // 剥离 quill-table-better 残留的 <temporary>，避免其内容随模板持久化
        const clean = stripTemporaryTags(html);
        setValue(clean);
        setPages((prev) => {
          const next = [...prev];
          next[currentPage] = clean;
          form.setFieldsValue({ content: next.join(PAGE_BREAK) });
          return next;
        });
      },
      [currentPage, form],
    );

    // 暴露 getHTML：当前页内容实时 + 其余页缓存，按顺序拼接
    useImperativeHandle(ref, () => ({
      getHTML: () => {
        const editor = getEditorSafe();
        return stripTemporaryTags(
          pages.map((p, i) => (i === currentPage && editor ? editor.root.innerHTML : p)).join(PAGE_BREAK),
        );
      },
    }));

    /**
     * 插入数据字段变量（如 {customerName}）到当前页。
     * 一对多字段不直接插入变量，而是打开「一对多表格」弹窗，生成可编辑表格后插入。
     */
    const handleInsertVariable = useCallback(
      (fieldPath: string, meta?: InsertFieldMeta) => {
        if (meta?.isToMany && meta.target) {
          setToManyModal({ fieldPath, target: meta.target });
          return;
        }
        const editor = getEditorSafe();
        if (!editor) return;
        const variableText = `{${fieldPath}}`;
        const selection = editor.getSelection() || lastSelectionRef.current;
        if (selection) {
          editor.insertText(selection.index, variableText);
          editor.setSelection(selection.index + variableText.length);
        } else {
          const length = editor.getLength();
          editor.insertText(length, variableText);
          editor.setSelection(length + variableText.length);
        }
        editor.focus();
      },
      [getEditorSafe],
    );

    /**
     * 插入一对多可编辑表格到当前页（表格带标记 class，服务端按浮动方向展开重复行/列）。
     */
    const handleInsertToManyTable = useCallback(
      (config: ToManyTableConfig) => {
        const editor = getEditorSafe();
        if (!editor) return;
        const tableHtml = buildRepeatTableHtml(config);
        const selection = editor.getSelection() || lastSelectionRef.current;
        if (selection) {
          editor.clipboard.dangerouslyPasteHTML(selection.index, tableHtml);
        } else {
          editor.clipboard.dangerouslyPasteHTML(editor.getLength(), tableHtml);
        }
        editor.focus();
        setToManyModal(null);
      },
      [getEditorSafe],
    );

    /**
     * 插入或更新二维码占位符到当前页。
     */
    const handleInsertQrcode = useCallback(
      async (config: QrcodeConfig) => {
        const editor = getEditorSafe();
        if (!editor) return;
        const placeholderHTML = await generateQrcodePlaceholderHTML(config);

        if (editingQrcodeElRef.current) {
          const oldEl = editingQrcodeElRef.current;
          oldEl.insertAdjacentHTML('afterend', placeholderHTML);
          oldEl.remove();
          editingQrcodeElRef.current = null;
          handleChange(editor.root.innerHTML);
        } else {
          const selection = editor.getSelection() || lastSelectionRef.current;
          if (selection) {
            editor.clipboard.dangerouslyPasteHTML(selection.index, placeholderHTML);
          } else {
            editor.clipboard.dangerouslyPasteHTML(editor.getLength(), placeholderHTML);
          }
        }
        editor.focus();
        setQrcodeModalOpen(false);
        setEditingQrcodeConfig(undefined);
      },
      [handleChange, getEditorSafe],
    );

    /** 点击二维码占位符：打开编辑弹窗 */
    const handleQrcodePlaceholderClick = useCallback((e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'IMG') return;
      const config = getConfigFromImg(target as HTMLImageElement);
      if (!config) return;
      e.preventDefault();
      e.stopPropagation();
      editingQrcodeElRef.current = target;
      setEditingQrcodeConfig(config);
      setQrcodeModalOpen(true);
    }, []);

    /**
     * 核心初始化 Effect：修复 quill-table-better 表格渲染的两个问题
     * 1. 移除 Quill 2 内置的 'tr' matcher，避免与 table-better 的 matcher 冲突
     * 2. 修补 setEditorContents 使用 updateContents，确保表格 blot 正确渲染
     */
    useEffect(() => {
      if (!fontsReady) return;
      const editor = getEditorSafe();
      if (!editor || matcherFixed.current) return;
      matcherFixed.current = true;

      // 监听选区变化，记录最后光标位置（即使编辑器失焦也能恢复）
      editor.on('selection-change', (range: any) => {
        if (range) {
          lastSelectionRef.current = range;
        }
      });

      // 监听二维码占位符点击
      editor.root.addEventListener('click', handleQrcodePlaceholderClick as EventListener);

      // --- 修复 1：移除内置 tr matcher ---
      (editor.clipboard as any).matchers = (editor.clipboard as any).matchers.filter(
        ([selector]: [string]) => selector !== 'tr',
      );

      // --- 修复 2：修补 setEditorContents 使用 updateContents 保证表格渲染，
      // 但必须「先清空再应用」实现全量替换语义：切页加载时若只 updateContents，
      // 会把新页内容增量叠加到旧页内容上，导致显示混乱。 ---
      const rqInstance = quillRef.current;
      const { onEditorChange } = rqInstance;
      rqInstance.setEditorContents = function (ed: any, val: string) {
        this.value = val;
        const sel = this.getEditorSelection();
        const applyFullReplace = (delta: any) => {
          fillDefaultFontSize(delta);
          const ops = delta.ops || [];
          // 是否有实际内容（非纯空段落）
          const hasContent = ops.some((op: any) => {
            if (typeof op.insert === 'string') return op.insert !== '\n';
            return true; // embed（图片/二维码等）
          });
          ed.off('editor-change', onEditorChange);
          ed.deleteText(0, ed.getLength(), Quill.sources.SILENT);
          if (hasContent) {
            ed.updateContents(delta, Quill.sources.SILENT);
          }
          ed.on('editor-change', onEditorChange);
        };
        if (typeof val === 'string') {
          applyFullReplace(ed.clipboard.convert({ html: val }));
        } else {
          applyFullReplace(val);
        }
        Promise.resolve()
          .then(() => this.setEditorSelection(ed, sel))
          .catch(() => {});
      };

      // 当前页无初始内容时设置默认正文字号，保证后续输入的文本带有小四字号
      if (!pages[currentPage]) {
        editor.format('size', DEFAULT_BODY_SIZE, Quill.sources.SILENT);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getEditorSafe, fontsReady, handleQrcodePlaceholderClick]);

    // 应用当前页编辑器的纸张布局（宽度按内容区，padding=页边距，高度随内容自适应）。
    // 只写与页面设置相关的动态值；去容器灰边框、高度跟随内容等静态覆写
    // 由上方 <style> 中的 CSS 常驻，避免热更新重建编辑器 DOM 时内联补丁丢失导致灰边框露出
    useEffect(() => {
      if (!fontsReady) return;
      const editor = getEditorSafe();
      if (!editor) return;
      const root = editor.root as HTMLElement;
      root.style.width = `${layout.contentWidthPx}px`;
      root.style.minHeight = `${layout.contentHeightPx}px`;
      root.style.padding = `${layout.marginVPx}px ${layout.marginHPx}px ${layout.marginBPx}px ${layout.marginHPx}px`;
    }, [fontsReady, layout, getEditorSafe]);

    // 手动向 Quill 工具栏注入二维码按钮 / 行距选择器 / 字体与字号标签修复
    useEffect(() => {
      if (!fontsReady) return;
      const timer = setTimeout(() => {
        const toolbar = document.querySelector('.ql-toolbar.ql-snow');
        if (!toolbar) return;

        if (!toolbar.querySelector('.ql-qrcode')) {
          const cleanBtn = toolbar.querySelector('button.ql-clean');
          const btn = document.createElement('button');
          btn.className = 'ql-qrcode';
          btn.type = 'button';
          btn.innerHTML = QRCODE_ICON_SVG;
          btn.addEventListener('click', () => handleOpenQrcodeModalRef.current());
          // 与其他工具一致，包一层 .ql-formats 组插入到「清除格式」组前，保证组间距统一
          const wrapper = document.createElement('span');
          wrapper.className = 'ql-formats';
          wrapper.appendChild(btn);
          const cleanGroup = cleanBtn?.closest('.ql-formats');
          if (cleanGroup?.parentNode) {
            cleanGroup.parentNode.insertBefore(wrapper, cleanGroup);
          } else {
            toolbar.appendChild(wrapper);
          }
        }

        const fontPicker = toolbar.querySelector('.ql-picker.ql-font');
        if (fontPicker) {
          fontPicker.querySelectorAll('.ql-picker-item').forEach((item) => {
            const value = item.getAttribute('data-value');
            if (value && !item.hasAttribute('data-label')) {
              item.setAttribute('data-label', value);
            }
          });
          const fontLabel = fontPicker.querySelector('.ql-picker-label');
          if (fontLabel) {
            const value = fontLabel.getAttribute('data-value');
            if (value && !fontLabel.hasAttribute('data-label')) {
              fontLabel.setAttribute('data-label', value);
            }
          }
        }

        const sizePicker = toolbar.querySelector('.ql-picker.ql-size');
        if (sizePicker) {
          sizePicker.querySelectorAll('.ql-picker-item').forEach((item) => {
            const value = item.getAttribute('data-value');
            if (value && !item.hasAttribute('data-label')) {
              item.setAttribute('data-label', FONT_SIZE_LABELS[value] || value);
            }
          });
        }

        if (!toolbar.querySelector('.ql-lineheight')) {
          const picker = document.createElement('span');
          picker.className = 'ql-picker ql-lineheight';

          const lhLabel = document.createElement('span');
          lhLabel.className = 'ql-picker-label';
          lhLabel.setAttribute('data-value', '1.5');
          lhLabel.innerHTML = LINE_HEIGHT_ICON_SVG;
          lhLabel.addEventListener('click', () => picker.classList.toggle('ql-expanded'));
          picker.appendChild(lhLabel);

          const optionsContainer = document.createElement('span');
          optionsContainer.className = 'ql-picker-options';
          optionsContainer.setAttribute('aria-hidden', 'true');

          LINE_HEIGHTS.forEach((lh) => {
            const item = document.createElement('span');
            item.className = 'ql-picker-item';
            item.setAttribute('data-value', lh);
            item.innerHTML = `${LINE_HEIGHT_ICON_SVG} ${lh}`;
            item.addEventListener('mousedown', (e) => {
              e.preventDefault();
              const editor = getEditorSafe();
              if (!editor) return;
              const range = editor.getSelection(true);
              if (range) {
                editor.formatLine(range.index, range.length, 'lineheight', lh);
              }
              picker.classList.remove('ql-expanded');
              lhLabel.setAttribute('data-value', lh);
              lhLabel.innerHTML = LINE_HEIGHT_ICON_SVG;
              editor.focus();
            });
            optionsContainer.appendChild(item);
          });

          picker.appendChild(optionsContainer);
          document.addEventListener('click', (ev) => {
            if (!picker.contains(ev.target as Node)) {
              picker.classList.remove('ql-expanded');
            }
          });

          // 以「对齐组」（.ql-formats 容器）为锚点，把行距组作为同级兄弟插到其后。
          // 注意不能直接插在 .ql-align 节点后——它是对齐组内部的 picker/select 元素，
          // 那样会把行距组嵌套进对齐组里，导致与左侧 0 间距、右侧双倍间距。
          const alignGroup = toolbar.querySelector('.ql-align')?.closest('.ql-formats');
          // 与其他工具一致，包一层 .ql-formats，保证组间距统一
          const wrapper = document.createElement('span');
          wrapper.className = 'ql-formats';
          wrapper.appendChild(picker);
          if (alignGroup?.parentNode) {
            alignGroup.parentNode.insertBefore(wrapper, alignGroup.nextSibling);
          } else {
            toolbar.appendChild(wrapper);
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }, [fonts, fontsReady, getEditorSafe]);

    // Quill 模块配置
    const modules = useMemo(
      () => ({
        toolbar: {
          // 工具栏渲染到编辑区外的共享容器（#word-template-toolbar），与输入框分离并置顶
          container: '#word-template-toolbar',
          handlers: {
            font(value: string | false) {
              if (!this.quill.hasFocus()) this.quill.focus();
              const range = this.quill.getSelection();
              if (!range) return;
              this.quill.format('font', value === false ? false : value, Quill.sources.USER);
            },
            header(value: string | false | number) {
              if (!this.quill.hasFocus()) this.quill.focus();
              const range = this.quill.getSelection();
              if (!range) return;
              const headerValue = value === false ? false : Number(value);
              const sizeValue = headerValue === false ? DEFAULT_BODY_SIZE : HEADING_SIZE_MAP[headerValue];
              const [startLine] = this.quill.getLine(range.index);
              const endIndex = range.index + range.length;
              const [endLine] = this.quill.getLine(range.length > 0 ? endIndex - 1 : endIndex);
              const start = this.quill.getIndex(startLine);
              const end = this.quill.getIndex(endLine) + endLine.length() - 1;
              if (end > start && sizeValue) {
                this.quill.formatText(start, end - start, 'size', sizeValue, Quill.sources.USER);
              }
              this.quill.format('header', headerValue, Quill.sources.USER);
              if (end === start && sizeValue) {
                this.quill.format('size', sizeValue, Quill.sources.USER);
              }
            },
            size(value: string | false) {
              if (!this.quill.hasFocus()) this.quill.focus();
              const range = this.quill.getSelection();
              if (!range) return;
              this.quill.format('size', value === false ? false : value, Quill.sources.USER);
            },
          },
        },
        table: false,
        'table-better': TABLE_MODULE_CONFIG,
        keyboard: {
          bindings: QuillTableBetter.keyboardBindings,
        },
      }),
      [],
    );

    /** 页眉/页脚预览文本：{page}/{pages} 替换为当前页码/总页数；{field} 变量导出时才替换，预览保持原样 */
    const renderHeaderFooterText = (text: string) =>
      text.replace(/\{page\}/g, String(currentPage + 1)).replace(/\{pages\}/g, String(pages.length));

    /** 页眉/页脚片段预览内容（兼容旧版 text 纯文本） */
    const renderHeaderFooterItems = (cfg: HeaderFooterConfig | undefined) => {
      const items: HeaderFooterItem[] =
        cfg?.items && cfg.items.length > 0
          ? cfg.items
          : (cfg?.text || '').split(/\r?\n/).map((line) => ({ type: 'text' as const, text: line }));
      return items.map((item, i) => {
        switch (item.type) {
          case 'page':
            return <span key={i}>{currentPage + 1}</span>;
          case 'pages':
            return <span key={i}>{pages.length}</span>;
          case 'break':
            return <br key={i} />;
          case 'image':
            return (
              <img
                key={i}
                src={item.image}
                alt=""
                style={{
                  width: item.width,
                  height: item.height,
                  maxHeight: layout.marginVPx,
                  objectFit: 'contain',
                  verticalAlign: 'middle',
                  margin: '0 2px',
                }}
              />
            );
          default:
            return <span key={i}>{renderHeaderFooterText(item.text ?? '')}</span>;
        }
      });
    };

    /** 页眉/页脚预览：显示在页边距区域内（只读，一次配置所有页面一致） */
    const renderHeaderFooter = (cfg: HeaderFooterConfig | undefined, position: 'header' | 'footer') => {
      if (!cfg || (!cfg.items?.length && !cfg.text?.trim())) return null;
      const align = cfg.align || 'center';
      return (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            ...(position === 'header' ? { top: 0, height: layout.marginVPx } : { bottom: 0, height: layout.marginBPx }),
            display: 'flex',
            alignItems: 'center',
            justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
            padding: `0 ${layout.marginHPx}px`,
            fontFamily: cfg.fontFamily || 'Helvetica, "Microsoft YaHei", sans-serif',
            fontSize: `${cfg.fontSize ?? 9}pt`,
            lineHeight: cfg.lineHeight ?? 1.5,
            color: '#666',
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <div style={{ display: 'inline-block', textAlign: align, whiteSpace: 'pre-line' }}>
            {renderHeaderFooterItems(cfg)}
          </div>
        </div>
      );
    };

    return (
      <div
        style={
          fullscreen
            ? {
                position: 'fixed',
                inset: 0,
                zIndex: 1100,
                background: '#fff',
                padding: '12px 24px 24px',
                display: 'flex',
                flexDirection: 'column',
              }
            : {
                display: 'flex',
                flexDirection: 'column',
                height: 560,
              }
        }
      >
        {/* 顶部工具栏区域：提示信息 + 全屏切换 */}
        <div
          style={{
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#666', fontSize: 12 }}>
            {t('Tip: Click the variable button to insert data fields, e.g. {customerName}. Or type them directly.')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 全屏模式下提供「取消/确定」，等价于弹窗底部操作（全屏覆盖层会遮挡弹窗底部按钮） */}
            {fullscreen && onSave && onCancel && (
              <>
                <Button size="small" onClick={onCancel}>
                  {t('Cancel')}
                </Button>
                <Button size="small" type="primary" onClick={onSave}>
                  {t('Save')}
                </Button>
              </>
            )}
            <Button
              size="small"
              icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={() => setFullscreen((v) => !v)}
            >
              {fullscreen ? t('Exit Fullscreen') : t('Fullscreen')}
            </Button>
          </div>
        </div>

        {/* 共享 Quill 工具栏：与输入框分离，固定在顶部（编辑区滚动时始终可见）。
            toolbar.container 使用选择器时 Quill 只绑定容器内已存在的按钮，因此需手写完整按钮。 */}
        <div
          id="word-template-toolbar"
          className="ql-toolbar ql-snow"
          style={{
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: '#fff',
            borderLeft: 'none',
            borderRight: 'none',
            borderTop: 'none',
            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
          }}
        >
          {/* 统一工具栏各组间距（覆盖 snow 默认 15px 与注入元素各自为政的边距） */}
          <style>{`
            #word-template-toolbar .ql-formats {
              margin-right: 8px !important;
            }
            /* 仅最右侧的直接子组去掉右边距；静态 HTML 内最后一组不是工具栏直接子节点，
               需保留 8px 以保证与后续「插入变量」组间距一致 */
            #word-template-toolbar > .ql-formats:last-child {
              margin-right: 0 !important;
            }
            /* 行间距选择器：图标居中（覆盖 snow 为普通 picker 预留下拉箭头的
               padding-left:8px 与 svg 绝对定位 right:0 样式），宽度与普通按钮一致 */
            #word-template-toolbar .ql-picker.ql-lineheight {
              width: 28px !important;
              height: 24px;
              margin: 0 !important;
            }
            #word-template-toolbar .ql-picker.ql-lineheight .ql-picker-label {
              display: flex !important;
              align-items: center;
              justify-content: center;
              padding: 0 !important;
            }
            #word-template-toolbar .ql-picker.ql-lineheight .ql-picker-label svg {
              position: static !important;
              margin: 0 !important;
              width: 18px;
              height: 18px;
            }
            #word-template-toolbar .ql-picker.ql-lineheight .ql-picker-item svg {
              position: static !important;
              margin: 0 4px 0 0 !important;
              width: 14px;
              height: 14px;
              vertical-align: middle;
            }
            /* 编辑区容器静态覆写（CSS 常驻，不依赖 useEffect 内联补丁，热更新重建 DOM 也不会丢失）：
               去掉 snow 默认灰边框（1px solid #ccc，内容超高时会浮在内容中部，看起来像灰色分页线/分隔符），
               容器与编辑区高度跟随内容（纸框外层已有边框） */
            .word-template-editor-page .ql-container.ql-snow {
              border: none !important;
              height: auto !important;
              overflow: visible !important;
            }
            .word-template-editor-page .ql-editor {
              height: auto !important;
              overflow: visible !important;
              max-width: none !important;
              margin: 0 !important;
              /* 透明以透出页面背景图（白色底由外层页面框提供） */
              background: transparent;
            }
            /* 维表「向右浮动」模拟表头单元格的统一外观类。
               注意：Word 打印不识别 CSS 类，外观以内联样式（REPEAT_HEADER_CELL_STYLE）为准，
               此处类样式用于编辑器内语义化统一与自定义。 */
            .word-template-editor-page .ql-print-repeat-header-cell {
              background-color: #f0f0f0;
              text-align: center;
            }
          `}</style>
          {/* Quill 按钮/下拉：以 HTML 字符串渲染（React 不 diff 内部，避免摧毁 Quill 转换的 picker） */}
          <span dangerouslySetInnerHTML={{ __html: toolbarHtml }} />
          {/* 插入变量（倒数第二，清除格式保持最右）；{x} 为 NocoBase 变量惯用符号 */}
          <span className="ql-formats">
            <CollectionFieldPicker
              collectionName={collectionName}
              onInsert={handleInsertVariable}
              label={
                <Button
                  size="small"
                  type="text"
                  title={t('Insert Variable')}
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    lineHeight: 1,
                    fontFamily: 'Consolas, Menlo, monospace',
                    color: '#595959',
                  }}
                >
                  {'{x}'}
                </Button>
              }
            />
          </span>
          <span className="ql-formats">
            <button className="ql-clean" />
          </span>
        </div>

        {/* 编辑区：深灰工作区背景，当前页是一张白色"文本框"（padding=页边距） */}
        <div
          style={{
            background: '#c0c0c0',
            position: 'relative',
            overflow: 'auto',
            flex: 1,
            minHeight: 0,
            padding: '16px 0',
          }}
        >
          {fontsReady && (
            <div
              className="word-template-editor-page"
              style={{
                background: '#fff',
                width: layout.widthPx,
                minHeight: layout.heightPx,
                margin: '0 auto',
                border: '1px solid #a5a5a5',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.15)',
                boxSizing: 'border-box',
                position: 'relative',
              }}
            >
              {/* 背景图：一次配置所有页面生效，铺满整页（含页边距），内容区透明以透出背景 */}
              {pageSettings?.background?.image && (
                <div aria-hidden="true" style={getBackgroundPreviewStyle(pageSettings.background)} />
              )}
              <ReactQuill
                ref={quillRef}
                theme="snow"
                value={value}
                onChange={handleChange}
                useSemanticHTML={false}
                modules={modules}
              />
              {/* 页眉页脚预览：页边距区域内只读展示，所有页面一致 */}
              {renderHeaderFooter(pageSettings?.header, 'header')}
              {renderHeaderFooter(pageSettings?.footer, 'footer')}
            </div>
          )}
        </div>

        {/* 底部页码栏：切换/新增/删除页面 */}
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <Button
            size="small"
            icon={<LeftOutlined />}
            disabled={currentPage === 0}
            onClick={() => goToPage(currentPage - 1)}
          />
          <span style={{ fontSize: 13, color: '#333' }}>
            {t('Page {{current}} of {{total}}', { current: currentPage + 1, total: pages.length })}
          </span>
          <Button
            size="small"
            icon={<RightOutlined />}
            disabled={currentPage === pages.length - 1}
            onClick={() => goToPage(currentPage + 1)}
          />
          <Button size="small" icon={<PlusOutlined />} onClick={addPage}>
            {t('Add Page')}
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={pages.length <= 1}
            onClick={() => removePage(currentPage)}
          >
            {t('Delete Page')}
          </Button>
        </div>

        {/* 二维码插入/编辑弹窗 */}
        <QrcodeInsertModal
          open={qrcodeModalOpen}
          collectionName={collectionName}
          initialConfig={editingQrcodeConfig}
          onOk={handleInsertQrcode}
          onCancel={() => {
            editingQrcodeElRef.current = null;
            setQrcodeModalOpen(false);
            setEditingQrcodeConfig(undefined);
          }}
        />

        {/* 一对多表格插入弹窗：选择显示字段与浮动方向 */}
        <ToManyTableModal
          open={Boolean(toManyModal)}
          fieldPath={toManyModal?.fieldPath || ''}
          targetCollection={toManyModal?.target || ''}
          onOk={handleInsertToManyTable}
          onCancel={() => setToManyModal(null)}
        />
      </div>
    );
  },
);
