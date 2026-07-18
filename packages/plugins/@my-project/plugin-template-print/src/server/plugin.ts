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
 * 修复 Word 文档中表格边框样式。
 * 编辑器保存的 HTML 只有 DOM 结构和 CSS 类名，但没有实际的 CSS 规则。
 * Word 的 HTML 渲染器需要内联样式来正确显示表格边框。
 *
 * @param html - 原始模板 HTML
 * @returns 注入表格样式后的 HTML
 */
function fixTableBordersForWord(html: string): string {
  return `<style>
    table { border-collapse: collapse; border: none; width: 100% }
    td, th { border: 1px solid #000; padding: 2px 5px; vertical-align: top }
    th { background: #f0f0f0 }
  </style>${html}`;
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
  pageSettings?: {
    paperSize?: string;
    orientation?: string;
    margins?: { top?: number; bottom?: number; left?: number; right?: number };
  },
): Promise<Buffer> {
  const margins = {
    top: pageSettings?.margins?.top ?? DEFAULT_PAGE_SETTINGS.margins.top,
    bottom: pageSettings?.margins?.bottom ?? DEFAULT_PAGE_SETTINGS.margins.bottom,
    left: pageSettings?.margins?.left ?? DEFAULT_PAGE_SETTINGS.margins.left,
    right: pageSettings?.margins?.right ?? DEFAULT_PAGE_SETTINGS.margins.right,
  };

  // 单条记录：直接生成 .docx
  if (records.length === 1) {
    let filledHtml = fixTableBordersForWord(replaceVariables(templateContent, records[0]));
    filledHtml = await processQrcodes(filledHtml, records[0]);
    const docxBlob = htmlDocx.asBlob(filledHtml, {
      orientation: 'portrait',
      margins,
    });
    const docxBuffer = Buffer.from(await docxBlob.arrayBuffer());
    return applyPageSizeToDocx(docxBuffer, pageSettings);
  }

  // 多条记录：每条记录独立 .docx，打包为 ZIP
  const archive = archiver('zip', { zlib: { level: 9 } });
  const buffers: { name: string; data: Buffer }[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    let filledHtml = fixTableBordersForWord(replaceVariables(templateContent, record));
    filledHtml = await processQrcodes(filledHtml, record);
    const docxBlob = htmlDocx.asBlob(filledHtml, {
      orientation: 'portrait',
      margins,
    });
    let buf = Buffer.from(await docxBlob.arrayBuffer());
    buf = await applyPageSizeToDocx(buf, pageSettings);
    buffers.push({ name: `record_${i + 1}.docx`, data: buf });
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
 * 渲染 Excel 模板。
 * 根据模板配置中的列定义，生成带表头和数据行的 Excel 文件。
 *
 * @param templateContent - JSON 格式的模板配置（包含 columns 数组）
 * @param records - 数据记录列表
 * @returns Excel 文件的 Buffer
 */
async function renderExcel(templateContent: string, records: Record<string, any>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // 解析模板 JSON 配置
  const templateConfig = JSON.parse(templateContent);
  const sheetName = templateConfig.sheetName || 'Sheet1';
  const worksheet = workbook.addWorksheet(sheetName);

  if (templateConfig.columns) {
    // 写入表头行（加粗）
    const headerRow = worksheet.getRow(1);
    templateConfig.columns.forEach((col: any, colIndex: number) => {
      const cell = headerRow.getCell(colIndex + 1);
      cell.value = col.label || '';
      cell.font = { bold: true };
    });

    // 从第 2 行开始填充数据行
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const row = worksheet.getRow(i + 2);

      templateConfig.columns.forEach((col: any, colIndex: number) => {
        const cell = row.getCell(colIndex + 1);
        if (col.isSequence) {
          // 序号列：自动生成行号
          cell.value = i + 1;
        } else if (col.fieldPath) {
          // 字段列：从记录中提取值，为空时使用默认值
          const value = extractFieldValue(record, col.fieldPath);
          cell.value = value != null ? value : col.defaultValue ?? '';
        }
      });
    }
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
        const targetRepo = ctx.db.getRepository(template.collectionName);
        const records = await targetRepo.find({
          filter: { id: validRecordIds },
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
            filename = `${template.name}_${plainRecords[0].id || 'document'}.docx`;
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
