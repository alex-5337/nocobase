/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';
import { Form, Input, InputNumber, Select, Switch } from 'antd';
import { useT } from '../locale';

export function ExternalDataSourceSettingsForm(props: any) {
  const t = useT();
  const form = Form.useFormInstance();
  const dataSourceType = props.type?.name;
  const isPostgres = dataSourceType === 'postgres';
  const defaultPort = isPostgres ? 5432 : 3306;

  return (
    <>
      <Form.Item
        name={['options', 'host']}
        label={t('Host')}
        rules={[{ required: true, message: t('Please enter the host address') }]}
      >
        <Input placeholder={isPostgres ? 'localhost' : 'localhost'} />
      </Form.Item>

      <Form.Item
        name={['options', 'port']}
        label={t('Port')}
        initialValue={defaultPort}
        rules={[{ required: true, message: t('Please enter the port') }]}
      >
        <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder={String(defaultPort)} />
      </Form.Item>

      <Form.Item
        name={['options', 'database']}
        label={t('Database name')}
        rules={[{ required: true, message: t('Please enter the database name') }]}
      >
        <Input placeholder={isPostgres ? 'my_database' : 'my_database'} />
      </Form.Item>

      <Form.Item
        name={['options', 'username']}
        label={t('Username')}
        rules={[{ required: true, message: t('Please enter the username') }]}
      >
        <Input placeholder={isPostgres ? 'postgres' : 'root'} />
      </Form.Item>

      <Form.Item
        name={['options', 'password']}
        label={t('Password')}
        rules={[{ required: true, message: t('Please enter the password') }]}
      >
        <Input.Password />
      </Form.Item>

      {isPostgres && (
        <Form.Item name={['options', 'schema']} label={t('Schema')} initialValue="public">
          <Input placeholder="public" />
        </Form.Item>
      )}

      <Form.Item name={['options', 'charset']} label={t('Charset')}>
        <Input placeholder={isPostgres ? 'UTF8' : 'utf8mb4'} />
      </Form.Item>

      <Form.Item name={['options', 'tablePrefix']} label={t('Table prefix')}>
        <Input placeholder={t('Optional')} />
      </Form.Item>

      <Form.Item label={t('SSL')} name={['options', 'ssl', 'sslMode']} initialValue="disable">
        <Select>
          <Select.Option value="disable">{t('Disabled')}</Select.Option>
          <Select.Option value="require">{t('Required')}</Select.Option>
          {isPostgres && (
            <>
              <Select.Option value="verify-ca">{t('Verify CA')}</Select.Option>
              <Select.Option value="verify-full">{t('Verify Full')}</Select.Option>
            </>
          )}
        </Select>
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(prev, cur) => prev?.options?.ssl?.sslMode !== cur?.options?.ssl?.sslMode}>
        {({ getFieldValue }) => {
          const sslMode = getFieldValue(['options', 'ssl', 'sslMode']);
          if (sslMode === 'disable') return null;
          return (
            <>
              <Form.Item name={['options', 'ssl', 'ca']} label={t('SSL CA Certificate')}>
                <Input.TextArea rows={3} placeholder={t('Paste CA certificate content')} />
              </Form.Item>
              <Form.Item
                name={['options', 'ssl', 'rejectUnauthorized']}
                label={t('Reject Unauthorized')}
                valuePropName="checked"
              >
                <Switch defaultChecked />
              </Form.Item>
            </>
          );
        }}
      </Form.Item>
    </>
  );
}
