import React, { useState, useEffect, useCallback } from 'react';
import { Select, message } from 'antd';
import { useAPIClient, useCollection, useCollectionRecordData, useDataBlockRequestData } from '@nocobase/client';
import { useForm } from '@formily/react';
import { useTranslation } from 'react-i18next';
import { createRoot } from 'react-dom/client';
import { NAMESPACE } from './locale';

export const useTemplatePrintActionProps = () => {
  const apiClient = useAPIClient();
  const recordData = useCollectionRecordData();
  const collection = useCollection();
  const form = useForm();
  const dataBlockData = useDataBlockRequestData();
  // 列表页用行 record context，详情页优先用 data block 原始数据，再回退到 form.values
  const primaryKey = collection?.getPrimaryKey?.() || collection?.getFilterTargetKey?.() || 'id';
  const currentRecord = recordData?.[primaryKey]
    ? recordData
    : dataBlockData?.data?.[primaryKey]
      ? dataBlockData.data
      : form?.values;

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
        onClose={cleanup}
        onDone={cleanup}
      />,
    );
  }, [apiClient, currentRecord, collection]);

  return { onClick };
};

interface TemplatePrintModalProps {
  visible: boolean;
  record: any;
  collection: any;
  apiClient: any;
  onClose: () => void;
  onDone: () => void;
}

const TemplatePrintModal: React.FC<TemplatePrintModalProps> = ({
  visible: initialVisible,
  record,
  collection,
  apiClient,
  onClose,
  onDone,
}) => {
  const { t } = useTranslation(NAMESPACE);
  const [visible, setVisible] = useState(initialVisible);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const primaryKey = collection?.getPrimaryKey?.() || collection?.getFilterTargetKey?.() || 'id';
  const recordId = record?.[primaryKey];

  useEffect(() => {
    setVisible(initialVisible);
  }, [initialVisible]);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const res = await apiClient.request({
          url: 'printTemplates:list',
          params: { filter: { enabled: true } },
        });
        setTemplates(res.data?.data || []);
      } catch {
        message.error(t('Failed to load templates'));
      }
    };
    loadTemplates();
  }, [apiClient, t]);

  const handleCancel = () => {
    setVisible(false);
    onClose();
  };

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

      const contentDisposition = response.headers?.['content-disposition'] || '';
      let filename = 'download';
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) {
        filename = decodeURIComponent(match[1]);
      }

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
      const serverMsg = err?.response?.data?.errors?.[0]?.message || err?.message;
      message.error(serverMsg || t('Failed to generate document'));
    } finally {
      setLoading(false);
    }
  };

  // Use native modal rendering for reliable cross-view behavior
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
        <div style={{ textAlign: 'right' }}>
          <button className="ant-btn" onClick={handleCancel} style={{ marginRight: 8 }}>
            {t('Cancel')}
          </button>
          <button className="ant-btn ant-btn-primary" onClick={handleOk} disabled={loading}>
            {loading ? t('Generating...') : t('Generate & Download')}
          </button>
        </div>
      </div>
    </div>
  );
};
