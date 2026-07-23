/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Dropdown, Button, Drawer, Transfer, App, message, Spin } from 'antd';
import { ImportOutlined, SyncOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAPIClient, useDataSourceManager, useResourceActionContext } from '@nocobase/client';
import { useTranslation } from 'react-i18next';

interface CollectionItem {
  key: string;
  title: string;
  name: string;
}

/**
 * 用于外部数据源 collections 配置页 ActionBar 中的同步按钮组件。
 * 样式与 main 数据源的 SyncFromDatabaseAction 一致：下拉按钮，包含「加载表格」和「同步字段变更」。
 */
export const CollectionsSyncAction: React.FC = () => {
  const { t } = useTranslation('data-source-external');
  const { name } = useParams<{ name: string }>();
  const api = useAPIClient();
  const { modal } = App.useApp();
  // 设置页没有 DataSourceProvider，useDataSource() 为 null，
  // 必须通过 DataSourceManager 按 name 取当前外部数据源实例
  const dataSourceManager = useDataSourceManager();
  const { refresh } = useResourceActionContext();

  // ---------- Load Tables 抽屉状态 ----------
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [targetKeys, setTargetKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableCollections, setAvailableCollections] = useState<CollectionItem[]>([]);

  const openLoadTablesDrawer = useCallback(async () => {
    setDrawerOpen(true);
    setLoading(true);
    try {
      const response = await api.resource('dataSources').readTables({
        values: { dataSourceKey: name },
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
  }, [api, name, t]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setTargetKeys([]);
    setSelectedKeys([]);
    setSearchValue('');
  }, []);

  const handleLoadTablesSubmit = useCallback(async () => {
    if (targetKeys.length === 0) {
      message.warning(t('Please select at least one table'));
      return;
    }
    setLoading(true);
    try {
      await api.resource('dataSources').loadTables({
        values: {
          dataSourceKey: name,
          tables: targetKeys,
        },
      });
      message.success(t('Tables loaded successfully'));
      await dataSourceManager.getDataSource(name)?.reload();
      refresh();
      closeDrawer();
    } catch (e) {
      message.error(t('Failed to load tables'));
    } finally {
      setLoading(false);
    }
  }, [targetKeys, api, name, t, dataSourceManager, refresh, closeDrawer]);

  const filteredDataSource = useMemo(() => {
    if (!searchValue) return availableCollections;
    return availableCollections.filter(
      (item) =>
        item.title.toLowerCase().includes(searchValue.toLowerCase()) ||
        item.name.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [availableCollections, searchValue]);

  // ---------- Sync Fields ----------
  const handleSyncFields = useCallback(() => {
    if (!name) return;

    modal.confirm({
      title: t('Sync field changes from database'),
      content: t('This will re-introspect all loaded tables and update field definitions. Continue?'),
      onOk: async () => {
        try {
          // 与页面列表保持同一数据来源：内存中的 collections。
          // 不能用 dataSources:list 的 appends=collections（取的是 dataSourcesCollections 持久化记录），
          // 否则内存已加载但未持久化的表会被误判为“没有可同步的数据表”。
          const listRes = await api.resource('dataSources.collections', name).list({
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
              dataSourceKey: name,
              tables: tableNames,
            },
          });
          await dataSourceManager.getDataSource(name)?.reload();
          refresh();
          message.success(t('Sync successfully'));
        } catch (e) {
          message.error(t('Sync failed'));
        }
      },
    });
  }, [name, api, modal, t, dataSourceManager, refresh]);

  return (
    <>
      <Dropdown
        menu={{
          items: [
            {
              key: 'load-tables',
              label: <div onClick={openLoadTablesDrawer}>{t('Load tables from database')}</div>,
              icon: <ImportOutlined />,
            },
            {
              key: 'sync-fields',
              label: t('Sync field changes from database'),
              icon: <ReloadOutlined />,
              onClick: handleSyncFields,
            },
          ],
        }}
        placement="bottomLeft"
      >
        <Button icon={<SyncOutlined />}>{t('Sync from database')}</Button>
      </Dropdown>

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
            <Button
              type="primary"
              onClick={handleLoadTablesSubmit}
              loading={loading}
              disabled={targetKeys.length === 0}
            >
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
    </>
  );
};
