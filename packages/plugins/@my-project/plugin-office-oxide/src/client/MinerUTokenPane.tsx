/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Card, Divider, Form, Input, Space, Switch, Typography } from 'antd';
import { KeyOutlined, LinkOutlined, SaveOutlined } from '@ant-design/icons';
import { useAPIClient } from '@nocobase/client';
import { useT } from './locale';

const CATEGORIES = [
  { key: 'pdf', labelKey: 'PDF documents' },
  { key: 'word', labelKey: 'Word documents' },
  { key: 'excel', labelKey: 'Excel spreadsheets' },
  { key: 'ppt', labelKey: 'PPT presentations' },
  { key: 'image', labelKey: 'Images' },
];

export const MinerUTokenPane = () => {
  const t = useT();
  const api = useAPIClient();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mineruCategories, setMineruCategories] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);

  const loadConfig = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await api.request({
        method: 'post',
        url: 'officeOxide:getMineruToken',
        signal: controller.signal,
      });
      const token = res.data?.data?.token || '';
      const categories = res.data?.data?.mineruCategories || {};
      form.setFieldsValue({ token });
      setMineruCategories(categories);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      message.error(t('Failed to load token'));
    } finally {
      setLoading(false);
    }
  }, [api, form, t, message]);

  useEffect(() => {
    loadConfig();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadConfig]);

  const handleCategoryChange = useCallback(
    async (category: string, checked: boolean) => {
      setMineruCategories((prev) => ({ ...prev, [category]: checked }));
      try {
        await api.request({
          method: 'post',
          url: 'officeOxide:setMineruToken',
          data: { mineruCategories: { [category]: checked } },
        });
      } catch {
        setMineruCategories((prev) => ({ ...prev, [category]: !checked }));
        message.error(t('Failed to save token'));
      }
    },
    [api, t, message],
  );

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.request({
        method: 'post',
        url: 'officeOxide:setMineruToken',
        data: { token: values.token },
      });
      message.success(t('Token saved successfully'));
    } catch (err: any) {
      if (err?.errorFields) {
        return;
      }
      message.error(err?.message || t('Failed to save token'));
    } finally {
      setSaving(false);
    }
  }, [api, form, t, message]);

  return (
    <Card variant="borderless" loading={loading}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Typography.Title level={5}>
            <KeyOutlined /> {t('MinerU API Token')}
          </Typography.Title>
          <Typography.Paragraph type="secondary">{t('MinerU token description')}</Typography.Paragraph>
          <Typography.Link href="https://mineru.net/apiManage/token" target="_blank" rel="noopener noreferrer">
            <LinkOutlined /> {t('Get MinerU token')}
          </Typography.Link>
        </div>

        <Divider />

        <div>
          <Typography.Text strong>{t('Use MinerU for')}</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
            {t('MinerU settings hint')}
          </Typography.Paragraph>
          <Space direction="vertical" style={{ marginTop: 12 }} size="middle">
            {CATEGORIES.map(({ key, labelKey }) => (
              <Space key={key}>
                <Switch checked={!!mineruCategories[key]} onChange={(checked) => handleCategoryChange(key, checked)} />
                <span>{t(labelKey)}</span>
              </Space>
            ))}
          </Space>
        </div>

        <Divider />

        <Form form={form} layout="vertical" style={{ maxWidth: 520 }}>
          <Form.Item name="token" label={t('API Token')} rules={[{ required: true, message: t('Token is required') }]}>
            <Input.Password placeholder={t('Enter your MinerU API token')} autoComplete="off" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
              {t('Save')}
            </Button>
          </Form.Item>
        </Form>
      </Space>
    </Card>
  );
};
