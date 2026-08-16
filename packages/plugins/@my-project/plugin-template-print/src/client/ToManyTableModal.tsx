/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Radio, Checkbox, Space, Alert } from 'antd';
import { useCollectionManager_deprecated, useCompile } from '@nocobase/client';
import { useTranslation } from 'react-i18next';
import { NAMESPACE } from './locale';

/**
 * 一对多可编辑表格的标记 class（与服务端 word-variables.ts 保持一致）。
 * quill-table-better 会保留 table 元素的 class，服务端据此识别并展开重复行/列。
 */
export const REPEAT_TABLE_CLASS = 'ql-print-repeat';
export const REPEAT_RIGHTWARD_CLASS = 'ql-print-repeat-rightward';

/** 浮动方向：向下（每条记录一行）或向右（每条记录一列） */
export type RepeatDirection = 'downward' | 'rightward';

/** 一对多表格配置 */
export interface ToManyTableConfig {
  /** 一对多字段路径（如 items） */
  fieldPath: string;
  /** 浮动方向 */
  direction: RepeatDirection;
  /** 展示的字段（名称 + 标题） */
  fields: { name: string; title: string }[];
}

interface ToManyTableModalProps {
  /** 弹窗是否可见 */
  open: boolean;
  /** 一对多字段路径 */
  fieldPath: string;
  /** 关联目标数据表名称 */
  targetCollection: string;
  /** 确认回调 */
  onOk: (config: ToManyTableConfig) => void;
  /** 取消回调 */
  onCancel: () => void;
}

/** 关联字段类型（避免表格列嵌套对象） */
const ASSOCIATION_TYPES = new Set(['belongsTo', 'hasOne', 'hasMany', 'belongsToMany', 'belongsToArray']);

/** 系统/元数据字段：默认不展示在表格中 */
const TABLE_EXCLUDED_FIELD_NAMES = new Set([
  'id',
  'sort',
  'createdAt',
  'updatedAt',
  'createdById',
  'updatedById',
  'createdBy',
  'updatedBy',
]);

/** HTML 转义（用于标题与单元格值） */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 模拟表头单元格的标记 class（编辑器内可统一调整外观；
 * 注意 Word 打印不识别 CSS 类，外观由 REPEAT_HEADER_CELL_STYLE 内联样式兜底）。
 */
export const REPEAT_HEADER_CELL_CLASS = 'ql-print-repeat-header-cell';

/** 模拟表头单元格的内联样式（Word 只认内联样式，必须随 td 持久化） */
export const REPEAT_HEADER_CELL_STYLE = 'background-color: #f0f0f0; text-align: center;';

/**
 * 生成模拟表头单元格（class + 内联样式 + 加粗内容）。
 * 多个需要模拟表头的列可复用该函数，保持外观一致。
 */
function repeatHeaderCell(content: string): string {
  return `<td class="${REPEAT_HEADER_CELL_CLASS}" style="${REPEAT_HEADER_CELL_STYLE}"><p><strong>${content}</strong></p></td>`;
}

/**
 * 生成一对多可编辑表格的默认 HTML。
 * - downward：表头行（字段标题）+ 数据行（{items.xxx} 变量），打印时每条记录重复一行；
 * - rightward：每字段一行（td 加粗字段标题 + {items.xxx} 变量），无表头行；
 *   第一列 td 模拟表头样式（灰底 + 居中加粗），打印时服务端将数据单元格按记录横向扩展为一列/记录。
 * 表格带 REPEAT_TABLE_CLASS 标记，且带默认边框样式（服务端会为 Word 补全边框）。
 */
export function buildRepeatTableHtml(config: ToManyTableConfig): string {
  const { fieldPath, direction, fields } = config;
  const cell = (tag: 'th' | 'td', content: string) => `<${tag}><p>${content}</p></${tag}>`;
  const dataCell = (fieldName: string) => cell('td', `{${fieldPath}.${fieldName}}`);
  const tableAttrs =
    direction === 'rightward'
      ? `class="${REPEAT_TABLE_CLASS} ${REPEAT_RIGHTWARD_CLASS}" style="border-collapse: collapse; width: 100%;"`
      : `class="${REPEAT_TABLE_CLASS}" style="border-collapse: collapse; width: 100%;"`;

  if (direction === 'rightward') {
    // 每字段一行：td 加粗字段标题 + {items.xxx} 数据占位，无表头行。
    // 数据行全用 td（首列加粗）：quill-table-better 会把同一行中混用的 th 与 td
    // 拆分成两个独立行（th 进 thead、td 进 tbody），导致表格结构错乱，因此表头列用 td 加粗实现。
    // 第一列（字段标题）通过 repeatHeaderCell 模拟表头 UI：灰底 + 居中加粗（class + 内联样式）。
    const rows = fields
      .map((field) => `<tr>${repeatHeaderCell(escapeHtml(field.title))}${dataCell(field.name)}</tr>`)
      .join('');
    return `<table ${tableAttrs}><tbody>${rows}</tbody></table>`;
  }

  const headerRow = `<tr>${fields.map((field) => cell('th', escapeHtml(field.title))).join('')}</tr>`;
  const dataRow = `<tr>${fields.map((field) => dataCell(field.name)).join('')}</tr>`;
  return `<table ${tableAttrs}><thead>${headerRow}</thead><tbody>${dataRow}</tbody></table>`;
}

/**
 * 一对多表格插入弹窗。
 * 用户选择要展示的字段与浮动方向（向下/向右），
 * 确认后生成带标记的默认表格 HTML 插入模板编辑器，之后可直接在编辑器中调整表格。
 */
export const ToManyTableModal: React.FC<ToManyTableModalProps> = ({
  open,
  fieldPath,
  targetCollection,
  onOk,
  onCancel,
}) => {
  const { t } = useTranslation(NAMESPACE);
  const compile = useCompile();
  const { getCollectionFields } = useCollectionManager_deprecated();

  // 目标数据表中可展示的字段（口径与服务端 buildTableColumns 一致）
  const displayFields = useMemo(() => {
    const fields = getCollectionFields(targetCollection);
    if (!fields?.length) return [];
    return fields
      .filter(
        (field: any) =>
          field.interface &&
          !field.hidden &&
          !ASSOCIATION_TYPES.has(field.type) &&
          !TABLE_EXCLUDED_FIELD_NAMES.has(field.name),
      )
      .sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0))
      .map((field: any) => ({ name: field.name, title: compile(field.uiSchema?.title || field.name) }));
  }, [targetCollection, getCollectionFields, compile]);

  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [direction, setDirection] = useState<RepeatDirection>('downward');

  // 弹窗打开时重置为默认选择（全部字段 + 向下浮动）。
  // 注意：displayFields 的 useMemo 依赖 useCompile 的返回值，而 useCompile 每次渲染
  // 都会返回新函数，导致 displayFields 每次渲染都是新数组。若把 displayFields 放进
  // 依赖数组，弹窗打开后每次渲染都会重置用户选择（选项无法调整），甚至触发无限渲染循环。
  // 因此这里只依赖 open，仅在弹窗从关闭变为打开时执行一次重置。
  useEffect(() => {
    if (open) {
      setSelectedNames(displayFields.map((f) => f.name));
      setDirection('downward');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleOk = () => {
    const fields = displayFields.filter((f) => selectedNames.includes(f.name));
    if (fields.length === 0) return;
    onOk({ fieldPath, direction, fields });
  };

  return (
    <Modal title={t('Insert To-Many Table')} open={open} onOk={handleOk} onCancel={onCancel} destroyOnClose width={480}>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Alert type="info" showIcon message={t('To-Many Table Tip')} />
        <div>
          <div style={{ marginBottom: 8 }}>{t('Display Fields')}</div>
          {displayFields.length > 0 ? (
            <Checkbox.Group
              value={selectedNames}
              onChange={(values) => setSelectedNames(values as string[])}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
            >
              {displayFields.map((field) => (
                <Checkbox key={field.name} value={field.name}>
                  {field.title}
                </Checkbox>
              ))}
            </Checkbox.Group>
          ) : (
            <span style={{ color: '#999' }}>{t('No fields to display')}</span>
          )}
        </div>
        <div>
          <div style={{ marginBottom: 8 }}>{t('Float Direction')}</div>
          <Radio.Group value={direction} onChange={(e) => setDirection(e.target.value)}>
            <Space direction="vertical">
              <Radio value="downward">{t('Float Downward')}</Radio>
              <Radio value="rightward">{t('Float Rightward')}</Radio>
            </Space>
          </Radio.Group>
        </div>
      </Space>
    </Modal>
  );
};
