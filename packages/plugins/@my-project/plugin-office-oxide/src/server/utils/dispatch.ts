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
import { isMineruEnabledFor, loadToken } from './token-store';
import { EXT_TO_CATEGORY, isImageExt, isOfficeExt } from './file-utils';
import { fixMergedCells } from './xlsx-merge-fix';

export async function dispatchConvert(
  filePath: string,
  ext: string,
  outputFormat: 'markdown' | 'html',
): Promise<string> {
  const category = EXT_TO_CATEGORY[ext];
  if (!category) {
    throw new Error('Unsupported file format');
  }

  const useMinerU = isMineruEnabledFor(ext, category) && loadToken();

  if (useMinerU) {
    const client = new MinerU();
    const result = await client.extract(filePath);
    return outputFormat === 'html' ? result.html || `<pre>${result.markdown}</pre>` : result.markdown || '';
  }

  if (isImageExt(ext)) {
    throw new Error('Unsupported file format, please enable MinerU for images and try again');
  }

  if (ext === '.pdf') {
    const { PdfDocument } = await import('pdf-oxide');
    const doc = new PdfDocument(filePath);
    try {
      const text = doc.toMarkdownAll();
      return outputFormat === 'html' ? `<pre>${text}</pre>` : text;
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
