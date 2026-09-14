/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useAPIClient } from '@nocobase/client';
import { useRequest } from 'ahooks';
import { App, Button, Card, Col, Divider, Form, InputNumber, Row, Select, Spin, Switch } from 'antd';
import React, { useEffect } from 'react';
import {
  defaultPasswordPolicyConfig,
  PasswordPolicyConfig,
  passwordPolicyCollectionName,
  passwordPolicyRecordKey,
} from '../shared/constants';
import { LockedUsersPage } from './LockedUsersPage';
import { usePluginTranslation } from './locale';

export const PasswordPolicyPage: React.FC = () => {
  const { t } = usePluginTranslation();
  const api = useAPIClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<PasswordPolicyConfig>();
  const [submitting, setSubmitting] = React.useState(false);
  const complexityOptions = [
    { value: 0, label: t('No restriction') },
    { value: 1, label: t('Must contain letters and numbers') },
    { value: 2, label: t('Must contain letters, numbers and symbols') },
    { value: 3, label: t('Must contain digits, uppercase and lowercase letters') },
    { value: 4, label: t('Must contain digits, uppercase letters, lowercase letters and symbols') },
    {
      value: 5,
      label: t('Must contain at least 3 of: digits, uppercase letters, lowercase letters and special characters'),
    },
  ];

  const { data: policyConfig, loading } = useRequest(async () => {
    const response = await api.resource(passwordPolicyCollectionName).get({ filterByTk: passwordPolicyRecordKey });
    return (response?.data?.data?.config || {}) as Partial<PasswordPolicyConfig>;
  });

  useEffect(() => {
    if (policyConfig) {
      form.setFieldsValue({ ...defaultPasswordPolicyConfig, ...policyConfig });
    }
  }, [form, policyConfig]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await api.resource(passwordPolicyCollectionName).update({
        filterByTk: passwordPolicyRecordKey,
        values: { config: values },
      });
      message.success(t('Saved successfully'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Spin />;
  }

  return (
    <Card variant="borderless">
      <Form
        form={form}
        layout="horizontal"
        labelCol={{ flex: '0 0 160px' }}
        wrapperCol={{ flex: '1 1 auto' }}
        labelWrap
        initialValues={defaultPasswordPolicyConfig}
        onFinish={handleSubmit}
      >
        <Divider orientation="left" plain>
          {t('Password complexity')}
        </Divider>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item name="passwordComplexity" label={t('Password complexity rules')}>
              <Select options={complexityOptions} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} xl={12}>
            <Form.Item name="minPasswordLength" label={t('Minimum password length')}>
              <InputNumber min={1} max={64} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} xl={12}>
            <Form.Item
              name="cantIncludeUsername"
              label={t('Password cannot contain the username')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
        </Row>
        <Divider orientation="left" plain>
          {t('Login failure lockout')}
        </Divider>
        <Row gutter={16}>
          <Col xs={24} xl={8}>
            <Form.Item
              name="maxFailedAttempts"
              label={t('Maximum failed sign-in attempts')}
              extra={t('0 means no limit')}
            >
              <InputNumber min={0} max={100} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} xl={8}>
            <Form.Item
              name="failedAttemptWindow"
              label={t('Failed attempt window (seconds)')}
              extra={t('0 means no limit')}
            >
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} xl={8}>
            <Form.Item
              name="lockDuration"
              label={t('Lock duration (seconds)')}
              extra={t('0 means locked until an administrator unlocks the account')}
            >
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" htmlType="submit" loading={submitting}>
          {t('Submit')}
        </Button>
      </Form>
      <Divider orientation="left" plain>
        {t('Locked users')}
      </Divider>
      <LockedUsersPage />
    </Card>
  );
};

export default PasswordPolicyPage;
