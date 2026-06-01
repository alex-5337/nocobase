/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { loadToken, saveToken, getMineruCategories, setMineruCategory } from '../utils/token-store';
import { pkgName } from '../utils/file-utils';

export async function getMineruTokenAction(ctx: any, next: any) {
  ctx.body = { token: loadToken(), mineruCategories: getMineruCategories() };
  await next();
}

export async function setMineruTokenAction(ctx: any, next: any) {
  const { token, mineruCategories } = ctx.action.params.values || {};

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

  ctx.body = { success: true };
  await next();
}
