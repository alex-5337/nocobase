/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Select, Button, message } from 'antd';
import { useAPIClient, useCollection, useCollectionRecordData, useDataBlockRequestData } from '@nocobase/client';
import { useForm } from '@formily/react';
import { useTranslation } from 'react-i18next';
import { createRoot } from 'react-dom/client';
import { NAMESPACE } from './locale';

/**
 * 模板打印操作按钮的 Hook。
 * 用于在详情页/列表页的操作栏中注入「模板打印」按钮，
 * 点击后弹出模板选择弹窗，生成并下载打印文档。
 */
export const useTemplatePrintActionProps = () => {
  const apiClient = useAPIClient();
  const recordData = useCollectionRecordData();
  const collection = useCollection();
  const form = useForm();
  const dataBlockData = useDataBlockRequestData();

  // 获取主键字段名
  const primaryKey = useMemo(
    () => collection?.getPrimaryKey?.() || collection?.getFilterTargetKey?.() || 'id',
    [collection],
  );

  // 列表页用行 record context，详情页优先用 data block 原始数据，再回退到 form.values
  const currentRecord = recordData?.[primaryKey]
    ? recordData
    : dataBlockData?.data?.[primaryKey]
      ? dataBlockData.data
      : form?.values;

  // 点击按钮：创建独立的 DOM 容器并渲染模板选择弹窗
  const onClick = useCallback(() => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const cleanup = () => {
      root.unmount();
      document.body.removeChild(container);
    };

    root.render(
      <TemplatePrintModal
        visible={true}
        apiClient={apiClient}
        record={currentRecord}
        collection={collection}
        primaryKey={primaryKey}
        onClose={cleanup}
        onDone={cleanup}
      />,
    );
  }, [apiClient, currentRecord, collection, primaryKey]);

  return { onClick };
};

/**
 * 模板选择弹窗的属性接口
 */
interface TemplatePrintModalProps {
  visible: boolean;
  record: any;
  collection: any;
  apiClient: any;
  /** 主键字段名 */
  primaryKey: string;
  onClose: () => void;
  onDone: () => void;
}

/**
 * 模板打印弹窗组件。
 * 展示可用的模板列表，用户选择模板后生成并下载打印文件。
 * 使用原生固定定位渲染以确保跨视图的可靠行为。
 */
const TemplatePrintModal: React.FC<TemplatePrintModalProps> = ({
  visible: initialVisible,
  record,
  collection,
  apiClient,
  primaryKey,
  onClose,
  onDone,
}) => {
  const { t } = useTranslation(NAMESPACE);
  const [visible, setVisible] = useState(initialVisible);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const recordId = record?.[primaryKey];

  // 同步外部 visible 状态
  useEffect(() => {
    setVisible(initialVisible);
  }, [initialVisible]);

  // 加载已启用的模板列表（按当前集合过滤）
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const res = await apiClient.request({
          url: 'printTemplates:list',
          params: { filter: { enabled: true, collectionName: collection?.name } },
        });
        setTemplates(res.data?.data || []);
      } catch {
        message.error(t('Failed to load templates'));
      }
    };
    loadTemplates();
  }, [apiClient, t, collection?.name]);

  /** 取消按钮 */
  const handleCancel = () => {
    setVisible(false);
    onClose();
  };

  /** 确认生成：请求服务端渲染模板并触发下载 */
  const handleOk = async () => {
    if (!selectedId) {
      message.warning(t('Please select a template'));
      return;
    }
    if (!recordId) {
      message.error(t('Current record is not available'));
      return;
    }
    setLoading(true);
    try {
      // 调用服务端渲染接口，返回文件 blob
      const response = await apiClient.resource('printTemplates').render(
        {
          values: {
            templateId: selectedId,
            recordIds: [recordId],
          },
        },
        {
          responseType: 'blob',
        },
      );

      // 从响应头解析文件名
      const contentDisposition = response.headers?.['content-disposition'] || '';
      let filename = 'download';
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) {
        filename = decodeURIComponent(match[1]);
      }

      // 创建 Blob 并触发浏览器下载
      const blob = new Blob([response.data], {
        type: response.headers?.['content-type'] || 'application/octet-stream',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      message.success(t('Download started'));
      onDone();
    } catch (err: any) {
      // 优先展示服务端返回的错误信息
      const serverMsg = err?.response?.data?.errors?.[0]?.message || err?.message;
      message.error(serverMsg || t('Failed to generate document'));
    } finally {
      setLoading(false);
    }
  };

  // 使用原生固定定位渲染弹窗，确保跨视图（如 Popup 内）的可靠行为
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        background: 'rgba(0, 0, 0, 0.45)',
        display: visible ? 'flex' : 'none',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        // 点击遮罩层关闭
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 24,
          width: 480,
          maxWidth: '90vw',
          boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('Select Template')}</h3>

        {/* 模板下拉选择 */}
        <Select
          style={{ width: '100%', marginBottom: 16 }}
          placeholder={t('Select a template')}
          value={selectedId}
          onChange={setSelectedId}
          options={templates.map((tpl: any) => ({
            label: `${tpl.name} (${tpl.type === 'word' ? 'Word' : 'Excel'} - ${tpl.collectionName})`,
            value: tpl.id,
          }))}
        />

        {/* 操作按钮 */}
        <div style={{ textAlign: 'right' }}>
          <Button onClick={handleCancel} style={{ marginRight: 8 }}>
            {t('Cancel')}
          </Button>
          <Button type="primary" onClick={handleOk} loading={loading}>
            {loading ? t('Generating...') : t('Generate & Download')}
          </Button>
        </div>
      </div>
    </div>
  );
};
