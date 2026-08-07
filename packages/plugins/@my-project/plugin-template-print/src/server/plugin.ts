/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import './blob-polyfill';
import { Plugin } from '@nocobase/server';
import archiver from 'archiver';
import ExcelJS from 'exceljs';
// @ts-ignore
import htmlDocx from 'html-docx-js/dist/html-docx';
import JSZip from 'jszip';
import QRCode from 'qrcode';
import { applyPageDecorationsToDocx, PageDecorationSettings } from './word-decorations';

/**
 * 从数据对象中根据点分隔的字段路径提取值。
 * 例如 "user.profile.name" 会访问 data.user.profile.name。
 *
 * @param data - 数据对象
 * @param fieldPath - 点分隔的字段路径
 * @returns 提取到的字段值，不存在则返回 undefined
 */
function extractFieldValue(data: Record<string, any>, fieldPath: string): any {
  return fieldPath.split('.').reduce((obj, key) => (obj != null ? obj[key] : undefined), data);
}

/**
 * 替换纯文本中的 {fieldPath} 占位符为记录字段值。
 * 用于 Excel 单元格文本渲染。
 */
function replaceTextPlaceholders(text: string, data: Record<string, any>): string {
  return text.replace(/{([^}]+)}/g, (_match, fieldPath: string) => {
    const trimmed = fieldPath.trim();
    if (!trimmed) return _match;
    const value = extractFieldValue(data, trimmed);
    return value != null ? String(value) : '';
  });
}

/**
 * 替换 HTML 模板中的 {fieldPath} 变量占位符。
 * 支持跨 HTML 标签内部的字段路径匹配。
 *
 * @param html - 模板 HTML 字符串
 * @param data - 数据对象
 * @returns 替换后的 HTML 字符串
 */
function replaceVariables(html: string, data: Record<string, any>): string {
  // 第一轮：替换 {fieldPath} 格式的普通变量
  const result = html.replace(/{([\s\S]*?)}/g, (_match, inner) => {
    // 清除内部可能包含的 HTML 标签和大括号
    const fieldPath = inner
      .replace(/<[^>]*>/g, '')
      .replace(/[{}]/g, '')
      .trim();
    if (!fieldPath) return _match;
    const value = extractFieldValue(data, fieldPath);
    return value != null ? String(value) : '';
  });

  return result;
}

/**
 * 从 SVG <desc> 文本中解码二维码配置。
 * 格式: qrcode:valueType:value:width:height
 *
 * @param descText - SVG <desc> 元素文本内容
 * @returns 解码后的配置对象，或 null
 */
function decodeQrcodeDesc(
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
 * 处理 HTML 中的二维码占位符。
 * 查找包含 data:image/svg+xml 且有 <desc>qrcode:...</desc> 配置的 <img> 标签，
 * 将其替换为包含真实二维码图片的 <img> 标签。
 *
 * @param html - 包含二维码占位符的 HTML 字符串
 * @param data - 数据对象（用于解析字段类型的二维码值）
 * @returns 处理后的 HTML 字符串
 */
async function processQrcodes(html: string, data: Record<string, any>): Promise<string> {
  // 匹配 <img src="data:image/svg+xml,...qrcode:..."> 标签
  const imgRegex = /<img\s+src="data:image\/svg\+xml,([^"]*)"[^>]*\/?>/gi;

  const replacements: Array<{ original: string; replacement: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const encodedSvg = match[1];
    if (!encodedSvg) continue;

    // URL 解码 SVG 内容
    let svgText: string;
    try {
      svgText = decodeURIComponent(encodedSvg);
    } catch {
      continue;
    }

    // 提取 <desc> 中的二维码配置
    const descMatch = /<desc>([\s\S]*?)<\/desc>/i.exec(svgText);
    if (!descMatch) continue;

    const config = decodeQrcodeDesc(descMatch[1]);
    if (!config) continue;

    let qrcodeValue: string;

    // 根据值类型确定二维码内容
    if (config.valueType === 'field') {
      // 字段类型：从数据中直接查找
      const val = extractFieldValue(data, config.value);
      qrcodeValue = val != null ? String(val) : '';
    } else {
      // 固定值：直接使用
      qrcodeValue = config.value;
    }

    if (!qrcodeValue) continue;

    // 生成真实二维码图片
    try {
      const dataUri = await QRCode.toDataURL(qrcodeValue, {
        width: config.width,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });
      const imgTag = `<img src="${dataUri}" style="width:${config.width}px;height:${config.height}px;display:inline-block;vertical-align:middle;" />`;
      replacements.push({ original: fullTag, replacement: imgTag });
    } catch {
      // 二维码生成失败，保留占位符不变
    }
  }

  let result = html;
  for (const { original, replacement } of replacements) {
    result = result.replace(original, replacement);
  }

  return result;
}

/**
 * Word 导入 altChunk(HTML) 时的兼容默认排版。
 * Word 的 HTML 导入器几乎不识别 <style> 块（仅解析内联 style 属性），
 * 因此必须把这些样式内联到具体元素上，才能使 Word 中的排版与编辑器一致。
 */
// 注意：字体名使用单引号，避免与 style 属性的双引号冲突
const WORD_BODY_FONT_FAMILY = "Helvetica, Arial, 'Microsoft YaHei', SimSun, sans-serif";
const WORD_BODY_FONT_SIZE = '13px'; // Quill 编辑器默认字号
const WORD_BODY_LINE_HEIGHT = 1.42; // Quill 编辑器默认行高（相对字号倍数）

/**
 * 计算与编辑器行高一致的固定行距值（pt）。
 *
 * 为什么用固定值：Word 的"多倍行距"基于字体度量（max_glyph_height + lineGap）动态计算
 * （中文字体 lineGap ≈ 0.12 × 字号，单倍行距 ≈ 1.12 × 字号），与 CSS 无单位 line-height
 * （相对字号，浏览器中行高 = 字号 × 1.42）机制完全不同。只有固定行距（Exactly）才能让
 * Word 每行高度与浏览器一致（= 字号 × 1.42），从而保证分页位置与编辑器预览一致。
 *
 * 单位用 pt（Word 原生单位，HTML 导入按 96 DPI 换算：1pt = 4/3 px），避免 px 换算不确定。
 */
function getWordLineHeight(fontSize: string): string {
  const px = cssLengthToPx(fontSize, 13);
  const pt = (px * WORD_BODY_LINE_HEIGHT * 72) / 96;
  return `${Math.round(pt * 10) / 10}pt`;
}

/** 块级元素的默认样式（保留元素已有样式，仅补齐缺失属性） */
function getWordBlockStyle(fontSize = WORD_BODY_FONT_SIZE): Record<string, string> {
  return {
    'font-family': WORD_BODY_FONT_FAMILY,
    'font-size': fontSize,
    'line-height': getWordLineHeight(fontSize),
    margin: '0',
  };
}

/** 将 CSS 声明追加/合并到元素现有 style 中（已有属性优先，不覆盖用户样式） */
function mergeCss(existing: string, added: Record<string, string>): string {
  const map: Record<string, string> = {};
  existing.split(';').forEach((decl) => {
    const idx = decl.indexOf(':');
    if (idx > 0) {
      map[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim();
    }
  });
  Object.entries(added).forEach(([key, value]) => {
    if (!(key in map)) {
      map[key] = value;
    }
  });
  return Object.entries(map)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}

/** Quill 对齐 class → text-align 值（Word 忽略 class，需转为内联样式） */
const QUILL_ALIGN_CLASSES: Record<string, string> = {
  'ql-align-center': 'center',
  'ql-align-right': 'right',
  'ql-align-justify': 'justify',
};

/** 将 CSS 长度（px/pt/em）转为 px 基准数值 */
function cssLengthToPx(value: string, basePx: number): number {
  const px = /([\d.]+)\s*px/i.exec(value);
  if (px) {
    return parseFloat(px[1]);
  }
  const pt = /([\d.]+)\s*pt/i.exec(value);
  if (pt) {
    return (parseFloat(pt[1]) * 4) / 3;
  }
  const em = /([\d.]+)\s*em/i.exec(value);
  if (em) {
    return parseFloat(em[1]) * basePx;
  }
  return basePx;
}

/** 扫描元素内容中最大的 font-size（px 基准），用于决定固定行距（避免截断大字号文字） */
function findMaxFontSizePx(content: string, basePx: number): number {
  let max = basePx;
  // 排除引号，避免跨 style 属性/标签误匹配
  const re = /font-size\s*:\s*([^;"']+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const px = cssLengthToPx(m[1], basePx);
    if (px > max) {
      max = px;
    }
  }
  return max;
}

/** 扫描元素内容中最大的行内图片高度（px），固定行距必须 ≥ 图片高度，否则 Word 会裁掉图片 */
function findMaxImgHeightPx(content: string): number {
  let max = 0;
  const re = /<img\b[^>]*\bheight\s*:\s*([\d.]+)px/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const px = parseFloat(m[1]);
    if (px > max) {
      max = px;
    }
  }
  return max;
}

/** 给 HTML 中指定标签的开头标签内联样式（保留原属性） */
function inlineStyleToTag(html: string, tagName: string, style: Record<string, string>): string {
  const re = new RegExp(`(<${tagName}\\b[^>]*?)(/?)>`, 'gi');
  return html.replace(re, (match: string, open: string, selfClose: string) => {
    const toAdd = { ...style };
    // 将 Quill 的 class 样式（对齐/缩进）转为内联，Word 才能识别
    const classAttr = /\sclass="([^"]*)"/i.exec(open);
    if (classAttr) {
      const classNames = classAttr[1].split(/\s+/);
      const align = classNames.find((c) => QUILL_ALIGN_CLASSES[c]);
      if (align && !('text-align' in toAdd)) {
        toAdd['text-align'] = QUILL_ALIGN_CLASSES[align];
      }
      const indentMatch = /^ql-indent-(\d)$/.exec(classNames.find((c) => /^ql-indent-\d$/.test(c)) || '');
      if (indentMatch && !('padding-left' in toAdd)) {
        toAdd['padding-left'] = `${parseInt(indentMatch[1], 10) * 3}em`;
      }
    }
    const styleAttr = /\sstyle="([^"]*)"/i.exec(open);
    if (styleAttr) {
      const merged = mergeCss(styleAttr[1], toAdd);
      return `${open.replace(/\sstyle="[^"]*"/i, ` style="${merged}"`)}${selfClose}>`;
    }
    const css = Object.entries(toAdd)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
    return `${open} style="${css}"${selfClose}>`;
  });
}

/**
 * 给块级元素内联样式，并按"元素自身字号与内容内最大内容高度"计算固定行距。
 * Quill 的字号是应用在行内 <span> 上（段落本身无字号），
 * 若段落内 span 字号或图片高度大于段落默认字号，行高必须按较大值计算，
 * 否则 Word 固定行距会截断文字或图片。
 */
function inlineBlockElement(html: string, tagName: string, style: Record<string, string>): string {
  const re = new RegExp(`(<${tagName}\\b[^>]*)(>)([\\s\\S]*?)(</${tagName}>)`, 'gi');
  return html.replace(re, (match: string, open: string, gt: string, content: string, close: string) => {
    const styleAttr = /\sstyle="([^"]*)"/i.exec(open);
    let fontSize = style['font-size'] || WORD_BODY_FONT_SIZE;
    if (styleAttr) {
      const fs = /(?:^|;)\s*font-size\s*:\s*([^;"']+)/i.exec(styleAttr[1]);
      if (fs) {
        fontSize = fs[1].trim();
      }
    }
    const basePx = cssLengthToPx(fontSize, 13);
    const maxFontPx = findMaxFontSizePx(content, basePx);
    const imgPx = findMaxImgHeightPx(content);
    // 行高 = max(内容最大字号 × 1.42, 图片高度)：与浏览器行盒一致（图片直接撑高行盒，不乘倍数）
    const lineHeightPx = Math.max(maxFontPx * WORD_BODY_LINE_HEIGHT, imgPx);
    const lineHeightPt = (lineHeightPx * 72) / 96;
    const toAdd = { ...style, 'line-height': `${Math.round(lineHeightPt * 10) / 10}pt` };
    // 将 Quill 的 class 样式（对齐/缩进）转为内联，Word 才能识别
    const classAttr = /\sclass="([^"]*)"/i.exec(open);
    if (classAttr) {
      const classNames = classAttr[1].split(/\s+/);
      const align = classNames.find((c) => QUILL_ALIGN_CLASSES[c]);
      if (align && !('text-align' in toAdd)) {
        toAdd['text-align'] = QUILL_ALIGN_CLASSES[align];
      }
      const indentMatch = /^ql-indent-(\d)$/.exec(classNames.find((c) => /^ql-indent-\d$/.test(c)) || '');
      if (indentMatch && !('padding-left' in toAdd)) {
        toAdd['padding-left'] = `${parseInt(indentMatch[1], 10) * 3}em`;
      }
    }
    if (styleAttr) {
      const merged = mergeCss(styleAttr[1], toAdd);
      return `${open.replace(/\sstyle="[^"]*"/i, ` style="${merged}"`)}${gt}${content}${close}`;
    }
    const css = Object.entries(toAdd)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
    return `${open} style="${css}"${gt}${content}${close}`;
  });
}

/**
 * 将模板 HTML 的样式内联化，使 Word（altChunk 导入）与编辑器预览排版一致。
 * Word 的 HTML 导入器忽略 <style> 块，只认内联 style，因此：
 * - 块级元素（p/div/li/h1-h6/blockquote）补齐默认字体、字号、行高、无段间距；
 * - 表格/单元格补齐边框与内边距；
 * - 已有内联样式（用户设置的）保留优先。
 */
function inlineWordStyles(html: string): string {
  let out = html;
  out = inlineStyleToTag(out, 'table', { 'border-collapse': 'collapse', border: 'none', width: '100%' });
  // th/td 含内容（可能是大字号或图片），用 inlineBlockElement 计算行距
  out = inlineBlockElement(out, 'th', {
    border: '1px solid #000',
    padding: '2px 5px',
    'vertical-align': 'top',
    background: '#f0f0f0',
    ...getWordBlockStyle(),
  });
  out = inlineBlockElement(out, 'td', {
    border: '1px solid #000',
    padding: '2px 5px',
    'vertical-align': 'top',
    ...getWordBlockStyle(),
  });
  out = inlineBlockElement(out, 'p', getWordBlockStyle());
  out = inlineBlockElement(out, 'div', getWordBlockStyle());
  out = inlineBlockElement(out, 'li', getWordBlockStyle());
  out = inlineBlockElement(out, 'blockquote', getWordBlockStyle());
  // 标题后备字号与编辑器 HEADING_SIZE_MAP 一致（1pt = 4/3px）：
  // h1=22pt、h2=18pt、h3=16pt、h4=15pt、h5=14pt，均不小于正文；h6 保持小于 h5 一级
  out = inlineBlockElement(out, 'h1', getWordBlockStyle('29px'));
  out = inlineBlockElement(out, 'h2', getWordBlockStyle('24px'));
  out = inlineBlockElement(out, 'h3', getWordBlockStyle('21px'));
  out = inlineBlockElement(out, 'h4', getWordBlockStyle('20px'));
  out = inlineBlockElement(out, 'h5', getWordBlockStyle('19px'));
  out = inlineBlockElement(out, 'h6', getWordBlockStyle('16px'));
  return out;
}

/**
 * 将模板 HTML 包装为完整的、Word 可直接导入的 HTML 文档。
 *
 * 为什么需要 <body> margin：
 * Word 通过 altChunk 导入 HTML 时，会把页面边距重置为默认值
 * （html-docx-js 默认 1440 twips = 2.54cm = 1 英寸），并参考 HTML <body> 的 margin。
 * 因此必须把页面设置中的边距写入 <body style="margin:...">，
 * 使其与 docx 的 <w:pgMar> 一致，打印/打开的边距才能与页面设置相符。
 *
 * 单位换算：Word 以 96 DPI 渲染 HTML，1 px = 1440/96 = 15 twips。
 *
 * @param html - 模板 HTML（已替换变量、已处理二维码）
 * @param margins - 页面边距（twips）
 * @returns 完整 HTML 文档字符串
 */
function wrapHtmlAsWordDocument(
  html: string,
  margins: { top: number; bottom: number; left: number; right: number },
): string {
  const toPx = (twips: number) => Math.round(twips / 15);
  const bodyStyle = mergeCss(
    `margin:${toPx(margins.top)}px ${toPx(margins.right)}px ${toPx(margins.bottom)}px ${toPx(margins.left)}px`,
    getWordBlockStyle(),
  );
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
</head>
<body style="${bodyStyle}">
${inlineWordStyles(html)}
</body>
</html>`;
}

/** 纸张尺寸定义（单位为 twips，1 twip = 1/1440 英寸） */
const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  A4: { width: 11906, height: 16838 },
  A3: { width: 16838, height: 23814 },
  Letter: { width: 12240, height: 15840 },
  Legal: { width: 12240, height: 20160 },
  A5: { width: 8392, height: 11906 },
  B5: { width: 9919, height: 14043 },
};

/** 默认页面设置 */
const DEFAULT_PAGE_SETTINGS = {
  paperSize: 'A4',
  orientation: 'portrait' as const,
  margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
};

/**
 * 将纸张尺寸和方向转换为 html-docx-js 所需的 width/height/orient 参数。
 * landscape 时交换宽高。
 */
function getPageDimensions(pageSettings?: {
  paperSize?: string;
  orientation?: string;
  customWidth?: number;
  customHeight?: number;
}) {
  const orientation = pageSettings?.orientation || DEFAULT_PAGE_SETTINGS.orientation;
  let size: { width: number; height: number };

  if (pageSettings?.paperSize === 'Custom') {
    const mmW = pageSettings.customWidth || 210;
    const mmH = pageSettings.customHeight || 297;
    size = {
      width: Math.round((mmW / 25.4) * 1440),
      height: Math.round((mmH / 25.4) * 1440),
    };
  } else {
    const paperSize = pageSettings?.paperSize || DEFAULT_PAGE_SETTINGS.paperSize;
    size = PAPER_SIZES[paperSize] || PAPER_SIZES.A4;
  }

  if (orientation === 'landscape') {
    return { width: size.height, height: size.width, orient: 'landscape' };
  }
  return { width: size.width, height: size.height, orient: 'portrait' };
}

/**
 * 修改 docx buffer 中的 <w:pgSz> 节点，注入正确的纸张尺寸。
 * html-docx-js 默认只支持 Letter 尺寸，此函数将生成的 docx 中的页面尺寸替换为目标纸张尺寸。
 */
async function applyPageSizeToDocx(
  docxBuffer: Buffer,
  pageSettings?: { paperSize?: string; orientation?: string; customWidth?: number; customHeight?: number },
): Promise<Buffer> {
  const dims = getPageDimensions(pageSettings);

  const zip = await JSZip.loadAsync(new Uint8Array(docxBuffer));
  const documentXmlPath = 'word/document.xml';

  const file = zip.file(documentXmlPath);
  if (!file) return docxBuffer;

  let xml = await file.async('text');

  // 替换 <w:pgSz> 中的 w:w、w:h、w:orient 属性
  xml = xml.replace(/(<w:pgSz\s[^>]*?)(w:w=")\d+(")/, `$1$2${dims.width}$3`);
  xml = xml.replace(/(<w:pgSz\s[^>]*?)(w:h=")\d+(")/, `$1$2${dims.height}$3`);
  xml = xml.replace(/(<w:pgSz\s[^>]*?)(w:orient=")[^"]*(")/, `$1$2${dims.orient}$3`);

  zip.file(documentXmlPath, xml);

  const result = await zip.generateAsync({ type: 'nodebuffer' });
  return result;
}

/**
 * 渲染 Word 模板。
 * 单条记录：生成单个 .docx 文件。
 * 多条记录：将每条记录生成独立的 .docx，打包为 .zip 下载。
 *
 * @param templateContent - 模板 HTML 内容
 * @param records - 数据记录列表
 * @returns Word 文档或 ZIP 包的 Buffer
 */
async function renderWord(
  templateContent: string,
  records: Record<string, any>[],
  pageSettings?: PageDecorationSettings & {
    margins?: { top?: number; bottom?: number; left?: number; right?: number };
  },
): Promise<Buffer> {
  const margins = {
    top: pageSettings?.margins?.top ?? DEFAULT_PAGE_SETTINGS.margins.top,
    bottom: pageSettings?.margins?.bottom ?? DEFAULT_PAGE_SETTINGS.margins.bottom,
    left: pageSettings?.margins?.left ?? DEFAULT_PAGE_SETTINGS.margins.left,
    right: pageSettings?.margins?.right ?? DEFAULT_PAGE_SETTINGS.margins.right,
  };

  /** 生成 docx 并注入页面尺寸 + 页眉页脚/背景图（变量按当前记录替换） */
  const buildDocx = async (html: string, record: Record<string, any>): Promise<Buffer> => {
    const docxBlob = htmlDocx.asBlob(html, {
      orientation: pageSettings?.orientation || DEFAULT_PAGE_SETTINGS.orientation,
      margins,
    });
    let buf = Buffer.from(await docxBlob.arrayBuffer());
    buf = await applyPageSizeToDocx(buf, pageSettings);
    return applyPageDecorationsToDocx(buf, pageSettings, getPageDimensions(pageSettings), (text) =>
      replaceVariables(text, record),
    );
  };

  // 单条记录：直接生成 .docx
  if (records.length === 1) {
    let filledHtml = replaceVariables(templateContent, records[0]);
    filledHtml = await processQrcodes(filledHtml, records[0]);
    filledHtml = wrapHtmlAsWordDocument(filledHtml, margins);
    return buildDocx(filledHtml, records[0]);
  }

  // 多条记录：每条记录独立 .docx，打包为 ZIP
  const archive = archiver('zip', { zlib: { level: 9 } });
  const buffers: { name: string; data: Buffer }[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    let filledHtml = replaceVariables(templateContent, record);
    filledHtml = await processQrcodes(filledHtml, record);
    filledHtml = wrapHtmlAsWordDocument(filledHtml, margins);
    buffers.push({ name: `record_${i + 1}.docx`, data: await buildDocx(filledHtml, record) });
  }

  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => {
      resolve(Buffer.concat(chunks as unknown as Uint8Array[]));
    });
    archive.on('error', reject);

    for (const b of buffers) {
      archive.append(b.data, { name: b.name });
    }
    archive.finalize();
  });
}

/**
 * 列配置接口（服务端副本）—— 兼容旧版 columns 格式
 */
interface ExcelColumnConfig {
  key: string;
  label: string;
  fieldPath: string;
  isSequence: boolean;
  defaultValue: string;
  floatDirection: 'none' | 'downward' | 'rightward';
}

/**
 * 网格单元格接口（v2 网格格式）
 */
interface GridCell {
  text: string;
  fieldPath: string;
  floatDirection: 'none' | 'downward' | 'rightward';
  defaultValue: string;
  isSequence: boolean;
  bold: boolean;
}

/**
 * 渲染 Excel 模板（增强版）。
 *
 * 同时支持两种模板格式：
 * - v1 columns 格式：旧版列配置列表
 * - v2 grid 格式：新版网格表格（单元格可绑字段、浮动方向）
 *
 * v2 网格格式说明：
 * - 模板是一个 R×C 的表格，每个单元格可以绑定字段
 * - 每条记录重复渲染一次模板网格
 * - floatDirection='downward'：若字段值为数组，该单元格纵向扩展
 * - floatDirection='rightward'：若字段值为数组，该单元格横向扩展
 *
 * @param templateContent - JSON 格式的模板配置
 * @param records - 数据记录列表
 * @returns Excel 文件的 Buffer
 */
async function renderExcel(templateContent: string, records: Record<string, any>[]): Promise<Buffer> {
  const templateConfig = JSON.parse(templateContent);

  // 根据 version 选择渲染引擎
  if (templateConfig.version === 2 && templateConfig.cells) {
    return renderSpreadsheetGrid(templateConfig, records);
  }

  // 旧版 columns 格式
  return renderColumnsFormat(templateConfig, records);
}

/**
 * 旧版 columns 格式渲染
 */
async function renderColumnsFormat(templateConfig: any, records: Record<string, any>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheetName = templateConfig.sheetName || 'Sheet1';
  const worksheet = workbook.addWorksheet(sheetName);

  const columns: ExcelColumnConfig[] = (templateConfig.columns || []).map((c: any) => ({
    ...c,
    floatDirection: c.floatDirection || 'none',
  }));

  if (columns.length === 0) {
    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  // ===== Phase 1: 计算布局 =====
  const rightwardMaxes: Record<string, number> = {};
  for (const col of columns) {
    if (col.floatDirection === 'rightward' && col.fieldPath) {
      let maxLen = 0;
      for (const record of records) {
        const val = extractFieldValue(record, col.fieldPath);
        if (Array.isArray(val)) {
          maxLen = Math.max(maxLen, val.length);
        }
      }
      rightwardMaxes[col.key] = maxLen || 1;
    }
  }

  const flatHeaders: Array<{ col: ExcelColumnConfig; subIndex?: number }> = [];
  for (const col of columns) {
    if (col.floatDirection === 'rightward') {
      const count = rightwardMaxes[col.key] || 1;
      for (let i = 0; i < count; i++) {
        flatHeaders.push({ col, subIndex: i + 1 });
      }
    } else {
      flatHeaders.push({ col });
    }
  }

  // ===== Phase 2: 写入表头 =====
  const headerRow = worksheet.getRow(1);
  flatHeaders.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    if (h.subIndex !== undefined) {
      cell.value = `${h.col.label || ''}-${h.subIndex}`;
    } else if (h.col.isSequence) {
      cell.value = '#';
    } else {
      cell.value = h.col.label || '';
    }
    cell.font = { bold: true };
  });

  // ===== Phase 3: 逐记录写入数据块 =====
  let currentRow = 2;

  for (let recordIdx = 0; recordIdx < records.length; recordIdx++) {
    const record = records[recordIdx];

    let blockHeight = 1;
    for (const col of columns) {
      if (col.floatDirection === 'downward' && col.fieldPath) {
        const val = extractFieldValue(record, col.fieldPath);
        if (Array.isArray(val)) {
          blockHeight = Math.max(blockHeight, val.length);
        }
      }
    }

    let colOffset = 1;

    for (const col of columns) {
      if (col.isSequence) {
        for (let r = 0; r < blockHeight; r++) {
          const cell = worksheet.getCell(currentRow + r, colOffset);
          cell.value = r === 0 ? recordIdx + 1 : '';
        }
        colOffset++;
      } else if (col.floatDirection === 'none') {
        const value = extractFieldValue(record, col.fieldPath);
        const displayValue = value != null ? value : col.defaultValue ?? '';
        const cell = worksheet.getCell(currentRow, colOffset);
        cell.value = displayValue;
        if (blockHeight > 1) {
          worksheet.mergeCells(currentRow, colOffset, currentRow + blockHeight - 1, colOffset);
        }
        colOffset++;
      } else if (col.floatDirection === 'downward') {
        const val = extractFieldValue(record, col.fieldPath);
        if (Array.isArray(val)) {
          for (let r = 0; r < val.length; r++) {
            const cell = worksheet.getCell(currentRow + r, colOffset);
            const itemValue = val[r];
            cell.value =
              itemValue != null ? (typeof itemValue === 'object' ? JSON.stringify(itemValue) : String(itemValue)) : '';
          }
          for (let r = val.length; r < blockHeight; r++) {
            worksheet.getCell(currentRow + r, colOffset).value = '';
          }
        } else {
          const cell = worksheet.getCell(currentRow, colOffset);
          cell.value = val != null ? val : col.defaultValue ?? '';
          if (blockHeight > 1) {
            worksheet.mergeCells(currentRow, colOffset, currentRow + blockHeight - 1, colOffset);
          }
        }
        colOffset++;
      } else if (col.floatDirection === 'rightward') {
        const val = extractFieldValue(record, col.fieldPath);
        const count = rightwardMaxes[col.key] || 1;
        if (Array.isArray(val)) {
          for (let i = 0; i < count; i++) {
            const cell = worksheet.getCell(currentRow, colOffset + i);
            if (i < val.length) {
              const itemValue = val[i];
              cell.value =
                itemValue != null
                  ? typeof itemValue === 'object'
                    ? JSON.stringify(itemValue)
                    : String(itemValue)
                  : '';
            } else {
              cell.value = '';
            }
          }
        } else {
          const cell = worksheet.getCell(currentRow, colOffset);
          cell.value = val != null ? val : col.defaultValue ?? '';
          if (count > 1) {
            worksheet.mergeCells(currentRow, colOffset, currentRow, colOffset + count - 1);
          }
        }
        colOffset += count;
      }
    }

    currentRow += blockHeight;
  }

  // ===== Phase 4: 设置列宽 =====
  flatHeaders.forEach((_, idx) => {
    worksheet.getColumn(idx + 1).width = 18;
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * 新版网格格式（v2）渲染引擎。
 *
 * 模板是一个 R×C 的表格网格，每条记录重复渲染一次。
 * 支持：
 * - 任意行列的静态文本
 * - 字段绑定（fieldPath 替换为记录值）
 * - 向下浮动：数组字段纵向扩展为该单元格增加多行
 * - 向右浮动：数组字段横向扩展为该单元格增加多列
 * - 序号列 (isSequence)
 */
async function renderSpreadsheetGrid(config: any, records: Record<string, any>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(config.sheetName || 'Sheet1');
  const rowCount: number = config.rowCount || 1;
  const colCount: number = config.colCount || 1;
  const cells: Record<string, GridCell> = config.cells || {};

  const getCell = (r: number, c: number): GridCell => cells[`R${r}C${c}`] || ({} as any);

  let outputRow = 1;

  // 遍历每条记录
  for (let recordIdx = 0; recordIdx < records.length; recordIdx++) {
    const record = records[recordIdx];

    // 遍历模板的每一行
    for (let r = 0; r < rowCount; r++) {
      // 计算当前模板行是否有向下浮动的字段，以及最大扩展行数
      let extraRows = 0;
      const downwardFieldData: Record<number, { values: any[]; text: string }> = {};

      for (let c = 0; c < colCount; c++) {
        const cell = getCell(r, c);
        if (cell.floatDirection === 'downward' && cell.fieldPath) {
          const val = extractFieldValue(record, cell.fieldPath);
          if (Array.isArray(val) && val.length > 1) {
            extraRows = Math.max(extraRows, val.length - 1);
            downwardFieldData[c] = { values: val, text: cell.text || '' };
          }
        }
      }

      // 写入当前行的各列
      let outputCol = 1;

      for (let c = 0; c < colCount; c++) {
        const cell = getCell(r, c);

        if (cell.isSequence) {
          // 序号列
          for (let rr = 0; rr <= extraRows; rr++) {
            const targetCell = worksheet.getCell(outputRow + rr, outputCol);
            targetCell.value = rr === 0 ? recordIdx + 1 : '';
          }
          outputCol++;
          continue;
        }

        if (cell.floatDirection === 'rightward' && cell.fieldPath) {
          // 向右浮动：横向展开
          const val = extractFieldValue(record, cell.fieldPath);
          if (Array.isArray(val) && val.length > 0) {
            for (let i = 0; i < val.length; i++) {
              const targetCell = worksheet.getCell(outputRow, outputCol + i);
              const itemValue = val[i];
              targetCell.value =
                itemValue != null
                  ? typeof itemValue === 'object'
                    ? JSON.stringify(itemValue)
                    : String(itemValue)
                  : '';
            }
            outputCol += Math.max(val.length, 1);
          } else {
            // 非数组：显示文本+值
            const value = extractFieldValue(record, cell.fieldPath);
            const displayVal =
              value != null
                ? value
                : cell.defaultValue ?? (cell.text ? replaceTextPlaceholders(cell.text, record) : '');
            worksheet.getCell(outputRow, outputCol).value = displayVal;
            outputCol++;
          }
          // 该列之后的列需要跳过被占用的索引
          continue;
        }

        if (downwardFieldData[c]) {
          // 向下浮动：纵向展开
          const { values, text } = downwardFieldData[c];
          const textCell = worksheet.getCell(outputRow, outputCol);
          textCell.value = text ? replaceTextPlaceholders(text, record) : values[0] != null ? String(values[0]) : '';

          for (let rr = 1; rr <= extraRows; rr++) {
            const targetCell = worksheet.getCell(outputRow + rr, outputCol);
            if (rr < values.length) {
              const itemValue = values[rr];
              targetCell.value =
                itemValue != null
                  ? typeof itemValue === 'object'
                    ? JSON.stringify(itemValue)
                    : String(itemValue)
                  : '';
            } else {
              targetCell.value = '';
            }
          }
          outputCol++;
          continue;
        }

        // 普通单元格（无浮动 或 无数组值）
        let cellValue: any = cell.text ? replaceTextPlaceholders(cell.text, record) : '';

        if (cell.fieldPath) {
          const val = extractFieldValue(record, cell.fieldPath);
          cellValue =
            val != null ? val : cell.defaultValue ?? (cell.text ? replaceTextPlaceholders(cell.text, record) : '');
        }

        // 如果当前行有向下扩展，普通单元格需要跨行合并
        const writeCell = worksheet.getCell(outputRow, outputCol);
        writeCell.value = cellValue;

        if (extraRows > 0) {
          worksheet.mergeCells(outputRow, outputCol, outputRow + extraRows, outputCol);
        }

        outputCol++;
      }

      // 跳过高亮扩展行
      outputRow += 1 + extraRows;
    }
  }

  // 设置列宽
  for (let c = 0; c < colCount; c++) {
    worksheet.getColumn(c + 1).width = 18;
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * 模板打印服务端插件。
 * 负责：
 * - 定义 printTemplates 数据表
 * - 注册模板渲染 API（printTemplates:render）
 * - 设置 ACL 权限
 */
export class PluginTemplatePrintServer extends Plugin {
  async afterAdd() {}

  /**
   * 在插件加载前定义 printTemplates 数据表结构。
   * 数据表字段包括：名称、类型、关联数据表、模板内容、变量、描述、启用状态。
   */
  async beforeLoad() {
    this.db.collection({
      name: 'printTemplates',
      title: 'Print Templates',
      filterTargetKey: 'id',
      fields: [
        { type: 'string', name: 'name', title: 'Template Name' },
        { type: 'string', name: 'type', title: 'Type' },
        { type: 'string', name: 'collectionName', title: 'Collection Name' },
        { type: 'text', name: 'content', title: 'Template Content', length: 'long' },
        { type: 'json', name: 'variables', title: 'Variables' },
        { type: 'json', name: 'pageSettings', title: 'Page Settings' },
        { type: 'text', name: 'description', title: 'Description' },
        { type: 'boolean', name: 'enabled', title: 'Enabled', defaultValue: true },
      ],
    });
  }

  async load() {
    // 注册模板渲染 API
    this.app.resourceManager.registerActionHandlers({
      'printTemplates:render': async (ctx, next) => {
        const { templateId, recordIds } = ctx.action.params.values || ctx.action.params;

        // 参数校验
        if (!templateId) {
          ctx.throw(400, 'Template ID is required');
        }

        const validRecordIds = Array.isArray(recordIds) ? recordIds.filter((id) => id != null) : [];
        if (validRecordIds.length === 0) {
          ctx.throw(400, 'Record IDs are required');
        }

        // 查询模板
        const repo = ctx.db.getRepository('printTemplates');
        const template = await repo.findOne({ filterByTk: templateId });

        if (!template) {
          ctx.throw(404, 'Template not found');
        }

        // 查询目标数据表记录
        const targetCollection = ctx.db.getCollection(template.collectionName);
        const filterTargetKey = targetCollection?.filterTargetKey || 'id';
        const targetRepo = ctx.db.getRepository(template.collectionName);
        const records = await targetRepo.find({
          filter: { [Array.isArray(filterTargetKey) ? filterTargetKey[0] : filterTargetKey]: validRecordIds },
          appends: ctx.action.params.appends || [],
        });

        if (!records || records.length === 0) {
          ctx.throw(404, 'No records found');
        }

        // 将 ORM 对象转换为普通 JS 对象
        const plainRecords = records.map((r: any) => (r.toJSON ? r.toJSON() : r));

        let buffer: Buffer;
        let contentType: string;
        let filename: string;

        // 根据模板类型调用对应的渲染函数
        if (template.type === 'word') {
          buffer = await renderWord(template.content, plainRecords, template.pageSettings);
          if (plainRecords.length > 1) {
            // 多条记录：返回 ZIP 包
            contentType = 'application/zip';
            filename = `${template.name}_records.zip`;
          } else {
            // 单条记录：返回 .docx
            contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            filename = `${template.name}_${
              plainRecords[0][Array.isArray(filterTargetKey) ? filterTargetKey[0] : filterTargetKey] || 'document'
            }.docx`;
          }
        } else {
          buffer = await renderExcel(template.content, plainRecords);
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          filename = `${template.name}.xlsx`;
        }

        // 设置响应头
        ctx.set('Content-Type', contentType);
        ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        ctx.body = buffer;
        await next();
      },
    });

    // 允许已登录用户访问 printTemplates 资源
    this.app.acl.allow('printTemplates', '*', 'loggedIn');

    // ===== 字体配置 API =====
    // 单例配置：get 读取字体白名单，set 更新字体白名单
    this.app.resourceManager.define({
      name: 'printTemplateFonts',
      actions: {
        async get(ctx, next) {
          const repo = ctx.db.getRepository('printTemplateFonts');
          let record = await repo.findOne();
          if (!record) {
            // 首次访问时创建默认记录
            record = await repo.create({
              values: {
                fontWhitelist: [
                  'SimSun',
                  'SimHei',
                  'KaiTi',
                  'Microsoft YaHei',
                  'FangSong',
                  'Arial',
                  'Times New Roman',
                  'Verdana',
                  'Georgia',
                  'Courier New',
                  'Tahoma',
                ],
              },
            });
          }
          ctx.body = record.toJSON();
          await next();
        },
        async set(ctx, next) {
          const repo = ctx.db.getRepository('printTemplateFonts');
          const values = ctx.action.params.values || {};
          let record = await repo.findOne();
          if (record) {
            await record.update(values);
          } else {
            record = await repo.create({ values });
          }
          ctx.body = record.toJSON();
          await next();
        },
      },
    });
    this.app.acl.allow('printTemplateFonts', 'get', 'loggedIn');
    this.app.acl.allow('printTemplateFonts', 'set', 'loggedIn');
  }

  async install() {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginTemplatePrintServer;
