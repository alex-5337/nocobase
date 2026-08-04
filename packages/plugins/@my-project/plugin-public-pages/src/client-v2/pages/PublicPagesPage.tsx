/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useState } from 'react';
import { Button, Drawer, Form, Input, Popconfirm, Select, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import { useFlowContext } from '@nocobase/flow-engine';
import { useRequest } from 'ahooks';
import { useT } from '../locale';

type PageFormat = 'html' | 'react';

interface PublicPageRecord {
  id: number;
  slug: string;
  title?: string;
  format: PageFormat;
  content?: string;
  published: boolean;
  updatedAt?: string;
}

interface PageValues {
  slug: string;
  title?: string;
  format: PageFormat;
  content?: string;
  published: boolean;
}

interface ListResponseBody {
  data: PublicPageRecord[];
}

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Hello</title>
</head>
<body>
<h1>Hello NocoBase</h1>
</body>
</html>`;

const REACT_TEMPLATE = `function App() {
  const [count, setCount] = React.useState(0);
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Hello NocoBase</h1>
      <button onClick={() => setCount(count + 1)}>count: {count}</button>
    </div>
  );
}`;

function getPageUrl(slug: string) {
  return `${window.location.origin}/public/${encodeURIComponent(slug)}`;
}

export default function PublicPagesPage() {
  const ctx = useFlowContext();
  const t = useT();
  const [form] = Form.useForm<PageValues>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<PublicPageRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, loading, refresh } = useRequest(() =>
    ctx.api.request<ListResponseBody>({
      url: 'publicPages:list',
      method: 'get',
      params: { sort: '-updatedAt', pageSize: 200 },
    }),
  );
  const list: PublicPageRecord[] = data?.data?.data ?? [];

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ format: 'html', published: false, content: HTML_TEMPLATE });
    setDrawerOpen(true);
  };

  const openEdit = (record: PublicPageRecord) => {
    setEditing(record);
    form.setFieldsValue({
      slug: record.slug,
      title: record.title,
      format: record.format,
      content: record.content,
      published: record.published,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await ctx.api.request({
          url: 'publicPages:update',
          method: 'post',
          params: { filterByTk: editing.id },
          data: values,
        });
      } else {
        await ctx.api.request({ url: 'publicPages:create', method: 'post', data: values });
      }
      ctx.message.success(t('Saved successfully'));
      setDrawerOpen(false);
      refresh();
    } catch (error) {
      ctx.message.error(t('Save failed'));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: PublicPageRecord) => {
    await ctx.api.request({
      url: 'publicPages:destroy',
      method: 'post',
      params: { filterByTk: record.id },
    });
    ctx.message.success(t('Deleted successfully'));
    refresh();
  };

  const handleTogglePublished = async (record: PublicPageRecord, published: boolean) => {
    await ctx.api.request({
      url: 'publicPages:update',
      method: 'post',
      params: { filterByTk: record.id },
      data: { published },
    });
    refresh();
  };

  const handleFormatChange = (format: PageFormat) => {
    const content = form.getFieldValue('content');
    if (!content || content === HTML_TEMPLATE || content === REACT_TEMPLATE) {
      form.setFieldsValue({ content: format === 'react' ? REACT_TEMPLATE : HTML_TEMPLATE });
    }
  };

  const columns = [
    {
      title: t('Slug'),
      dataIndex: 'slug',
      key: 'slug',
      render: (slug: string, record: PublicPageRecord) => (
        <Typography.Text copyable={{ text: getPageUrl(slug) }}>{slug}</Typography.Text>
      ),
    },
    {
      title: t('Title'),
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: t('Format'),
      dataIndex: 'format',
      key: 'format',
      render: (format: PageFormat) => <Tag color={format === 'react' ? 'blue' : 'green'}>{format}</Tag>,
    },
    {
      title: t('Published'),
      dataIndex: 'published',
      key: 'published',
      render: (published: boolean, record: PublicPageRecord) => (
        <Switch size="small" checked={published} onChange={(checked) => handleTogglePublished(record, checked)} />
      ),
    },
    {
      title: t('Updated at'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (value?: string) => (value ? new Date(value).toLocaleString() : '-'),
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, record: PublicPageRecord) => (
        <Space>
          <Tooltip title={record.published ? t('Preview') : t('Unpublished pages cannot be accessed')}>
            <Button
              type="link"
              size="small"
              disabled={!record.published}
              href={getPageUrl(record.slug)}
              target="_blank"
            >
              {t('Preview')}
            </Button>
          </Tooltip>
          <Button type="link" size="small" onClick={() => openEdit(record)}>
            {t('Edit')}
          </Button>
          <Popconfirm title={t('Are you sure you want to delete this page?')} onConfirm={() => handleDelete(record)}>
            <Button type="link" size="small" danger>
              {t('Delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const watchedFormat = Form.useWatch('format', form);

  return (
    <div style={{ padding: 16 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={openCreate}>
          {t('Add page')}
        </Button>
        <Button onClick={refresh}>{t('Refresh')}</Button>
      </Space>
      <Table columns={columns} dataSource={list} loading={loading} rowKey="id" pagination={{ pageSize: 20 }} />
      <Drawer
        title={editing ? t('Edit page') : t('Add page')}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={720}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>{t('Cancel')}</Button>
            <Button type="primary" onClick={handleSave} loading={saving}>
              {t('Save')}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label={t('Title')} name="title">
            <Input placeholder={t('Page title')} />
          </Form.Item>
          <Form.Item
            label={t('Slug')}
            name="slug"
            rules={[
              { required: true, message: t('Please enter a slug') },
              {
                pattern: /^[a-z0-9][a-z0-9-_]*$/,
                message: t('The slug can only contain lowercase letters, digits, hyphens and underscores'),
              },
            ]}
          >
            <Input placeholder="demo" addonBefore="/public/" />
          </Form.Item>
          <Form.Item label={t('Format')} name="format" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'HTML', value: 'html' },
                { label: 'React (JSX)', value: 'react' },
              ]}
              onChange={handleFormatChange}
            />
          </Form.Item>
          {watchedFormat === 'react' && (
            <Typography.Paragraph type="secondary">
              {t('Define an App component in the content; it will be mounted to #root automatically.')}
            </Typography.Paragraph>
          )}
          <Form.Item
            label={t('Content')}
            name="content"
            rules={[{ required: true, message: t('Please enter page content') }]}
          >
            <Input.TextArea autoSize={{ minRows: 14, maxRows: 28 }} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item label={t('Published')} name="published" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
