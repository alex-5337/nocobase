/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import {
  useAPIClient,
  useDataSourceManager,
  useRecord,
  useResourceActionContext,
  useActionContext,
} from '@nocobase/client';

export const useDestroyAction = () => {
  const { refresh } = useResourceActionContext();
  const { name: dataSourceKey } = useParams();
  const { name: filterByTk, collectionName } = useRecord();
  const api = useAPIClient();
  const dm = useDataSourceManager();
  return {
    async run() {
      await api.request({
        url: `dataSourcesCollections/${dataSourceKey}.${collectionName}/fields:destroy?filterByTk=${filterByTk}`,
        method: 'post',
      });
      refresh();
      await dm?.getDataSource(dataSourceKey)?.reload();
    },
  };
};

// 外部数据源删除字段
export const useBulkDestroyAction = () => {
  const { state, setState, refresh } = useResourceActionContext();
  const { t } = useTranslation();
  const { name: dataSourceKey } = useParams();
  const api = useAPIClient();
  const { name } = useRecord();
  const dm = useDataSourceManager();
  return {
    async run() {
      if (!state?.selectedRowKeys?.length) {
        return message.error(t('Please select the records you want to delete'));
      }
      await api.request({
        url: `dataSourcesCollections/${dataSourceKey}.${name}/fields:destroy`,
        method: 'post',
        params: { filterByTk: state?.selectedRowKeys || [] },
      });
      setState?.({ selectedRowKeys: [] });
      refresh();
      await dm?.getDataSource(dataSourceKey)?.reload();
    },
  };
};

export const useBulkDestroyActionAndRefreshCM = () => {
  const { run } = useBulkDestroyAction();
  return {
    async run() {
      await run();
    },
  };
};

export const useDestroyActionAndRefreshCM = () => {
  const { run } = useDestroyAction();
  return {
    async run() {
      await run();
    },
  };
};
