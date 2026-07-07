import { escapeT } from '@nocobase/flow-engine';
import { ActionModel, ActionSceneEnum, CollectionActionGroupModel, RecordActionGroupModel } from '@nocobase/client-v2';
import React, { useState } from 'react';
import { Button, Select, Space, message } from 'antd';
import type { ButtonProps } from 'antd/es/button';

export class PrintTemplateActionModel extends ActionModel {
  static scene = ActionSceneEnum.all;

  defaultProps: ButtonProps = {
    title: escapeT('Template Print'),
    type: 'default',
    icon: 'PrinterOutlined',
  };

  getAclActionName() {
    return 'printTemplate';
  }
}

PrintTemplateActionModel.define({
  label: escapeT('Template Print'),
  sort: 1040,
});

PrintTemplateActionModel.registerFlow({
  key: 'printTemplateFlow',
  on: 'click',
  steps: {
    render: {
      hideInSettings: true,
      async handler(ctx, _params) {
        // Load templates
        const templatesRes = await ctx.api.request({
          url: 'printTemplates:list',
          params: { filter: { enabled: true } },
        });
        const templates = templatesRes?.data?.data || [];

        if (templates.length === 0) {
          message.warning(ctx.t('No templates available'));
          return;
        }

        // Get current record IDs from the block context
        const blockModel = ctx.model.context.blockModel;
        const { resource } = blockModel;
        let recordIds: number[];

        // Details block: getCurrentRecord() returns single record
        if (typeof blockModel.getCurrentRecord === 'function') {
          const record = blockModel.getCurrentRecord();
          const primaryKey =
            blockModel.collection?.getPrimaryKey?.() || blockModel.collection?.getFilterTargetKey?.() || 'id';
          const id = record?.[primaryKey];
          if (id != null) {
            recordIds = [id].flat();
          } else {
            recordIds = [];
          }
        } else {
          // Table block: prefer selected rows, fallback to all data rows
          const selectedRows = resource.getSelectedRows?.() || [];
          if (selectedRows.length > 0) {
            recordIds = selectedRows.map((r: any) => r.id);
          } else {
            const records = resource.getData();
            if (Array.isArray(records)) {
              recordIds = records.map((r: any) => r.id).filter((id: any) => id != null);
            } else {
              const primaryKey =
                blockModel.collection?.getPrimaryKey?.() || blockModel.collection?.getFilterTargetKey?.() || 'id';
              recordIds = records?.[primaryKey] != null ? [records[primaryKey]] : [];
            }
          }
        }

        if (recordIds.length === 0) {
          message.warning(ctx.t('No records found'));
          return;
        }

        // Open template selection dialog
        const view = ctx.viewer.open({
          type: 'dialog',
          width: 500,
          content: (currentView) => {
            const TemplateSelector = () => {
              const [selectedId, setSelectedId] = useState<number | null>(null);
              const [loading, setLoading] = useState(false);

              const handleGenerate = async () => {
                if (!selectedId) return;
                setLoading(true);
                try {
                  const response = await ctx.api.request({
                    url: 'printTemplates:render',
                    method: 'post',
                    data: { templateId: selectedId, recordIds },
                    responseType: 'blob',
                  });

                  const contentDisposition = response?.headers?.['content-disposition'] || '';
                  let filename = 'download';
                  const match = contentDisposition.match(/filename="?([^"]+)"?/);
                  if (match) filename = decodeURIComponent(match[1]);

                  const blob = new Blob([response.data], {
                    type: response?.headers?.['content-type'] || 'application/octet-stream',
                  });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(url);

                  message.success(ctx.t('Download started'));
                  currentView.destroy?.();
                } catch {
                  message.error(ctx.t('Failed to generate document'));
                } finally {
                  setLoading(false);
                }
              };

              return (
                <div style={{ padding: 24 }}>
                  <Select
                    style={{ width: '100%', marginBottom: 16 }}
                    placeholder={ctx.t('Select a template')}
                    value={selectedId}
                    onChange={setSelectedId}
                    options={templates.map((tpl: any) => ({
                      label: `${tpl.name} (${tpl.type === 'word' ? 'Word' : 'Excel'})`,
                      value: tpl.id,
                    }))}
                  />
                  <div style={{ textAlign: 'right' }}>
                    <Space>
                      <Button onClick={() => currentView.destroy?.()}>{ctx.t('Cancel')}</Button>
                      <Button type="primary" loading={loading} disabled={!selectedId} onClick={handleGenerate}>
                        {ctx.t('Generate & Download')}
                      </Button>
                    </Space>
                  </div>
                </div>
              );
            };

            return <TemplateSelector />;
          },
        });

        return view;
      },
    },
  },
});

// Register the action to appear in both table (collection) and details (record) action menus
CollectionActionGroupModel.registerActionModels({
  PrintTemplateActionModel,
});

RecordActionGroupModel.registerActionModels({
  PrintTemplateActionModel,
});
