/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, message, Popconfirm, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useApp } from '@nocobase/client-v2';

const NAMESPACE = 'plugin-template-print';

/**
 * 模板数据接口
 */
interface Template {
  id: number;
  name: string;
  type: string;
  collectionName: string;
  enabled: boolean;
  content: string;
  variables: any[];
  pageSettings?: {
    paperSize?: string;
    orientation?: string;
    margins?: { top?: number; bottom?: number; left?: number; right?: number };
  };
  description: string;
  createdAt: string;
}

/**
 * 模板管理列表页（V2 运行时版本）。
 * 提供基础的模板增删改查功能。
 * 注意：V2 版本暂未集成 Word/Excel 编辑器，模板内容以纯文本形式编辑。
 */
export const TemplateListPage: React.FC = () => {
  const { t } = useTranslation(NAMESPACE);
  const [data, setData] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [form] = Form.useForm();
  const app = useApp();

  // 构建数据表下拉选项
  const collectionOptions = useMemo(() => {
    const ds = app.dataSourceManager?.getDataSource('main');
    if (!ds) return [];
    const collections = ds.collectionManager?.getCollections() || [];
    return collections.map((c: any) => ({
      label: `${c.title || c.name} (${c.name})`,
      value: c.name,
    }));
  }, [app]);

  /** 加载模板列表 */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await app.apiClient.request({ url: 'printTemplates:list' });
      setData(res.data?.data || []);
    } catch {
      message.error(t('Failed to load templates'));
    } finally {
      setLoading(false);
    }
  }, [app.apiClient, t]);

  // 组件挂载时加载数据
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** 打开新建模板弹窗 */
  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true, type: 'word' });
    setModalVisible(true);
  };

  /** 打开编辑模板弹窗 */
  const handleEdit = (record: Template) => {
    setEditingTemplate(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  /** 删除模板 */
  const handleDelete = async (id: number) => {
    try {
      await app.apiClient.request({ url: `printTemplates:destroy/${id}`, method: 'post' });
      message.success(t('Deleted'));
      fetchData();
    } catch {
      message.error(t('Failed to delete'));
    }
  };

  /** 保存模板（新增或更新） */
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (!values.content) {
        message.warning(t('Please edit template content'));
        return;
      }

      if (editingTemplate) {
        await app.apiClient.request({
          url: `printTemplates:update/${editingTemplate.id}`,
          method: 'post',
          data: values,
        });
        message.success(t('Updated'));
      } else {
        await app.apiClient.request({
          url: 'printTemplates:create',
          method: 'post',
          data: values,
        });
        message.success(t('Created'));
      }
      setModalVisible(false);
      fetchData();
    } catch (err: any) {
      if (err.message) {
        message.error(err.message);
      }
    }
  };

  // 表格列定义
  const columns = [
    { title: t('Name'), dataIndex: 'name', key: 'name' },
    {
      title: t('Type'),
      dataIndex: 'type',
      key: 'type',
      render: (v: string) => (v === 'word' ? t('Word') : t('Excel')),
    },
    { title: t('Collection'), dataIndex: 'collectionName', key: 'collectionName' },
    {
      title: t('Enabled'),
      dataIndex: 'enabled',
      key: 'enabled',
      render: (v: boolean) => (v ? t('Yes') : t('No')),
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: any, record: Template) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)} />
          <Popconfirm title={t('Delete?')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* 页面标题 + 新建按钮 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>{t('Templates')}</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          {t('New Template')}
        </Button>
      </div>

      {/* 模板列表表格 */}
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} />

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editingTemplate ? t('Edit Template') : t('New Template')}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        width={1200}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          {/* 模板名称 */}
          <Form.Item name="name" label={t('Name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          {/* 模板类型 */}
          <Form.Item name="type" label={t('Type')} rules={[{ required: true }]}>
            <Select
              options={[
                { label: t('Word'), value: 'word' },
                { label: t('Excel'), value: 'excel' },
              ]}
            />
          </Form.Item>

          {/* 关联数据表 */}
          <Form.Item name="collectionName" label={t('Collection')} rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder={t('Select a collection')}
              options={collectionOptions}
              filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>

          {/* 描述 */}
          <Form.Item name="description" label={t('Description')}>
            <Input.TextArea rows={2} />
          </Form.Item>

          {/* 启用开关 */}
          <Form.Item name="enabled" label={t('Enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>

          {/* 模板内容（纯文本编辑） */}
          <Form.Item name="content" label={t('Template Content')}>
            <Input.TextArea rows={10} placeholder={t('Enter template content (HTML)')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TemplateListPage;
