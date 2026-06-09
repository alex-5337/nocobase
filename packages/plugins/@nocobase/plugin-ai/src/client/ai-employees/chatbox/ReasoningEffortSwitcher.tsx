/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';
import { Select } from 'antd';
import { useToken } from '@nocobase/client';
import { useChatBoxStore } from './stores/chat-box';
import { useT } from '../../locale';

export const ReasoningEffortSwitcher: React.FC = () => {
  const t = useT();
  const { token } = useToken();
  const model = useChatBoxStore.use.model();
  const reasoningEffort = useChatBoxStore.use.reasoningEffort();
  const setReasoningEffort = useChatBoxStore.use.setReasoningEffort();

  if (!model) return null;

  return (
    <Select
      size="small"
      value={reasoningEffort}
      onChange={setReasoningEffort}
      style={{
        width: 100,
        fontSize: 12,
        backgroundColor: token.colorFillTertiary,
        borderRadius: 6,
      }}
      options={[
        { label: t('High'), value: 'high' },
        { label: t('Max'), value: 'max' },
      ]}
    />
  );
};
