/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import {
  loadToken,
  saveToken,
  getMineruCategories,
  setMineruCategory,
  getOcrConfig,
  setOcrConfig,
  getBaseUrl,
  setBaseUrl,
} from '../utils/token-store';
import { pkgName } from '../utils/file-utils';

export async function getMineruTokenAction(ctx: any, next: any) {
  ctx.body = {
    token: loadToken(),
    mineruCategories: getMineruCategories(),
    ocrConfig: getOcrConfig(),
    baseUrl: getBaseUrl(),
  };
  await next();
}

export async function setMineruTokenAction(ctx: any, next: any) {
  const { token, mineruCategories, ocrConfig, baseUrl } = ctx.action.params.values || {};

  if (typeof token === 'string' && token.trim()) {
    saveToken(token.trim());
  }

  if (mineruCategories && typeof mineruCategories === 'object') {
    for (const [category, enabled] of Object.entries(mineruCategories)) {
      if (typeof enabled === 'boolean') {
        setMineruCategory(category, enabled);
      }
    }
  }

  if (ocrConfig && typeof ocrConfig === 'object') {
    setOcrConfig({
      ocr: ocrConfig.ocr ?? true,
      formula: ocrConfig.formula ?? false,
      table: ocrConfig.table ?? true,
    });
  }

  if (typeof baseUrl === 'string' && baseUrl.trim()) {
    setBaseUrl(baseUrl.trim());
  }

  ctx.body = { success: true };
  await next();
}
