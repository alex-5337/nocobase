/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useCallback } from 'react';
import { Tooltip } from 'antd';
import { BulbOutlined } from '@ant-design/icons';
import { useToken } from '@nocobase/client';
import { useChatBoxStore } from './stores/chat-box';
import { useT } from '../../locale';

const EFFORT_OPTIONS = [
  { label: 'Off', value: '' },
  { label: 'High', value: 'high' },
  { label: 'Max', value: 'max' },
] as const;

const EFFORT_LABELS = {
  '': 'Off',
  high: 'High',
  max: 'Max',
};

export const ReasoningEffortSwitcher: React.FC = () => {
  const t = useT();
  const { token } = useToken();
  const model = useChatBoxStore.use.model();
  const reasoningEffort = useChatBoxStore.use.reasoningEffort();
  const setReasoningEffort = useChatBoxStore.use.setReasoningEffort();

  const handleClick = useCallback(() => {
    const currentIndex = EFFORT_OPTIONS.findIndex((o) => o.value === (reasoningEffort || ''));
    const nextIndex = (currentIndex + 1) % EFFORT_OPTIONS.length;
    setReasoningEffort(EFFORT_OPTIONS[nextIndex].value);
  }, [reasoningEffort, setReasoningEffort]);

  if (!model) return null;

  const isActive = !!reasoningEffort;

  return (
    <Tooltip title={`Thinking: ${t(EFFORT_LABELS[reasoningEffort || ''])}`}>
      <span
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          cursor: 'pointer',
          borderRadius: 6,
          backgroundColor: isActive ? token.colorFillSecondary : token.colorFillTertiary,
          opacity: isActive ? 1 : 0.5,
          userSelect: 'none',
          transition: 'background-color 0.2s, opacity 0.2s',
        }}
      >
        <BulbOutlined style={{ fontSize: 14, color: isActive ? token.colorText : token.colorTextQuaternary }} />
      </span>
    </Tooltip>
  );
};
