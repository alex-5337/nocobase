/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useState, useCallback } from 'react';
import { App, message } from 'antd';
import { useAPIClient } from '@nocobase/client';
import { useTranslation } from 'react-i18next';

export function useSyncFields(dataSourceKey: string | undefined, onSuccess?: () => void) {
  const { t } = useTranslation('data-source-external');
  const api = useAPIClient();
  const { modal } = App.useApp();
  const [syncing, setSyncing] = useState(false);

  const syncFields = useCallback(() => {
    if (!dataSourceKey) return;

    modal.confirm({
      title: t('Sync field changes from database'),
      content: t('This will re-introspect all loaded tables and update field definitions. Continue?'),
      onOk: async () => {
        setSyncing(true);
        try {
          const listRes = await api.resource('dataSources.collections', dataSourceKey).list({
            params: { paginate: false },
          });
          const collections = Array.isArray(listRes.data) ? listRes.data : listRes.data?.data || [];
          const tableNames = collections.map((c: { name: string }) => c.name);

          if (tableNames.length === 0) {
            message.warning(t('No collections to sync'));
            return;
          }

          await api.resource('dataSources').loadTables({
            values: {
              dataSourceKey,
              tables: tableNames,
            },
          });
          message.success(t('Sync successfully'));
          onSuccess?.();
        } catch (e) {
          message.error(t('Sync failed'));
        } finally {
          setSyncing(false);
        }
      },
    });
  }, [dataSourceKey, api, modal, t, onSuccess]);

  return { syncing, syncFields };
}
