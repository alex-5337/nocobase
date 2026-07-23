/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { SchemaComponent, useRecord } from '@nocobase/client';
import React from 'react';
import { DataSourceSyncPanel } from '../components/DataSourceSyncPanel';

const getSchema = (dialect: string) => {
  const isPostgres = dialect === 'postgres';
  const defaultPort = isPostgres ? 5432 : 3306;

  const properties: Record<string, any> = {
    key: {
      type: 'string',
      title: '{{t("Data source name", { ns: "data-source-external" })}}',
      required: true,
      'x-decorator': 'FormItem',
      'x-component': 'Input',
    },
    displayName: {
      type: 'string',
      title: '{{t("Data source display name", { ns: "data-source-external" })}}',
      required: true,
      'x-decorator': 'FormItem',
      'x-component': 'Input',
    },
    'options.host': {
      type: 'string',
      title: '{{t("Host", { ns: "data-source-external" })}}',
      required: true,
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-component-props': {
        placeholder: 'localhost',
      },
    },
    'options.port': {
      type: 'number',
      title: '{{t("Port", { ns: "data-source-external" })}}',
      required: true,
      default: defaultPort,
      'x-decorator': 'FormItem',
      'x-component': 'InputNumber',
      'x-component-props': {
        min: 1,
        max: 65535,
        placeholder: String(defaultPort),
        style: { width: '100%' },
      },
    },
    'options.database': {
      type: 'string',
      title: '{{t("Database name", { ns: "data-source-external" })}}',
      required: true,
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-component-props': {
        placeholder: 'my_database',
      },
    },
    'options.username': {
      type: 'string',
      title: '{{t("Username", { ns: "data-source-external" })}}',
      required: true,
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-component-props': {
        placeholder: isPostgres ? 'postgres' : 'root',
      },
    },
    'options.password': {
      type: 'string',
      title: '{{t("Password", { ns: "data-source-external" })}}',
      required: true,
      'x-decorator': 'FormItem',
      'x-component': 'Password',
    },
    'options.charset': {
      type: 'string',
      title: '{{t("Charset", { ns: "data-source-external" })}}',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-component-props': {
        placeholder: isPostgres ? 'UTF8' : 'utf8mb4',
      },
    },
    'options.tablePrefix': {
      type: 'string',
      title: '{{t("Table prefix", { ns: "data-source-external" })}}',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-component-props': {
        placeholder: '{{t("Optional", { ns: "data-source-external" })}}',
      },
    },
    'options.ssl.sslMode': {
      type: 'string',
      title: '{{t("SSL", { ns: "data-source-external" })}}',
      default: 'disable',
      'x-decorator': 'FormItem',
      'x-component': 'Select',
      enum: isPostgres
        ? [
            { label: '{{t("Disabled", { ns: "data-source-external" })}}', value: 'disable' },
            { label: '{{t("Required", { ns: "data-source-external" })}}', value: 'require' },
            { label: '{{t("Verify CA", { ns: "data-source-external" })}}', value: 'verify-ca' },
            { label: '{{t("Verify Full", { ns: "data-source-external" })}}', value: 'verify-full' },
          ]
        : [
            { label: '{{t("Disabled", { ns: "data-source-external" })}}', value: 'disable' },
            { label: '{{t("Required", { ns: "data-source-external" })}}', value: 'require' },
          ],
    },
  };

  if (isPostgres) {
    const caReaction = {
      dependencies: ['options.ssl.sslMode'],
      fulfill: {
        state: {
          visible: '{{$deps[0] === "verify-ca" || $deps[0] === "verify-full"}}',
        },
      },
    };

    const clientCertReaction = {
      dependencies: ['options.ssl.sslMode'],
      fulfill: {
        state: {
          visible: '{{$deps[0] === "verify-full"}}',
        },
      },
    };

    properties['options.ssl.ca'] = {
      type: 'string',
      title: '{{t("CA Certificate (optional)", { ns: "data-source-external" })}}',
      'x-decorator': 'FormItem',
      'x-component': 'Input.TextArea',
      'x-component-props': {
        rows: 4,
        placeholder: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
      },
      'x-reactions': caReaction,
    };

    properties['options.ssl.key'] = {
      type: 'string',
      title: '{{t("Client Key (optional)", { ns: "data-source-external" })}}',
      'x-decorator': 'FormItem',
      'x-component': 'Input.TextArea',
      'x-component-props': {
        rows: 4,
        placeholder: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
      },
      'x-reactions': clientCertReaction,
    };

    properties['options.ssl.cert'] = {
      type: 'string',
      title: '{{t("Client Certificate (optional)", { ns: "data-source-external" })}}',
      'x-decorator': 'FormItem',
      'x-component': 'Input.TextArea',
      'x-component-props': {
        rows: 4,
        placeholder: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
      },
      'x-reactions': clientCertReaction,
    };

    properties['options.schema'] = {
      type: 'string',
      title: '{{t("Schema", { ns: "data-source-external" })}}',
      default: 'public',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-component-props': {
        placeholder: 'public',
      },
    };
  }

  return {
    type: 'object',
    properties,
  };
};

const SettingsForm: React.FC<{ dialect: string; from?: string }> = ({ dialect, from }) => {
  const record = useRecord();
  const schema = getSchema(dialect || 'postgres');

  return (
    <div>
      <SchemaComponent schema={schema} />
      {from !== 'edit' && record?.key && (
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
          <DataSourceSyncPanel dataSourceKey={record.key} />
        </div>
      )}
    </div>
  );
};

export const ExternalDataSourceSettingsForm = (props: any) => {
  const { dialect, from } = props;
  return <SettingsForm dialect={dialect} from={from} />;
};
