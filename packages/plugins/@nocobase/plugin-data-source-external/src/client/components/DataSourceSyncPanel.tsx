/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useCallback } from 'react';
import { Button, Space } from 'antd';
import { ImportOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDataSourceManager } from '@nocobase/client';
import { useLoadTablesDrawer } from './useLoadTablesDrawer';
import { useSyncFields } from './useSyncFields';

interface DataSourceSyncPanelProps {
  dataSourceKey?: string;
}

export const DataSourceSyncPanel: React.FC<DataSourceSyncPanelProps> = ({ dataSourceKey }) => {
  const { t } = useTranslation('data-source-external');
  const dataSourceManager = useDataSourceManager();

  const handleSuccess = useCallback(async () => {
    await dataSourceManager.getDataSource(dataSourceKey)?.reload();
  }, [dataSourceManager, dataSourceKey]);

  const { openDrawer, drawer } = useLoadTablesDrawer(dataSourceKey, handleSuccess);
  const { syncing, syncFields } = useSyncFields(dataSourceKey, handleSuccess);

  return (
    <Space>
      <Button icon={<ImportOutlined />} onClick={openDrawer}>
        {t('Load tables from database')}
      </Button>
      <Button icon={<ReloadOutlined />} onClick={syncFields} loading={syncing}>
        {t('Sync field changes from database')}
      </Button>
      {drawer}
    </Space>
  );
};
