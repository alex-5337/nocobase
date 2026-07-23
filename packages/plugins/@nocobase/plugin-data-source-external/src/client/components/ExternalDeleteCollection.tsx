/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { DeleteOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { css } from '@emotion/css';
import { useForm } from '@formily/react';
import { Button, message } from 'antd';
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useActionContext,
  useAPIClient,
  useCollectionManager_deprecated,
  useResourceActionContext,
  RecordProvider,
  useRecord,
  ActionContextProvider,
  SchemaComponent,
  useCancelAction,
} from '@nocobase/client';

const useDestroyActionWithKeepTable = () => {
  const api = useAPIClient();
  const { refresh, defaultRequest } = useResourceActionContext();
  const { name: dataSourceKey } = useParams<{ name: string }>();
  const record = useRecord();
  const form = useForm();
  const { cascade, keepTable } = form?.values || {};
  return {
    async run() {
      const resourceName = defaultRequest?.resource || 'dataSources.collections';
      await api.resource(resourceName, dataSourceKey).destroy({
        filterByTk: record.name,
        cascade,
        keepTable,
      });
      refresh();
    },
  };
};

const useDestroyActionAndRefreshCM = () => {
  const { run } = useDestroyActionWithKeepTable();
  const { refreshCM } = useCollectionManager_deprecated();
  return {
    async run() {
      await run();
      await refreshCM();
    },
  };
};

const useBulkDestroyActionWithKeepTable = () => {
  const api = useAPIClient();
  const { state, setState, refresh, defaultRequest } = useResourceActionContext();
  const { name: dataSourceKey } = useParams<{ name: string }>();
  const ctx = useActionContext();
  const { t } = useTranslation('data-source-external');
  const form = useForm();
  const { cascade, keepTable } = form?.values || {};
  const selectedRowKeys = Object.values(state?.selectedRowKeys || state).flat();
  return {
    async run() {
      if (!selectedRowKeys?.length) {
        return message.error(t('Please select the records you want to delete'));
      }
      const resourceName = defaultRequest?.resource || 'dataSources.collections';
      await api.resource(resourceName, dataSourceKey).destroy({
        filterByTk: selectedRowKeys || [],
        cascade,
        keepTable,
      });
      form.reset();
      ctx?.setVisible?.(false);
      setState?.({});
      refresh();
    },
  };
};

const useBulkDestroyActionAndRefreshCM = () => {
  const { run } = useBulkDestroyActionWithKeepTable();
  const { refreshCM } = useCollectionManager_deprecated();
  return {
    async run() {
      await run();
      await refreshCM();
    },
  };
};

export const DeleteExternalCollectionAction = (props) => {
  const { scope, getContainer, item: record, children, isBulk, useAction, ...otherProps } = props;
  const { t } = useTranslation('data-source-external');
  const [visible, setVisible] = useState(false);

  const getDestroyCollectionAction = () => {
    if (isBulk) {
      return useBulkDestroyActionAndRefreshCM;
    } else {
      if (useAction) {
        return useAction;
      }
      return useDestroyActionAndRefreshCM;
    }
  };

  const Title = () => {
    return (
      <span>
        <ExclamationCircleFilled style={{ color: '#faad14', marginRight: '12px', fontSize: '22px' }} />
        <span style={{ fontSize: '19px' }}>{t('Delete collection')}</span>
      </span>
    );
  };

  return (
    <RecordProvider record={record}>
      <ActionContextProvider value={{ visible, setVisible }}>
        {isBulk ? (
          <Button icon={<DeleteOutlined />} onClick={() => setVisible(true)}>
            {children || t('Delete')}
          </Button>
        ) : (
          <a onClick={() => setVisible(true)} {...otherProps}>
            {children || t('Delete')}
          </a>
        )}
        <SchemaComponent
          schema={{
            type: 'object',
            properties: {
              deleteCollection: {
                type: 'void',
                'x-decorator': 'Form',
                'x-component': 'Action.Modal',
                title: <Title />,
                'x-component-props': {
                  width: 520,
                  getContainer: '{{ getContainer }}',
                  className: css`
                    .ant-modal-body {
                      margin-left: 35px;
                      margin-bottom: 35px;
                      .ant-checkbox-wrapper {
                        height: 25px;
                      }
                    }
                  `,
                },
                properties: {
                  info: {
                    type: 'string',
                    'x-component': 'div',
                    'x-content': "{{t('Are you sure you want to delete it?')}}",
                  },
                  cascade: {
                    type: 'boolean',
                    'x-decorator': 'FormItem',
                    'x-decorator-props': { style: { marginBottom: 4 } },
                    'x-component': 'Checkbox',
                    default: false,
                    'x-content': t(
                      'Automatically drop objects that depend on the collection (such as views), and in turn all objects that depend on those objects',
                    ),
                  },
                  keepTable: {
                    type: 'boolean',
                    'x-decorator': 'FormItem',
                    'x-decorator-props': { style: { marginBottom: 16 } },
                    'x-component': 'Checkbox',
                    default: true,
                    'x-content': t('Only delete the collection record, keep the underlying table'),
                  },
                  footer: {
                    type: 'void',
                    'x-component': 'Action.Modal.Footer',
                    properties: {
                      action1: {
                        title: '{{ t("Cancel") }}',
                        'x-component': 'Action',
                        'x-component-props': {
                          useAction: '{{ useCancelAction }}',
                        },
                      },
                      action2: {
                        title: '{{ t("Ok") }}',
                        'x-component': 'Action',
                        'x-component-props': {
                          type: 'primary',
                          useAction: '{{ useDestroyCollectionAction }}',
                          style: {
                            marginLeft: '8px',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          }}
          scope={{
            getContainer,
            useDestroyCollectionAction: getDestroyCollectionAction(),
            useCancelAction,
            ...scope,
          }}
        />
      </ActionContextProvider>
    </RecordProvider>
  );
};

export const ExternalDeleteCollection = (props) => {
  const record = useRecord();
  return <DeleteExternalCollectionAction item={record} {...props} />;
};
