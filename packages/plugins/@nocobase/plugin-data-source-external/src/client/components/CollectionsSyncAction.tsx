/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Dropdown, Button } from 'antd';
import { ImportOutlined, SyncOutlined, ReloadOutlined } from '@ant-design/icons';
import { useDataSourceManager, useResourceActionContext } from '@nocobase/client';
import { useTranslation } from 'react-i18next';
import { useLoadTablesDrawer } from './useLoadTablesDrawer';
import { useSyncFields } from './useSyncFields';

export const CollectionsSyncAction: React.FC = () => {
  const { t } = useTranslation('data-source-external');
  const { name } = useParams<{ name: string }>();
  const dataSourceManager = useDataSourceManager();
  const { refresh } = useResourceActionContext();

  const handleSuccess = useCallback(async () => {
    await dataSourceManager.getDataSource(name)?.reload();
    refresh();
  }, [dataSourceManager, name, refresh]);

  const { openDrawer, drawer } = useLoadTablesDrawer(name, handleSuccess);
  const { syncFields } = useSyncFields(name, handleSuccess);

  return (
    <>
      <Dropdown
        menu={{
          items: [
            {
              key: 'load-tables',
              label: <div onClick={openDrawer}>{t('Load tables from database')}</div>,
              icon: <ImportOutlined />,
            },
            {
              key: 'sync-fields',
              label: t('Sync field changes from database'),
              icon: <ReloadOutlined />,
              onClick: syncFields,
            },
          ],
        }}
        placement="bottomLeft"
      >
        <Button icon={<SyncOutlined />}>{t('Sync from database')}</Button>
      </Dropdown>
      {drawer}
    </>
  );
};
