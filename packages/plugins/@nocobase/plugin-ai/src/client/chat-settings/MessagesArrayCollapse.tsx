/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 *
 * Custom Collapse using antd Card + custom expand/collapse.
 * No rc-collapse involvement — avoids all event bubbling / formily field
 * interference issues.
 *
 */

/* eslint-disable */
import { RecursionField, useField, useFieldSchema, observer } from '@formily/react';
import { ArrayBase } from '@formily/antd-v5';
import { Card, Empty } from 'antd';
import React, { Fragment, useState } from 'react';

const isAdditionComponent = (schema: any) =>
  schema['x-component']?.indexOf?.('Addition') > -1;
const isIndexComponent = (schema: any) =>
  schema['x-component']?.indexOf?.('Index') > -1;
const isRemoveComponent = (schema: any) =>
  schema['x-component']?.indexOf?.('Remove') > -1;
const isMoveUpComponent = (schema: any) =>
  schema['x-component']?.indexOf?.('MoveUp') > -1;
const isMoveDownComponent = (schema: any) =>
  schema['x-component']?.indexOf?.('MoveDown') > -1;
const isOperationComponent = (schema: any) =>
  isAdditionComponent(schema) ||
  isRemoveComponent(schema) ||
  isMoveDownComponent(schema) ||
  isMoveUpComponent(schema);

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 0',
  cursor: 'pointer',
  userSelect: 'none',
};

const iconStyle = (rotated: boolean): React.CSSProperties => ({
  fontSize: 12,
  transition: 'transform 0.2s',
  transform: `rotate(${rotated ? 90 : 0}deg)`,
  color: '#8c8c8c',
});

const extraStyle: React.CSSProperties = {
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

// --- Panel sub-component ---

interface PanelProps {
  index: number;
  headerText: string;
  defaultOpen: boolean;
  children: React.ReactNode;
  extra: React.ReactNode;
}

const Panel: React.FC<PanelProps> = ({ headerText, defaultOpen, children, extra }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card
      size="small"
      style={{ marginBottom: 8 }}
      styles={{ body: open ? {} : { display: 'none' } }}
      title={
        <div style={headerStyle} onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 12 12" style={iconStyle(open)} width="12" height="12">
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>{headerText}</span>
          <div style={extraStyle} onClick={(e) => e.stopPropagation()}>
            {extra}
          </div>
        </div>
      }
    >
      {children}
    </Card>
  );
};

// --- Main component ---

interface IMessagesArrayCollapseProps {
  defaultOpenPanelCount?: number;
}

function CollapseComponentImpl(props: IMessagesArrayCollapseProps) {
  const { defaultOpenPanelCount = 5 } = props;
  const field = useField<any>();
  const dataSource = Array.isArray(field.value) ? field.value : [];
  const schema = useFieldSchema();

  if (!schema) throw new Error('can not found schema object');

  const renderAddition = () =>
    schema.reduceProperties((addition: any, s: any, key: string) => {
      if (isAdditionComponent(s))
        return <RecursionField schema={s} name={key} />;
      return addition;
    }, null);

  if (dataSource.length === 0) {
    return (
      <ArrayBase>
        <Card>
          <Empty />
        </Card>
        {renderAddition()}
      </ArrayBase>
    );
  }

  return (
    <ArrayBase>
      {dataSource.map((item: any, index: number) => {
        const items = Array.isArray(schema.items)
          ? schema.items[index] || schema.items[0]
          : schema.items;
        if (!items) return null;

        const panelProps = field.query(`${field.address}.${index}`).get('componentProps');
        const itemProps = items['x-component-props'] || {};
        const headerText = panelProps?.header || itemProps.header || field.title || '';

        const extra = (
          <ArrayBase.Item index={index} record={item}>
            {panelProps?.extra}
            <RecursionField
              schema={items}
              name={index}
              filterProperties={(s: any) => {
                if (!isOperationComponent(s)) return false;
                return true;
              }}
              onlyRenderProperties
            />
          </ArrayBase.Item>
        );

        const content = (
          <RecursionField
            schema={items}
            name={index}
            filterProperties={(s: any) => {
              if (isIndexComponent(s)) return false;
              if (isOperationComponent(s)) return false;
              return true;
            }}
          />
        );

        return (
          <Panel
            key={index}
            index={index}
            headerText={String(headerText)}
            defaultOpen={index < defaultOpenPanelCount}
            extra={extra}
          >
            <ArrayBase.Item index={index} record={item}>
              {content}
            </ArrayBase.Item>
          </Panel>
        );
      })}
      {renderAddition()}
    </ArrayBase>
  );
}

const CollapseComponent = observer(CollapseComponentImpl);

export const MessagesArrayCollapse = Object.assign(
  ArrayBase.mixin(CollapseComponent),
  {
    CollapsePanel: (({ children }: any) => <Fragment>{children}</Fragment>) as React.FC<any>,
  },
) as React.FC<React.PropsWithChildren<IMessagesArrayCollapseProps>> & {
  CollapsePanel: React.FC<any>;
};

MessagesArrayCollapse.displayName = 'MessagesArrayCollapse';
MessagesArrayCollapse.defaultProps = {
  defaultOpenPanelCount: 5,
};
