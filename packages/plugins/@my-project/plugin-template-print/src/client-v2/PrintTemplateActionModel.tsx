/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { escapeT } from '@nocobase/flow-engine';
import { ActionModel, ActionSceneEnum, CollectionActionGroupModel, RecordActionGroupModel } from '@nocobase/client-v2';
import React, { useState } from 'react';
import { Button, Select, Space, message } from 'antd';
import type { ButtonProps } from 'antd/es/button';

/**
 * 模板打印操作模型（V2 流程引擎）。
 * 定义「模板打印」按钮的外观和行为，
 * 以及点击后的模板选择与下载流程。
 */
export class PrintTemplateActionModel extends ActionModel {
  /** 适用于所有场景（列表页和详情页） */
  static scene = ActionSceneEnum.all;

  /** 按钮默认属性 */
  defaultProps: ButtonProps = {
    title: escapeT('Template Print'),
    type: 'default',
    icon: 'PrinterOutlined',
  };

  /** 返回 ACL 操作名称 */
  getAclActionName() {
    return 'printTemplate';
  }
}

// 定义操作模型的元数据
PrintTemplateActionModel.define({
  label: escapeT('Template Print'),
  sort: 1040,
});

// 注册操作的交互流程
PrintTemplateActionModel.registerFlow({
  key: 'printTemplateFlow',
  on: 'click',
  steps: {
    render: {
      hideInSettings: true,
      async handler(ctx, _params) {
        // 1. 加载已启用的模板列表
        const templatesRes = await ctx.api.request({
          url: 'printTemplates:list',
          params: { filter: { enabled: true } },
        });
        const templates = templatesRes?.data?.data || [];

        if (templates.length === 0) {
          message.warning(ctx.t('No templates available'));
          return;
        }

        // 2. 获取当前数据块中的记录 ID
        const blockModel = ctx.model.context.blockModel;
        let recordIds: number[];

        if (typeof blockModel.getCurrentRecord === 'function') {
          // 详情页块：获取当前记录
          const record = blockModel.getCurrentRecord();
          const primaryKey =
            blockModel.collection?.getPrimaryKey?.() || blockModel.collection?.getFilterTargetKey?.() || 'id';
          const id = record?.[primaryKey];
          recordIds = id != null ? [id].flat() : [];
        } else {
          // 表格块：优先选中行，回退到所有数据行
          const selectedRows = blockModel.resource.getSelectedRows?.() || [];
          if (selectedRows.length > 0) {
            recordIds = selectedRows.map((r: any) => r.id);
          } else {
            const records = blockModel.resource.getData();
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

        // 3. 打开模板选择弹窗
        const view = ctx.viewer.open({
          type: 'dialog',
          width: 600,
          content: (currentView: any) => {
            /**
             * 模板选择器内部组件。
             * 展示模板下拉列表，确认后触发下载。
             */
            const TemplateSelector: React.FC = () => {
              const [selectedId, setSelectedId] = useState<number | null>(null);
              const [loading, setLoading] = useState(false);

              /** 生成并下载文档 */
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

                  // 从响应头解析文件名
                  const contentDisposition = response?.headers?.['content-disposition'] || '';
                  let filename = 'download';
                  const match = contentDisposition.match(/filename="?([^"]+)"?/);
                  if (match) filename = decodeURIComponent(match[1]);

                  // 创建 Blob 并触发浏览器下载
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
                  {/* 模板下拉选择 */}
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

                  {/* 操作按钮 */}
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

// 将操作模型注册到操作菜单组中，使其在表格页和详情页均可显示
CollectionActionGroupModel.registerActionModels({
  PrintTemplateActionModel,
});

RecordActionGroupModel.registerActionModels({
  PrintTemplateActionModel,
});
