/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { applyPageDecorationsToDocx } from '../word-decorations';

/** 1x1 红色 PNG 的 dataURL */
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** A4 纵向页面尺寸（twips） */
const A4_DIMS = { width: 11906, height: 16838 };

/** 构造一个模拟 html-docx-js 产出的最小 docx */
async function buildMinimalDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<w:body><w:p><w:r><w:t>content</w:t></w:r></w:p>` +
      `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>` +
      `</w:body></w:document>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function readPart(buffer: Buffer, path: string): Promise<string | undefined> {
  const zip = await JSZip.loadAsync(new Uint8Array(buffer));
  return zip.file(path)?.async('text');
}

describe('applyPageDecorationsToDocx', () => {
  it('无装饰配置时原样返回', async () => {
    const docx = await buildMinimalDocx();
    const result = await applyPageDecorationsToDocx(docx, undefined, A4_DIMS, (s) => s);
    // 注：equals 参数转为 Uint8Array——新版 TS（5.7+ 泛型 TypedArray）下 Buffer 与 Uint8Array 参数不兼容
    expect(result.equals(new Uint8Array(docx))).toBe(true);

    const result2 = await applyPageDecorationsToDocx(docx, { header: { text: '  ' } }, A4_DIMS, (s) => s);
    expect(result2.equals(new Uint8Array(docx))).toBe(true);
  });

  it('注入页眉页脚文本（含页码域与变量替换），所有页面生效', async () => {
    const docx = await buildMinimalDocx();
    const result = await applyPageDecorationsToDocx(
      docx,
      {
        header: { text: '合同编号:{orderNo}', align: 'right' },
        footer: { text: '第 {page} / {pages} 页', align: 'center' },
      },
      A4_DIMS,
      (s) => s.replace('{orderNo}', 'NO-001'),
    );

    // 页眉：变量替换 + 对齐 + 文本样式
    const headerXml = await readPart(result, 'word/header1.xml');
    expect(headerXml).toContain('NO-001');
    expect(headerXml).toContain('<w:jc w:val="right"/>');
    expect(headerXml).toContain('<w:sz w:val="18"/>');

    // 页脚：PAGE / NUMPAGES 页码域
    const footerXml = await readPart(result, 'word/footer1.xml');
    expect(footerXml).toContain('w:instr=" PAGE \\* MERGEFORMAT "');
    expect(footerXml).toContain('w:instr=" NUMPAGES \\* MERGEFORMAT "');

    // document.xml：sectPr 引用且在 pgSz 之前（schema 顺序要求）
    const documentXml = (await readPart(result, 'word/document.xml')) ?? '';
    const headerRef = /<w:headerReference w:type="default" r:id="(rId\d+)"\/>/.exec(documentXml);
    const footerRef = /<w:footerReference w:type="default" r:id="(rId\d+)"\/>/.exec(documentXml);
    expect(headerRef).toBeTruthy();
    expect(footerRef).toBeTruthy();
    const headerRid = headerRef?.[1] || '';
    expect(documentXml.indexOf(headerRef?.[0] || '')).toBeLessThan(documentXml.indexOf('<w:pgSz'));

    // rels：新关系不冲突（既有 rId1 是 styles，新引用应为 rId2/rId3）
    const relsXml = await readPart(result, 'word/_rels/document.xml.rels');
    expect(relsXml).toContain(`Id="${headerRid}"`);
    expect(relsXml).toContain(`relationships/header" Target="header1.xml"`);
    expect(relsXml).toContain(`relationships/footer" Target="footer1.xml"`);
    expect(headerRid).not.toBe('rId1');

    // Content_Types：header/footer Override 声明
    const ctXml = await readPart(result, '[Content_Types].xml');
    expect(ctXml).toContain('/word/header1.xml');
    expect(ctXml).toContain('wordprocessingml.header+xml');
    expect(ctXml).toContain('/word/footer1.xml');
    expect(ctXml).toContain('wordprocessingml.footer+xml');
  });

  it('注入背景图（behindDoc 锚定 + 透明度），随页眉在每页生效', async () => {
    const docx = await buildMinimalDocx();
    const result = await applyPageDecorationsToDocx(
      docx,
      { background: { image: TINY_PNG_DATA_URL, width: 100, height: 100, size: 'stretch', opacity: 30 } },
      A4_DIMS,
      (s) => s,
    );

    // 图片二进制原样嵌入
    const zip = await JSZip.loadAsync(new Uint8Array(result));
    const bgData = await zip.file('word/media/pageBackground.png')?.async('nodebuffer');
    expect(bgData).toBeTruthy();
    expect(bgData?.equals(new Uint8Array(Buffer.from(TINY_PNG_DATA_URL.split(',')[1], 'base64')))).toBe(true);

    // 页眉内：behindDoc 锚定 + 30% 不透明度 + 整页尺寸（A4 twips × 635 EMU）
    const headerXml = await readPart(result, 'word/header1.xml');
    expect(headerXml).toContain('behindDoc="1"');
    expect(headerXml).toContain('<a:alphaModFix amt="30000"/>');
    expect(headerXml).toContain(`cx="${11906 * 635}" cy="${16838 * 635}"`);

    // 页眉关系指向图片；Content_Types 补充 png 声明
    const headerRels = await readPart(result, 'word/_rels/header1.xml.rels');
    expect(headerRels).toContain('Target="media/pageBackground.png"');
    const ctXml = await readPart(result, '[Content_Types].xml');
    expect(ctXml).toContain('Extension="png"');
  });

  it('适应页面（contain）模式：等比缩放并居中', async () => {
    const docx = await buildMinimalDocx();
    // 1000×500 px 图片 → 5000×2500 twips…（px×9525 EMU），A4 纵向等比缩放后水平居中
    const result = await applyPageDecorationsToDocx(
      docx,
      { background: { image: TINY_PNG_DATA_URL, width: 1000, height: 500, size: 'contain' } },
      A4_DIMS,
      (s) => s,
    );
    const headerXml = await readPart(result, 'word/header1.xml');
    // 缩放比 = min(pageW/imgW, pageH/imgH)；pageW=11906×635 EMU, imgW=1000×9525 EMU
    const imgW = 1000 * 9525;
    const imgH = 500 * 9525;
    const pageW = 11906 * 635;
    const pageH = 16838 * 635;
    const scale = Math.min(pageW / imgW, pageH / imgH);
    const cx = Math.round(imgW * scale);
    const cy = Math.round(imgH * scale);
    expect(headerXml).toContain(`cx="${cx}" cy="${cy}"`);
    expect(headerXml).toContain(`<wp:posOffset>${Math.round((pageH - cy) / 2)}</wp:posOffset>`);
  });

  it('无背景图且无页眉文本时不生成 header 部件', async () => {
    const docx = await buildMinimalDocx();
    const result = await applyPageDecorationsToDocx(docx, { footer: { text: 'footer only' } }, A4_DIMS, (s) => s);
    const zip = await JSZip.loadAsync(new Uint8Array(result));
    expect(zip.file('word/header1.xml')).toBeNull();
    expect(zip.file('word/footer1.xml')).toBeTruthy();
  });

  it('items 片段：文本 + 页码 + 总页数 + 换行 + 图片', async () => {
    const docx = await buildMinimalDocx();
    const result = await applyPageDecorationsToDocx(
      docx,
      {
        header: {
          align: 'center',
          items: [
            { type: 'image', image: TINY_PNG_DATA_URL, width: 120, height: 60 },
            { type: 'text', text: ' {orderNo} ' },
            { type: 'page' },
            { type: 'text', text: ' / ' },
            { type: 'pages' },
            { type: 'break' },
            { type: 'text', text: '第二行文本' },
          ],
        },
      },
      A4_DIMS,
      (s) => s.replace('{orderNo}', 'NO-9'),
    );

    // 页眉 XML：内嵌图片 drawing、页码域、换行产生两个段落
    const headerXml = (await readPart(result, 'word/header1.xml')) ?? '';
    expect(headerXml).toContain('<wp:inline');
    expect(headerXml).toContain('w:instr=" PAGE \\* MERGEFORMAT "');
    expect(headerXml).toContain('w:instr=" NUMPAGES \\* MERGEFORMAT "');
    expect(headerXml).toContain('NO-9');
    expect(headerXml.match(/<w:p>|<w:p\s/g)).toHaveLength(2); // break 分为两段
    // 图片显示尺寸 120×60 px → EMU
    expect(headerXml).toContain(`cx="${120 * 9525}" cy="${60 * 9525}"`);

    // 图片二进制嵌入 media，关系 rId2 指向它
    const zip = await JSZip.loadAsync(new Uint8Array(result));
    const imgData = await zip.file('word/media/headerImage1.png')?.async('nodebuffer');
    expect(imgData).toBeTruthy();
    expect(imgData?.equals(Buffer.from(TINY_PNG_DATA_URL.split(',')[1], 'base64'))).toBe(true);
    const headerRels = (await readPart(result, 'word/_rels/header1.xml.rels')) ?? '';
    expect(headerRels).toContain('Id="rId2"');
    expect(headerRels).toContain('Target="media/headerImage1.png"');

    // Content_Types 补 png 声明
    const ctXml = (await readPart(result, '[Content_Types].xml')) ?? '';
    expect(ctXml).toContain('Extension="png"');
  });

  it('页脚 items 图片独立写入 footer 部件与 rels', async () => {
    const docx = await buildMinimalDocx();
    const result = await applyPageDecorationsToDocx(
      docx,
      {
        footer: {
          align: 'right',
          items: [{ type: 'text', text: '第 ' }, { type: 'page' }, { type: 'text', text: ' 页' }],
        },
        background: { image: TINY_PNG_DATA_URL, width: 100, height: 100, size: 'stretch', opacity: 30 },
        header: { items: [{ type: 'image', image: TINY_PNG_DATA_URL, width: 80, height: 40 }] },
      },
      A4_DIMS,
      (s) => s,
    );

    // 背景 rId1 与页眉图片 rId2 共存于 header rels
    const headerRels = (await readPart(result, 'word/_rels/header1.xml.rels')) ?? '';
    expect(headerRels).toContain('Id="rId1"');
    expect(headerRels).toContain('Target="media/pageBackground.png"');
    expect(headerRels).toContain('Id="rId2"');
    expect(headerRels).toContain('Target="media/headerImage1.png"');

    // 页脚：PAGE 域 + 对齐
    const footerXml = (await readPart(result, 'word/footer1.xml')) ?? '';
    expect(footerXml).toContain('<w:jc w:val="right"/>');
    expect(footerXml).toContain('w:instr=" PAGE \\* MERGEFORMAT "');

    // footer 无图片时不生成 rels
    const zip = await JSZip.loadAsync(new Uint8Array(result));
    expect(zip.file('word/_rels/footer1.xml.rels')).toBeNull();
  });
});
