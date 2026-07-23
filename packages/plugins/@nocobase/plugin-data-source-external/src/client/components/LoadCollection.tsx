/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Button, Drawer, Transfer, Input, message, Spin } from 'antd';
import { ImportOutlined } from '@ant-design/icons';
import { useAPIClient } from '@nocobase/client';
import { useTranslation } from 'react-i18next';

interface CollectionItem {
  key: string;
  title: string;
  name: string;
}

interface LoadCollectionProps {
  dataSourceKey?: string;
  onSuccess?: () => void;
}

export const LoadCollection: React.FC<LoadCollectionProps> = ({ dataSourceKey, onSuccess }) => {
  const { t } = useTranslation('data-source-external');
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [targetKeys, setTargetKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableCollections, setAvailableCollections] = useState<CollectionItem[]>([]);
  const api = useAPIClient();

  const loadAvailableTables = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.resource('dataSources').readTables({
        values: { dataSourceKey },
      });
      const tables = response.data?.data || [];
      setAvailableCollections(
        tables.map((item: any) => ({
          key: item.name,
          name: item.name,
          title: item.title || item.name,
        })),
      );
      setTargetKeys([]);
      setSelectedKeys([]);
      setSearchValue('');
    } catch (e) {
      message.error(t('Failed to load table list'));
    } finally {
      setLoading(false);
    }
  }, [api, dataSourceKey, t]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    loadAvailableTables();
  }, [loadAvailableTables]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    setTargetKeys([]);
    setSelectedKeys([]);
    setSearchValue('');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (targetKeys.length === 0) {
      message.warning(t('Please select at least one table'));
      return;
    }

    setLoading(true);
    try {
      await api.resource('dataSources').loadTables({
        values: {
          dataSourceKey,
          tables: targetKeys,
        },
      });
      message.success(t('Tables loaded successfully'));
      setOpen(false);
      setTargetKeys([]);
      setSelectedKeys([]);
      setSearchValue('');
      onSuccess?.();
    } catch (e) {
      message.error(t('Failed to load tables'));
    } finally {
      setLoading(false);
    }
  }, [targetKeys, api, dataSourceKey, onSuccess, t]);

  const filteredDataSource = useMemo(() => {
    if (!searchValue) return availableCollections;
    return availableCollections.filter(
      (item) =>
        item.title.toLowerCase().includes(searchValue.toLowerCase()) ||
        item.name.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [availableCollections, searchValue]);

  return (
    <>
      <Button icon={<ImportOutlined />} onClick={handleOpen} loading={loading}>
        {t('Load tables from database')}
      </Button>

      <Drawer
        title={t('Load tables from database')}
        placement="right"
        onClose={handleCancel}
        open={open}
        width={800}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button onClick={handleCancel} style={{ marginRight: 8 }}>
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
              onSelectChange={(s, t) => setSelectedKeys([...s, ...t] as string[])}
              onSearch={(_, value) => setSearchValue(value)}
              render={(item) => item.title}
              showSearch
              style={{ height: '100%' }}
              listStyle={{ width: 350, height: 'calc(100vh - 100px)' }}
            />
          </Spin>
        </div>
      </Drawer>
    </>
  );
};
