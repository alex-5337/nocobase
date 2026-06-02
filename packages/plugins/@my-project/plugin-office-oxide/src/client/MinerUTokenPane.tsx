/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Card, Divider, Form, Input, Space, Switch, Tooltip, Typography } from 'antd';
import { KeyOutlined, LinkOutlined, SaveOutlined } from '@ant-design/icons';
import { useAPIClient } from '@nocobase/client';
import { useT } from './locale';

const CATEGORIES = [
  { key: 'pdf', labelKey: 'PDF documents', tipKey: 'PDF tooltip' },
  { key: 'word', labelKey: 'Word documents', tipKey: 'Word tooltip' },
  { key: 'excel', labelKey: 'Excel spreadsheets', tipKey: 'Excel tooltip' },
  { key: 'ppt', labelKey: 'PPT presentations', tipKey: 'PPT tooltip' },
  { key: 'image', labelKey: 'Images', tipKey: 'Image tooltip' },
];

export const MinerUTokenPane = () => {
  const t = useT();
  const api = useAPIClient();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mineruCategories, setMineruCategories] = useState<Record<string, boolean>>({});
  const [ocrConfig, setOcrConfig] = useState({ ocr: true, formula: false, table: true });
  const [baseUrl, setBaseUrl] = useState('');
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
      const config = res.data?.data?.ocrConfig || { ocr: true, formula: false, table: true };
      const url = res.data?.data?.baseUrl || 'https://mineru.net/api/v4';
      form.setFieldsValue({ token, baseUrl: url });
      setMineruCategories(categories);
      setOcrConfig(config);
      setBaseUrl(url);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      message.error(t('Failed to load settings'));
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
        message.error(t('Failed to save settings'));
      }
    },
    [api, t, message],
  );

  const handleOcrConfigChange = useCallback(
    async (key: string, checked: boolean) => {
      const next = { ...ocrConfig, [key]: checked };
      setOcrConfig(next);
      try {
        await api.request({
          method: 'post',
          url: 'officeOxide:setMineruToken',
          data: { ocrConfig: next },
        });
      } catch {
        setOcrConfig({ ...ocrConfig });
        message.error(t('Failed to save settings'));
      }
    },
    [api, t, message, ocrConfig],
  );

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.request({
        method: 'post',
        url: 'officeOxide:setMineruToken',
        data: { token: values.token, baseUrl: values.baseUrl },
      });
      message.success(t('Saved successfully'));
    } catch (err: any) {
      if (err?.errorFields) {
        return;
      }
      message.error(err?.message || t('Failed to save settings'));
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
        </div>

        <Divider />

        <div>
          <Typography.Text strong>{t('Use MinerU for')}</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
            {t('MinerU settings hint')}
          </Typography.Paragraph>
          <Space direction="vertical" style={{ marginTop: 12 }} size="middle">
            {CATEGORIES.map(({ key, labelKey, tipKey }) => (
              <Tooltip key={key} title={t(tipKey)}>
                <Space>
                  <Switch
                    checked={!!mineruCategories[key]}
                    onChange={(checked) => handleCategoryChange(key, checked)}
                  />
                  <span>{t(labelKey)}</span>
                </Space>
              </Tooltip>
            ))}
          </Space>
        </div>

        <Divider />

        <div>
          <Typography.Text strong>{t('MinerU OCR options')}</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
            {t('MinerU OCR options hint')}
          </Typography.Paragraph>
          <Space direction="vertical" style={{ marginTop: 12 }} size="middle">
            <Tooltip title={t('OCR tooltip')}>
              <Space>
                <Switch checked={ocrConfig.ocr} onChange={(checked) => handleOcrConfigChange('ocr', checked)} />
                <span>{t('OCR text recognition')}</span>
              </Space>
            </Tooltip>
            <Tooltip title={t('Table tooltip')}>
              <Space>
                <Switch checked={ocrConfig.table} onChange={(checked) => handleOcrConfigChange('table', checked)} />
                <span>{t('Table recognition')}</span>
              </Space>
            </Tooltip>
            <Tooltip title={t('Formula tooltip')}>
              <Space>
                <Switch checked={ocrConfig.formula} onChange={(checked) => handleOcrConfigChange('formula', checked)} />
                <span>{t('Formula recognition')}</span>
              </Space>
            </Tooltip>
          </Space>
        </div>

        <Divider />

        <Form form={form} layout="vertical" style={{ maxWidth: 520 }}>
          <Form.Item name="baseUrl" label={t('API Base URL')} extra={t('API Base URL hint')}>
            <Input placeholder="https://mineru.net/api/v4" />
          </Form.Item>
          <Form.Item name="token" label={t('API Token')} rules={[{ required: true, message: t('Token is required') }]}>
            <Input.Password placeholder={t('Enter your MinerU API token')} autoComplete="off" />
          </Form.Item>
          <Form.Item>
            <Typography.Link href="https://mineru.net/apiManage/token" target="_blank" rel="noopener noreferrer">
              <LinkOutlined /> {t('Get MinerU token')}
            </Typography.Link>
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
