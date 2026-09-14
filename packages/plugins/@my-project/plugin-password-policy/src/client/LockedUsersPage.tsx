/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useAPIClient } from '@nocobase/client';
import { useDebounceFn, useRequest } from 'ahooks';
import { App, Button, Form, Modal, Popconfirm, Select, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import { lockedUsersCollectionName, LockedUserRecord } from '../shared/constants';
import { usePluginTranslation } from './locale';

interface SelectableUser {
  id: number;
  username?: string;
  nickname?: string;
  email?: string;
}

interface UserOption {
  label: string;
  value: number;
  user: SelectableUser;
}

export const LockedUsersPage: React.FC = () => {
  const { t } = usePluginTranslation();
  const api = useAPIClient();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [fetching, setFetching] = useState(false);
  const [form] = Form.useForm<{ userId: number }>();

  const {
    data: records,
    loading,
    refresh,
  } = useRequest<LockedUserRecord[], []>(async () => {
    const response = await api.resource(lockedUsersCollectionName).list({ paginate: false, sort: ['-updatedAt'] });
    return (response?.data?.data || []) as LockedUserRecord[];
  });

  const searchUsers = async (keyword?: string) => {
    setFetching(true);
    try {
      const filter = keyword
        ? {
            $or: [
              { username: { $includes: keyword } },
              { email: { $includes: keyword } },
              { nickname: { $includes: keyword } },
            ],
          }
        : {};
      const response = await api.resource('users').list({
        filter,
        fields: ['id', 'username', 'nickname', 'email'],
        pageSize: 20,
      });
      const rows = (response?.data?.data || []) as SelectableUser[];
      setUserOptions(
        rows.map((user) => ({
          value: user.id,
          user,
          label: [user.nickname, user.username].filter(Boolean).join(' / ') + (user.email ? ` (${user.email})` : ''),
        })),
      );
    } finally {
      setFetching(false);
    }
  };

  const { run: debouncedSearchUsers } = useDebounceFn(searchUsers, { wait: 300 });

  const handleLock = async () => {
    const { userId } = await form.validateFields();
    const user = userOptions.find((item) => item.value === userId)?.user;
    if (!user) {
      return;
    }
    await api.resource(lockedUsersCollectionName).create({
      values: {
        userId: user.id,
        username: user.username,
        nickname: user.nickname,
        email: user.email,
        locked: true,
        manualLock: true,
        failedAttempts: 0,
        windowStartAt: 0,
        lastFailedAt: 0,
        lockedUntil: 0,
      },
    });
    message.success(t('Locked successfully'));
    setOpen(false);
    refresh();
  };

  const handleUnlock = async (record: LockedUserRecord) => {
    await api.resource(lockedUsersCollectionName).destroy({ filterByTk: record.id });
    message.success(t('Unlocked successfully'));
    refresh();
  };

  const renderStatus = (_: unknown, record: LockedUserRecord) => {
    if (record.manualLock) {
      return <Tag color="error">{t('Locked by administrator')}</Tag>;
    }
    if (record.locked) {
      const lockedUntil = Number(record.lockedUntil) || 0;
      if (lockedUntil === 0) {
        return <Tag color="error">{t('Locked until an administrator unlocks the account')}</Tag>;
      }
      if (lockedUntil > Date.now()) {
        return (
          <Tag color="error">
            {t('Locked until {{time}}', { time: dayjs(lockedUntil).format('YYYY-MM-DD HH:mm:ss') })}
          </Tag>
        );
      }
    }
    return <Tag>{t('Not locked (counting failed attempts)')}</Tag>;
  };

  const columns = [
    {
      title: t('Username'),
      dataIndex: 'username',
      render: (value: string, record: LockedUserRecord) => value || record.nickname || '-',
    },
    { title: t('Email'), dataIndex: 'email', render: (value: string) => value || '-' },
    { title: t('Failed attempts'), dataIndex: 'failedAttempts', width: 130 },
    { title: t('Status'), render: renderStatus },
    {
      title: t('Updated at'),
      dataIndex: 'updatedAt',
      width: 180,
      render: (value: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: t('Actions'),
      width: 100,
      render: (_, record: LockedUserRecord) => (
        <Popconfirm title={t('Unlock this user?')} onConfirm={() => handleUnlock(record)}>
          <Button type="link" size="small" style={{ padding: 0 }}>
            {t('Unlock')}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Button
        type="primary"
        onClick={() => {
          form.resetFields();
          setOpen(true);
          searchUsers();
        }}
      >
        {t('Lock user')}
      </Button>
      <Table rowKey="id" columns={columns} dataSource={records || []} loading={loading} />
      <Modal title={t('Lock user')} open={open} onOk={handleLock} onCancel={() => setOpen(false)} forceRender>
        <Form form={form} layout="vertical">
          <Form.Item
            name="userId"
            label={t('Select user')}
            rules={[{ required: true, message: t('Please select a user') }]}
          >
            <Select
              showSearch
              filterOption={false}
              loading={fetching}
              options={userOptions}
              onSearch={debouncedSearchUsers}
              placeholder={t('Search by username, email or nickname')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default LockedUsersPage;
