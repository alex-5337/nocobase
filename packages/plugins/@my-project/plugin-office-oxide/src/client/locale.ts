/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useMemo } from 'react';
// @ts-ignore
import pkg from '../../package.json';
import { useApp } from '@nocobase/client';

export const namespace = pkg.name;

export function useT(): (str: string) => string {
  const app = useApp();
  return useMemo(() => (str: string) => app.i18n.t(str, { ns: namespace }), [app.i18n]);
}
