/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/server';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const LOADING_STATUSES = ['loading', 'reloading'];

export async function waitForDataSourceReady(app: Application, dataSourceKey: string, maxAttempts = 60): Promise<void> {
  const plugin = app.pm.get('data-source-manager') as { dataSourceStatus: Record<string, string> };
  for (let i = 0; i < maxAttempts; i++) {
    const status = plugin?.dataSourceStatus?.[dataSourceKey];
    if (!LOADING_STATUSES.includes(status)) {
      break;
    }
    await sleep(500);
  }
}
