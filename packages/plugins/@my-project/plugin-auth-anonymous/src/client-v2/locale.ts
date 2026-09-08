/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useFlowEngine } from '@nocobase/flow-engine';
import { useTranslation } from 'react-i18next';

export const NAMESPACE = 'auth-anonymous';

export function useAuthAnonymousTranslation() {
  return useTranslation([NAMESPACE, 'client'], { nsMode: 'fallback' });
}

/**
 * v2 translator: goes through `flowEngine.context.t`, which also expands the
 * legacy `{{t("…")}}` schema templates that NocoBase stores in DB values (for
 * example an authenticator title). Falls back to the `client` namespace when a
 * key is missing from `auth-anonymous`.
 */
export function useT() {
  const engine = useFlowEngine();
  return (key: string) => engine.context.t(key, { ns: [NAMESPACE, 'client'], nsMode: 'fallback' });
}
