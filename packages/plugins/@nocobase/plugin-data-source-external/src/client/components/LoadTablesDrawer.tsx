/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';
import { Button, Drawer, Transfer, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { useLoadTables } from './useLoadTables';

interface LoadTablesDrawerProps {
  dataSourceKey: string | undefined;
  onSuccess?: () => void;
}

export const LoadTablesDrawer: React.FC<LoadTablesDrawerProps> = ({ dataSourceKey, onSuccess }) => {
  const { t } = useTranslation('data-source-external');
  const {
    drawerOpen,
    loading,
    targetKeys,
    selectedKeys,
    filteredDataSource,
    openDrawer,
    closeDrawer,
    handleSubmit,
    setTargetKeys,
    setSelectedKeys,
    setSearchValue,
  } = useLoadTables(dataSourceKey, onSuccess);

  return {
    openDrawer,
    drawerElement: (
      <Drawer
        title={t('Load tables from database')}
        placement="right"
        onClose={closeDrawer}
        open={drawerOpen}
        width={800}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button onClick={closeDrawer} style={{ marginRight: 8 }}>
              {t('Cancel')}
            </Button>
            <Button type="primary" onClick={handleSubmit} loading={loading} disabled={targetKeys.length === 0}>
              {t('Submit')}
            </Button>
          </div>
        }
      >
        <div style={{ height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
          <Spin spinning={loading} style={{ height: '100%' }}>
            <Transfer
              dataSource={filteredDataSource}
              titles={[t('Available tables'), t('Selected tables')]}
              targetKeys={targetKeys}
              selectedKeys={selectedKeys}
              onChange={(keys) => setTargetKeys(keys as string[])}
              onSelectChange={(s, t2) => setSelectedKeys([...s, ...t2] as string[])}
              onSearch={(_, value) => setSearchValue(value)}
              render={(item) => item.title}
              showSearch
              style={{ height: '100%' }}
              listStyle={{ width: 350, height: 'calc(100vh - 100px)' }}
            />
          </Spin>
        </div>
      </Drawer>
    ),
  };
};
