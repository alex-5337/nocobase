/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useFlowContext } from '@nocobase/flow-engine';
import { useRequest } from 'ahooks';
import { Form, Select } from 'antd';
import React, { useMemo } from 'react';
import { useAuthAnonymousTranslation } from './locale';

type UserOption = {
  id: number;
  nickname?: string;
  username?: string;
};

function useUsers() {
  const ctx = useFlowContext();
  return useRequest(async () => {
    const response = await ctx.api.resource('users').list({
      pageSize: 200,
      fields: ['id', 'nickname', 'username'],
      sort: 'createdAt',
    });
    const data = response?.data?.data ?? response?.data;
    return Array.isArray(data) ? (data as UserOption[]) : [];
  });
}

/**
 * Mirrors the v1 `RemoteSelect` (resource `users`, label `nickname`, value `id`)
 * so both runtimes persist the same shape: `options.public.anonymousUser` = user id,
 * which `anonymous-auth.ts` resolves via `userRepository.findById(...)`.
 */
function AnonymousUserSelect(props: { value?: number; onChange?: (value: number) => void }) {
  const { t } = useAuthAnonymousTranslation();
  const { data, loading } = useUsers();

  // 用户名/昵称是数据而非界面文案，不走 i18n（与 v1 的 RemoteSelect 一致：label 取 nickname）。
  const options = useMemo(
    () =>
      (data || []).map((user) => ({
        value: user.id,
        label: user.nickname || user.username || String(user.id),
      })),
    [data],
  );

  return (
    <Select
      showSearch
      loading={loading}
      value={props.value}
      onChange={props.onChange}
      options={options}
      optionFilterProp="label"
      placeholder={t('Please select the anonymous user')}
      notFoundContent={t('The user does not exist or has been deleted.')}
    />
  );
}

/**
 * Admin settings for an `Anonymous` authenticator, rendered inside the v2
 * Authenticators page drawer below the common fields. Receives no props —
 * values are read/written through the parent antd form.
 */
export default function AnonymousAuthAdminSettings() {
  const { t } = useAuthAnonymousTranslation();

  return (
    <Form.Item
      name={['options', 'public', 'anonymousUser']}
      label={t('Anonymous user')}
      rules={[{ required: true, message: t('Please select the anonymous user') }]}
    >
      <AnonymousUserSelect />
    </Form.Item>
  );
}
