/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import JSZip from 'jszip';

/**
 * Word 页面装饰（页眉/页脚/背景图）注入。
 *
 * html-docx-js 生成的 docx 不含页眉页脚，本模块在生成后通过 JSZip 二次加工：
 * - 页眉/页脚：新建 word/header1.xml、word/footer1.xml（Word 原生页眉页脚，
 *   配置一次即对整篇文档所有页面生效），支持 {page}/{pages} 页码域与数据变量；
 * - 背景图：嵌入 word/media/ 并以 behindDoc 锚定图片放进页眉
 *   （Word 水印的标准做法，随页眉在每页重复），支持透明度与 拉伸/平铺/适应/裁剪 四种显示方式。
 */

/**
 * 页眉/页脚片段：
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

/** 页眉/页脚配置（items 为片段列表；text 为旧版纯文本，仍兼容） */
export interface HeaderFooterConfig {
  align?: 'left' | 'center' | 'right';
  items?: HeaderFooterItem[];
  text?: string;
  /** 字体（如 SimSun / Microsoft YaHei）；西文与中文分别映射，默认 Helvetica + 宋体 */
  fontFamily?: string;
  /** 字号（pt，与内容编辑器字号体系一致），导出时换算为 Word 半磅（1pt = 2 半磅），默认 9 */
  fontSize?: number;
  /** 行间距（倍数，如 1.5），导出时换算为 w:spacing，默认 1.5 */
  lineHeight?: number;
}

/** 背景图配置（image 为 dataURL，width/height 为图片原始像素尺寸） */
export interface BackgroundConfig {
  image?: string;
  width?: number;
  height?: number;
  size?: 'stretch' | 'tile' | 'contain' | 'cover';
  /** 不透明度（0-100，100 = 完全不透明） */
  opacity?: number;
}

/** 注入装饰所需的页面设置子集 */
export interface PageDecorationSettings {
  paperSize?: string;
  orientation?: string;
  customWidth?: number;
  customHeight?: number;
  header?: HeaderFooterConfig;
  footer?: HeaderFooterConfig;
  background?: BackgroundConfig;
}

/** pt → Word 半磅（sz）：1pt = 2 半磅 */
const ptToHalfPoints = (pt: number): number => Math.round(pt * 2);

/** 常用中文系统字体：字体名 → Word eastAsia 字体名（西文字体中文回退宋体） */
const CJK_FONT_MAP: Record<string, string> = {
  SimSun: '宋体',
  SimHei: '黑体',
  KaiTi: '楷体',
  'Microsoft YaHei': '微软雅黑',
  FangSong: '仿宋',
};

/**
 * 构建页眉页脚文字 run properties（字体/字号，颜色固定 #666）。
 * 默认 Helvetica + 宋体、9pt（小五 → sz=18），与编辑器预览一致。
 */
function buildHeaderFooterRpr(fontFamily?: string, fontSize?: number): string {
  const family = fontFamily || 'Helvetica';
  const eastAsia = CJK_FONT_MAP[family] || '宋体';
  const sz = ptToHalfPoints(fontSize ?? 9);
  return (
    `<w:rPr><w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:eastAsia="${eastAsia}"/>` +
    `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:color w:val="666666"/></w:rPr>`
  );
}

/** header/footer XML 所需的命名空间声明 */
const HEADER_FOOTER_NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
].join(' ');

/** 1 twip = 635 EMU；1 px(96dpi) = 9525 EMU */
const EMU_PER_TWIP = 635;
const EMU_PER_PX = 9525;

function xmlEscapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** PAGE / NUMPAGES 页码域（文字样式与普通文本一致） */
function pageField(instr: string, rpr: string): string {
  return `<w:fldSimple w:instr="${instr}"><w:r>${rpr}<w:t>1</w:t></w:r></w:fldSimple>`;
}
const PAGE_FIELD = (rpr: string) => pageField(' PAGE \\* MERGEFORMAT ', rpr);
const PAGES_FIELD = (rpr: string) => pageField(' NUMPAGES \\* MERGEFORMAT ', rpr);

/** 页眉/页脚引用的图片（待写入 word/media/ 并注册 rels） */
interface HeaderImageRef {
  rId: string;
  fileName: string;
  ext: 'png' | 'jpg';
  data: Buffer;
  widthPx: number;
  heightPx: number;
}

/** 构建页眉/页脚部件（含图片引用收集） */
interface BuiltHeaderFooter {
  xml: string;
  images: HeaderImageRef[];
}

/** 解析 dataURL 图片（仅接受 PNG/JPEG，Word 兼容性最好） */
function parseImageDataUrl(dataUrl: string): { ext: 'png' | 'jpg'; mime: string; data: Buffer } | null {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const ext = m[1] === 'png' ? 'png' : 'jpg';
  try {
    return { ext, mime: ext === 'png' ? 'image/png' : 'image/jpeg', data: Buffer.from(m[2], 'base64') };
  } catch {
    return null;
  }
}

/** 文本转 run 列表：{page}/{pages} 转 Word 页码域，其余按普通文本 run 输出（变量已由 resolveText 替换） */
function textToRuns(text: string, rpr: string): string {
  return text
    .split(/(\{page\}|\{pages\})/g)
    .map((part) => {
      if (part === '{page}') return PAGE_FIELD(rpr);
      if (part === '{pages}') return PAGES_FIELD(rpr);
      if (!part) return '';
      return `<w:r>${rpr}<w:t xml:space="preserve">${xmlEscapeText(part)}</w:t></w:r>`;
    })
    .join('');
}

/** 构建页眉/页脚内嵌图片 run（inline 布局，随文本流，按指定显示尺寸） */
function buildInlineImageRun(widthPx: number, heightPx: number, rId: string, docPrId: number): string {
  const cx = Math.round(widthPx * EMU_PER_PX);
  const cy = Math.round(heightPx * EMU_PER_PX);
  return (
    `<w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${docPrId}" name="HeaderImage${docPrId}"/>` +
    `<wp:cNvGraphicFramePr/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="${docPrId}" name="HeaderImage${docPrId}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic>` +
    `</a:graphicData></a:graphic>` +
    `</wp:inline>` +
    `</w:drawing></w:r>`
  );
}

/** 页眉/页脚是否有内容（items 或旧版 text） */
function headerFooterHasContent(cfg: HeaderFooterConfig | undefined): boolean {
  if (!cfg) return false;
  if (cfg.items && cfg.items.length > 0) return true;
  return !!cfg.text?.trim();
}

/**
 * 构建页眉/页脚内容 XML。
 * 片段列表按段落分组（break 片段开启新段落）；文本片段中的 {page}/{pages} 转为 Word 页码域，
 * 数据变量由 resolveText 提前替换；图片片段转为内嵌 drawing run 并收集图片引用。
 * 旧版 text 配置自动转为文本片段以保持兼容。
 */
function buildHeaderFooterXml(
  cfg: HeaderFooterConfig,
  part: 'header' | 'footer',
  resolveText: (text: string) => string,
): BuiltHeaderFooter {
  const align = cfg.align || 'center';
  const jc = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
  // 字体/字号/行间距：默认 Helvetica + 宋体、9pt（小五）、1.5 倍行距（与编辑器预览一致）
  const rpr = buildHeaderFooterRpr(cfg.fontFamily, cfg.fontSize);
  const lineHeight = cfg.lineHeight ?? 1.5;
  const spacing = lineHeight > 0 ? `<w:spacing w:line="${Math.round(lineHeight * 240)}" w:lineRule="auto"/>` : '';
  const items: HeaderFooterItem[] =
    cfg.items && cfg.items.length > 0
      ? cfg.items
      : (cfg.text || '').split(/\r?\n/).map((line) => ({ type: 'text' as const, text: line }));

  const images: HeaderImageRef[] = [];
  const paragraphs: string[] = [];
  let runs: string[] = [];
  let docPrId = 1000;
  const flush = () => {
    if (runs.length > 0) {
      paragraphs.push(`<w:p><w:pPr>${spacing}<w:jc w:val="${jc}"/></w:pPr>${runs.join('')}</w:p>`);
      runs = [];
    }
  };

  for (const item of items) {
    if (item.type === 'break') {
      flush();
    } else if (item.type === 'page') {
      runs.push(PAGE_FIELD(rpr));
    } else if (item.type === 'pages') {
      runs.push(PAGES_FIELD(rpr));
    } else if (item.type === 'image') {
      const img = item.image ? parseImageDataUrl(item.image) : null;
      if (!img) continue;
      docPrId += 1;
      // 显示尺寸：优先用户指定；缺宽缺高时按 4:3 兜底
      const widthPx =
        item.width && item.width > 0
          ? item.width
          : item.height && item.height > 0
            ? Math.round((item.height * 4) / 3)
            : 100;
      const heightPx = item.height && item.height > 0 ? item.height : Math.round((widthPx * 3) / 4);
      // rId1 预留给背景图，页眉/页脚图片从 rId2 起
      const rId = `rId${2 + images.length}`;
      images.push({
        rId,
        fileName: `${part}Image${images.length + 1}.${img.ext}`,
        ext: img.ext,
        data: img.data,
        widthPx,
        heightPx,
      });
      runs.push(buildInlineImageRun(widthPx, heightPx, rId, docPrId));
    } else {
      runs.push(textToRuns(resolveText(item.text || ''), rpr));
    }
  }
  flush();

  return { xml: paragraphs.join(''), images };
}

/**
 * 构建背景图的锚定图形段落（behindDoc，位于页眉中 → 每页重复，正文文字浮于其上）。
 * pageW/pageH 为页面尺寸（EMU）。
 */
function buildBackgroundDrawing(bg: BackgroundConfig, pageW: number, pageH: number, rId: string): string {
  const size = bg.size || 'stretch';
  const imgW = (bg.width || 0) * EMU_PER_PX;
  const imgH = (bg.height || 0) * EMU_PER_PX;

  let x = 0;
  let y = 0;
  let cx = pageW;
  let cy = pageH;
  let srcRect = '';
  let fill = '<a:stretch><a:fillRect/></a:stretch>';

  if (size === 'tile') {
    // 平铺：整页矩形 + tile 填充（按图片原始尺寸平铺）
    fill = '<a:tile/>';
  } else if (size === 'contain' && imgW > 0 && imgH > 0) {
    // 适应页面：等比缩放至页内并居中
    const scale = Math.min(pageW / imgW, pageH / imgH);
    cx = Math.round(imgW * scale);
    cy = Math.round(imgH * scale);
    x = Math.round((pageW - cx) / 2);
    y = Math.round((pageH - cy) / 2);
  } else if (size === 'cover' && imgW > 0 && imgH > 0) {
    // 裁剪铺满：按比例裁剪源图后拉伸到整页（与 CSS background-size:cover 一致）
    const pageRatio = pageW / pageH;
    const imgRatio = imgW / imgH;
    if (imgRatio > pageRatio) {
      const crop = Math.round(((1 - pageRatio / imgRatio) / 2) * 100000);
      if (crop > 0) srcRect = `<a:srcRect l="${crop}" r="${crop}"/>`;
    } else if (imgRatio < pageRatio) {
      const crop = Math.round(((1 - imgRatio / pageRatio) / 2) * 100000);
      if (crop > 0) srcRect = `<a:srcRect t="${crop}" b="${crop}"/>`;
    }
  }
  // stretch（默认）：整页拉伸，cx/cy 即页面尺寸

  const opacity = Math.max(0, Math.min(100, bg.opacity ?? 100));
  const alpha = opacity < 100 ? `<a:alphaModFix amt="${opacity * 1000}"/>` : '';

  return (
    `<w:p><w:r><w:drawing>` +
    `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="page"><wp:posOffset>${x}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${y}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:wrapNone/>` +
    `<wp:docPr id="1001" name="PageBackground"/>` +
    `<wp:cNvGraphicFramePr/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="pageBackground"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}">${alpha}</a:blip>${srcRect}${fill}</pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic>` +
    `</a:graphicData></a:graphic>` +
    `</wp:anchor>` +
    `</w:drawing></w:r></w:p>`
  );
}

/**
 * 向 html-docx-js 生成的 docx 注入页眉/页脚/背景图。
 *
 * @param docxBuffer - 原始 docx
 * @param pageSettings - 页面设置（含 header/footer/background 配置）
 * @param pageDimensions - 页面尺寸（twips，与 pgSz 一致）
 * @param resolveText - 文本变量替换函数（将 {fieldPath} 替换为记录值）
 * @returns 加工后的 docx；无任何装饰配置时原样返回
 */
export async function applyPageDecorationsToDocx(
  docxBuffer: Buffer,
  pageSettings: PageDecorationSettings | undefined,
  pageDimensions: { width: number; height: number },
  resolveText: (text: string) => string,
): Promise<Buffer> {
  const headerCfg = pageSettings?.header;
  const footerCfg = pageSettings?.footer;
  const bgCfg = pageSettings?.background;
  const headerHas = headerFooterHasContent(headerCfg);
  const footerHas = headerFooterHasContent(footerCfg);
  const bg = bgCfg?.image ? parseImageDataUrl(bgCfg.image) : null;
  const needHeader = headerHas || !!bg;

  if (!needHeader && !footerHas) {
    return docxBuffer;
  }

  const zip = await JSZip.loadAsync(new Uint8Array(docxBuffer));

  // 构建页眉/页脚内容（含图片引用收集），随后统一写 media 与 rels
  // 背景图场景下 header 部件仅承载背景 drawing（headerCfg 可能为空）
  const headerBuilt = needHeader ? buildHeaderFooterXml(headerCfg ?? {}, 'header', resolveText) : null;
  const footerBuilt = footerHas && footerCfg ? buildHeaderFooterXml(footerCfg, 'footer', resolveText) : null;

  // 1) 图片写入 word/media/：背景图 + 页眉/页脚内嵌图片
  //   （转为 Uint8Array：JSZip 类型定义不接受 Node Buffer）
  if (bg) {
    zip.file(`word/media/pageBackground.${bg.ext}`, new Uint8Array(bg.data));
  }
  const allImages = [...(headerBuilt?.images ?? []), ...(footerBuilt?.images ?? [])];
  for (const img of allImages) {
    zip.file(`word/media/${img.fileName}`, new Uint8Array(img.data));
  }

  // 2) 生成 header1.xml / footer1.xml（type=default，对整节所有页面生效）
  if (headerBuilt) {
    const bgDrawing =
      bg && bgCfg
        ? buildBackgroundDrawing(
            bgCfg,
            pageDimensions.width * EMU_PER_TWIP,
            pageDimensions.height * EMU_PER_TWIP,
            'rId1',
          )
        : '';
    const headerXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<w:hdr ${HEADER_FOOTER_NS}>${bgDrawing}${headerBuilt.xml}</w:hdr>`;
    zip.file('word/header1.xml', headerXml);
    const headerRels: string[] = [];
    if (bg) {
      headerRels.push(
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pageBackground.${bg.ext}"/>`,
      );
    }
    for (const img of headerBuilt.images) {
      headerRels.push(
        `<Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.fileName}"/>`,
      );
    }
    if (headerRels.length > 0) {
      zip.file(
        'word/_rels/header1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${headerRels.join(
            '',
          )}</Relationships>`,
      );
    }
  }
  if (footerBuilt) {
    const footerXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<w:ftr ${HEADER_FOOTER_NS}>${footerBuilt.xml}</w:ftr>`;
    zip.file('word/footer1.xml', footerXml);
    if (footerBuilt.images.length > 0) {
      const footerRels = footerBuilt.images
        .map(
          (img) =>
            `<Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.fileName}"/>`,
        )
        .join('');
      zip.file(
        'word/_rels/footer1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${footerRels}</Relationships>`,
      );
    }
  }

  // 3) [Content_Types].xml：补充 header/footer 与图片扩展名声明
  const ctFile = zip.file('[Content_Types].xml');
  if (!ctFile) return docxBuffer;
  let ctXml = await ctFile.async('text');
  if (needHeader && !ctXml.includes('/word/header1.xml')) {
    ctXml = ctXml.replace(
      '</Types>',
      `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>`,
    );
  }
  if (footerHas && !ctXml.includes('/word/footer1.xml')) {
    ctXml = ctXml.replace(
      '</Types>',
      `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`,
    );
  }
  const extSet = new Set<string>([...(bg ? [bg.ext] : []), ...allImages.map((img) => img.ext)]);
  for (const ext of extSet) {
    if (!new RegExp(`Extension="${ext}"`).test(ctXml)) {
      ctXml = ctXml.replace(
        /<Types[^>]*>/,
        `$&<Default Extension="${ext}" ContentType="${ext === 'png' ? 'image/png' : 'image/jpeg'}"/>`,
      );
    }
  }
  zip.file('[Content_Types].xml', ctXml);

  // 4) word/_rels/document.xml.rels：注册 header/footer 关系（分配不冲突的 rId）
  const relsPath = 'word/_rels/document.xml.rels';
  const relsFile = zip.file(relsPath);
  if (!relsFile) return docxBuffer;
  let relsXml = await relsFile.async('text');
  let maxRid = 0;
  const ridRe = /Id="rId(\d+)"/g;
  let ridMatch: RegExpExecArray | null;
  while ((ridMatch = ridRe.exec(relsXml))) {
    maxRid = Math.max(maxRid, parseInt(ridMatch[1], 10));
  }
  let refs = '';
  if (needHeader) {
    maxRid += 1;
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="rId${maxRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>`,
    );
    refs += `<w:headerReference w:type="default" r:id="rId${maxRid}"/>`;
  }
  if (footerHas) {
    maxRid += 1;
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="rId${maxRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`,
    );
    refs += `<w:footerReference w:type="default" r:id="rId${maxRid}"/>`;
  }
  zip.file(relsPath, relsXml);

  // 5) word/document.xml：向 sectPr 插入引用（必须在 pgSz 之前，保持 schema 子元素顺序）
  const docPath = 'word/document.xml';
  const docFile = zip.file(docPath);
  if (!docFile) return docxBuffer;
  let docXml = await docFile.async('text');
  if (!/<w:document\b[^>]*\bxmlns:r=/.test(docXml)) {
    docXml = docXml.replace(
      /<w:document\b/,
      '<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    );
  }
  docXml = docXml.replace(/<w:sectPr\b[^>]*>/, (m) => `${m}${refs}`);
  zip.file(docPath, docXml);

  return zip.generateAsync({ type: 'nodebuffer' });
}
