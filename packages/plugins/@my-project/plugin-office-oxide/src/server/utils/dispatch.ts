/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import fs from 'fs';
import { MinerU } from 'mineru-open-sdk';
import { Document, type DocumentFormat } from 'office-oxide';
import { isMineruEnabledFor, loadToken, getOcrConfig, getBaseUrl } from './token-store';
import { EXT_TO_CATEGORY, isImageExt, pkgName } from './file-utils';
import { fixMergedCells } from './xlsx-merge-fix';

export async function dispatchConvert(
  filePath: string,
  ext: string,
  outputFormat: 'markdown' | 'html',
  ctx: any,
): Promise<string> {
  const category = EXT_TO_CATEGORY[ext];
  if (!category) {
    throw new Error(ctx.t('Unsupported file format', { ns: pkgName() }));
  }

  const useMinerU = isMineruEnabledFor(ext, category) && loadToken();

  if (useMinerU) {
    const client = new MinerU(loadToken(), getBaseUrl());
    const ocrConfig = getOcrConfig();
    const result = await client.extract(filePath, ocrConfig);
    return outputFormat === 'html' ? result.html || `<pre>${result.markdown}</pre>` : result.markdown || '';
  }

  if (isImageExt(ext)) {
    throw new Error(ctx.t('Unsupported file format', { ns: pkgName() }));
  }

  if (ext === '.pdf') {
    const { PdfDocument } = await import('pdf-oxide');
    const doc = PdfDocument.open(filePath);
    try {
      if (outputFormat === 'html') {
        return doc.toHtmlAll();
      }
      return doc.toMarkdownAll();
    } finally {
      doc.close();
    }
  }

  const buffer = fs.readFileSync(filePath);
  const format = ext.slice(1) as DocumentFormat;
  const doc = Document.fromBytes(new Uint8Array(buffer), format);
  try {
    let result: string;
    if (outputFormat === 'html') {
      result = doc.toHtml();
    } else {
      result = doc.toMarkdown();
      if (ext === '.xlsx' || ext === '.xls') {
        result = fixMergedCells(result);
      }
    }
    return result;
  } finally {
    doc.close();
  }
}
