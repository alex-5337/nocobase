/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useState, useMemo, useCallback } from 'react';
import { message } from 'antd';
import { useAPIClient } from '@nocobase/client';
import { useTranslation } from 'react-i18next';

interface CollectionItem {
  key: string;
  title: string;
  name: string;
}

export function useLoadTables(dataSourceKey: string | undefined, onSuccess?: () => void) {
  const { t } = useTranslation('data-source-external');
  const api = useAPIClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [targetKeys, setTargetKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableCollections, setAvailableCollections] = useState<CollectionItem[]>([]);

  const openDrawer = useCallback(async () => {
    setDrawerOpen(true);
    setLoading(true);
    try {
      const response = await api.resource('dataSources').readTables({
        values: { dataSourceKey },
      });
      const tables = response.data?.data || [];
      setAvailableCollections(
        tables.map((item: { name: string; title?: string }) => ({
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

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
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
      closeDrawer();
      onSuccess?.();
    } catch (e) {
      message.error(t('Failed to load tables'));
    } finally {
      setLoading(false);
    }
  }, [targetKeys, api, dataSourceKey, onSuccess, t, closeDrawer]);

  const filteredDataSource = useMemo(() => {
    if (!searchValue) return availableCollections;
    return availableCollections.filter(
      (item) =>
        item.title.toLowerCase().includes(searchValue.toLowerCase()) ||
        item.name.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [availableCollections, searchValue]);

  return {
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
  };
}
