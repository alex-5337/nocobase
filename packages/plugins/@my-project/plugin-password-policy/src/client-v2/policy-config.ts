/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import {
  defaultPasswordPolicyConfig,
  PasswordPolicyConfig,
  passwordPolicyCollectionName,
  passwordPolicyRecordKey,
} from '../shared/constants';

type ApiClientLike = {
  resource: (name: string) => {
    get: (params: { filterByTk: string }) => Promise<{ data?: { data?: { config?: Partial<PasswordPolicyConfig> } } }>;
  };
};

let policyConfigPromise: Promise<PasswordPolicyConfig> | null = null;

// The password complexity config used by the client-side validator, cached in memory after the
// first fetch and invalidated by `resetPolicyConfigCache()` when the settings page saves a new config.
export function getPolicyConfig(apiClient: unknown): Promise<PasswordPolicyConfig> {
  if (!policyConfigPromise) {
    const client = apiClient as ApiClientLike;
    policyConfigPromise = (async () => {
      try {
        const response = await client
          .resource(passwordPolicyCollectionName)
          .get({ filterByTk: passwordPolicyRecordKey });
        return { ...defaultPasswordPolicyConfig, ...(response?.data?.data?.config || {}) };
      } catch {
        return { ...defaultPasswordPolicyConfig };
      }
    })();
  }
  return policyConfigPromise;
}

export function resetPolicyConfigCache() {
  policyConfigPromise = null;
}
