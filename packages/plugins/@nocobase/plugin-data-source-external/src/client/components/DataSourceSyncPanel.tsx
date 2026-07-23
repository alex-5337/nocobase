/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useCallback, useState } from 'react';
import { Button, Space, App, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useAPIClient } from '@nocobase/client';
import { useTranslation } from 'react-i18next';
import { LoadCollection } from './LoadCollection';

interface DataSourceSyncPanelProps {
  dataSourceKey?: string;
}

export const DataSourceSyncPanel: React.FC<DataSourceSyncPanelProps> = ({ dataSourceKey }) => {
  const { t } = useTranslation('data-source-external');
  const api = useAPIClient();
  const [syncing, setSyncing] = useState(false);
  const { modal } = App.useApp();

  const handleSyncFields = useCallback(() => {
    if (!dataSourceKey) return;

    modal.confirm({
      title: t('Sync field changes from database'),
      content: t('This will re-introspect all loaded tables and update field definitions. Continue?'),
      onOk: async () => {
        setSyncing(true);
        try {
          // 与 collections 页面列表保持同一数据来源：内存中的 collections。
          // 不能用 dataSources:list 的 appends=collections（取的是 dataSourcesCollections 持久化记录），
          // 否则内存已加载但未持久化的表会被误判为“没有可同步的数据表”。
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
        } catch (e) {
          message.error(t('Sync failed'));
        } finally {
          setSyncing(false);
        }
      },
    });
  }, [dataSourceKey, api, modal, t]);

  return (
    <Space>
      <LoadCollection dataSourceKey={dataSourceKey} />
      <Button icon={<ReloadOutlined />} onClick={handleSyncFields} loading={syncing}>
        {t('Sync field changes from database')}
      </Button>
    </Space>
  );
};
