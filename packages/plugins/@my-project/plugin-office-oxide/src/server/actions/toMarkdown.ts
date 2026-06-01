/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import fs from 'fs';
import { Document, type DocumentFormat } from 'office-oxide';
import { fixMergedCells } from '../utils/xlsx-merge-fix';
import { getExt, resolveFilePath, pkgName } from '../utils/file-utils';

export async function toMarkdownAction(ctx: any, next: any) {
  const resolved = resolveFilePath(ctx);
  if (!resolved) {
    ctx.throw(400, ctx.t('Please provide a file (multipart, base64, or server path)', { ns: pkgName() }));
  }

  const { filePath, filename, isTemp } = resolved;

  try {
    const buffer = fs.readFileSync(filePath);
    const format = getExt(filename).slice(1) as DocumentFormat;
    const doc = Document.fromBytes(new Uint8Array(buffer), format);
    let result = doc.toMarkdown();
    doc.close();

    const ext = getExt(filename);
    if (ext === '.xlsx' || ext === '.xls') {
      result = fixMergedCells(result);
    }

    ctx.body = { markdown: result };
    await next();
  } catch (err: any) {
    ctx.throw(500, err.message || ctx.t('Conversion failed', { ns: pkgName() }));
  } finally {
    if (isTemp) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
