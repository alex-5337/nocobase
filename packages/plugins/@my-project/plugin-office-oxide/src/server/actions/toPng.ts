/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import fs from 'fs';
import path from 'path';
import { resolveFilePath, getExt, pkgName } from '../utils/file-utils';

export async function toPngAction(ctx: any, next: any) {
  const resolved = resolveFilePath(ctx);
  if (!resolved) {
    ctx.body = {
      images: [],
      error: ctx.t('Please provide a file (multipart, base64, or server path)', { ns: pkgName() }),
      resultField: 'error',
    };
    return next();
  }

  const { filePath, filename, isTemp } = resolved;
  const ext = getExt(filename);

  if (ext !== '.pdf') {
    ctx.body = {
      images: [],
      error: ctx.t('Only PDF files are supported for PNG rendering', { ns: pkgName() }),
      resultField: 'error',
    };
    if (isTemp) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    }
    return next();
  }

  const params = ctx.action.params.values || {};
  const query = ctx.query || {};
  const rawScale =
    typeof params.scale === 'string'
      ? Number(params.scale)
      : params.scale ?? (typeof query.scale === 'string' ? Number(query.scale) : query.scale);
  const scale = typeof rawScale === 'number' && rawScale > 0 ? rawScale : 2;
  const pagesParam = params.pages ?? query.pages;

  try {
    // 动态导入 mupdf（ESM 模块，不能用 require）
    // @ts-expect-error mupdf uses node16 moduleResolution
    const mupdf = await import('mupdf');

    const fileData = fs.readFileSync(filePath);
    const doc = mupdf.Document.openDocument(fileData, 'application/pdf');

    const totalPages = doc.countPages();
    let pagesToProcess: number[];

    // 解析页码参数
    if (pagesParam === undefined || pagesParam === null || pagesParam === 'all') {
      pagesToProcess = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else if (typeof pagesParam === 'number') {
      pagesToProcess = [pagesParam];
    } else if (Array.isArray(pagesParam)) {
      pagesToProcess = pagesParam.map((p: number) => p);
    } else if (typeof pagesParam === 'string') {
      if (pagesParam.includes('-')) {
        const [start, end] = pagesParam.split('-').map(Number);
        pagesToProcess = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      } else if (pagesParam.includes(',')) {
        pagesToProcess = pagesParam.split(',').map((p: string) => Number(p));
      } else {
        pagesToProcess = [Number(pagesParam)];
      }
    } else {
      pagesToProcess = Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    // 过滤无效页码
    pagesToProcess = pagesToProcess.filter((p) => p >= 1 && p <= totalPages);

    const images: Array<{ page: number; data: string; format: string; width: number; height: number }> = [];
    const filenames: string[] = [];
    const baseName = path.basename(filename, ext);
    const matrix = mupdf.Matrix.scale(scale, scale);

    for (const pageNum of pagesToProcess) {
      const page = doc.loadPage(pageNum - 1);
      const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
      const pngBuffer = pixmap.asPNG();

      filenames.push(`${baseName}-page${pageNum}.png`);

      images.push({
        page: pageNum,
        data: Buffer.from(pngBuffer).toString('base64'),
        format: 'png',
        width: pixmap.width,
        height: pixmap.height,
      });
    }

    ctx.body = {
      images,
      filenames,
      pageCount: totalPages,
      renderedPages: images.length,
      error: null,
      resultField: 'images',
    };
  } catch (err: unknown) {
    let message: string;
    if (err instanceof Error) {
      message = err.message;
    } else if (typeof err === 'object' && err !== null) {
      message = JSON.stringify(err);
    } else {
      message = String(err);
    }
    ctx.body = {
      images: [],
      error: message || ctx.t('PDF to PNG conversion failed', { ns: pkgName() }),
      resultField: 'error',
    };
  } finally {
    if (isTemp) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    }
  }

  await next();
}
