/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import fs from 'fs';
import { getExt, resolveFilePath, pkgName } from '../utils/file-utils';
import { dispatchConvert } from '../utils/dispatch';

export async function toMarkdownAction(ctx: any, next: any) {
  const resolved = resolveFilePath(ctx);
  if (!resolved) {
    ctx.body = {
      markdown: '',
      html: '',
      error: ctx.t('Please provide a file (multipart, base64, or server path)', { ns: pkgName() }),
      resultField: 'error',
    };
    return next();
  }

  const { filePath, filename, isTemp } = resolved;
  const ext = getExt(filename);

  try {
    const result = await dispatchConvert(filePath, ext, 'markdown', ctx);
    ctx.body = { markdown: result, html: '', error: null, resultField: 'markdown' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.body = {
      markdown: '',
      html: '',
      error: message || ctx.t('Conversion failed', { ns: pkgName() }),
      resultField: 'error',
    };
  } finally {
    if (isTemp) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  await next();
}
