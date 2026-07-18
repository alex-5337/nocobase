/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useMemo } from 'react';
import { Button, Input, Select, Space, Form, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { CollectionFieldPicker } from './CollectionFieldPicker';
import { useTranslation } from 'react-i18next';
import { NAMESPACE } from './locale';

/**
 * Excel 列配置接口
 */
interface ColumnConfig {
  /** 唯一标识 */
  key: string;
  /** 列标题（表头显示名称） */
  label: string;
  /** 数据字段路径（如 "user.name"） */
  fieldPath: string;
  /** 是否为序号列 */
  isSequence: boolean;
  /** 默认值（数据为空时使用） */
  defaultValue: string;
}

interface Props {
  /** Ant Design Form 实例 */
  form: any;
}

/**
 * Excel 模板编辑器组件。
 * 以可视化的方式定义 Excel 列，每列可以映射到一个数据字段或设置为序号列。
 * 表头行由列标签自动生成，数据行使用字段路径从记录中取值。
 */
export const ExcelTemplateEditor: React.FC<Props> = ({ form }) => {
  const { t } = useTranslation(NAMESPACE);

  // 通过 Form.useWatch 监听 collectionName 以响应式更新字段选择器
  const collectionName = Form.useWatch('collectionName', form);

  // 从表单字段值解析已存储的模板内容（JSON 格式的列配置）
  const existingContent = form.getFieldValue('content');

  // 使用 useMemo 缓存初始列配置解析结果
  const initialColumns: ColumnConfig[] = useMemo(() => {
    try {
      if (existingContent) {
        const parsed = JSON.parse(existingContent);
        return parsed.columns || [];
      }
    } catch {
      // JSON 解析失败时忽略
    }
    return [];
  }, [existingContent]);

  // 列配置状态，默认至少包含一列
  const [columns, setColumns] = React.useState<ColumnConfig[]>(() =>
    initialColumns.length > 0
      ? initialColumns
      : [{ key: '1', label: '', fieldPath: '', isSequence: false, defaultValue: '' }],
  );

  /**
   * 保存模板：将列配置序列化为 JSON 字符串存入表单的 content 字段
   */
  const handleSave = () => {
    const templateConfig = {
      sheetName: 'Sheet1',
      columns,
    };
    form.setFieldsValue({ content: JSON.stringify(templateConfig) });
    message.success(t('Save Template'));
  };

  /** 添加新列 */
  const addColumn = () => {
    setColumns([
      ...columns,
      { key: String(Date.now()), label: '', fieldPath: '', isSequence: false, defaultValue: '' },
    ]);
  };

  /** 删除指定列 */
  const removeColumn = (key: string) => {
    setColumns(columns.filter((c) => c.key !== key));
  };

  /** 更新列的指定字段 */
  const updateColumn = (key: string, field: keyof ColumnConfig, value: any) => {
    setColumns(columns.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  };

  return (
    <div>
      {/* 使用说明 */}
      <div style={{ marginBottom: 12, color: '#666', fontSize: 12 }}>
        {t('Define Excel columns. Each column maps to a data field. The header row is auto-generated from labels.')}
      </div>

      {/* 列配置列表 */}
      {columns.map((col, index) => (
        <Space key={col.key} style={{ display: 'flex', marginBottom: 8 }} align="start">
          {/* 列类型选择：数据字段 或 序号 */}
          <Select
            style={{ width: 120 }}
            value={col.isSequence ? 'sequence' : 'field'}
            onChange={(val) => {
              if (val === 'sequence') {
                updateColumn(col.key, 'isSequence', true);
                updateColumn(col.key, 'fieldPath', '');
              } else {
                updateColumn(col.key, 'isSequence', false);
              }
            }}
            options={[
              { label: t('Field'), value: 'field' },
              { label: t('Sequence #'), value: 'sequence' },
            ]}
          />

          {/* 非序号列：显示字段配置控件 */}
          {!col.isSequence && (
            <>
              {/* 列标题 */}
              <Input
                style={{ width: 140 }}
                placeholder={t('Column header')}
                value={col.label}
                onChange={(e) => updateColumn(col.key, 'label', e.target.value)}
              />
              {/* 字段路径（手动输入） */}
              <Input
                style={{ width: 130 }}
                placeholder="data.field.path"
                value={col.fieldPath}
                onChange={(e) => updateColumn(col.key, 'fieldPath', e.target.value)}
              />
              {/* 字段路径（可视化选择） */}
              <CollectionFieldPicker
                collectionName={collectionName}
                onInsert={(fieldPath) => updateColumn(col.key, 'fieldPath', fieldPath)}
                label={t('Field')}
              />
              {/* 默认值 */}
              <Input
                style={{ width: 100 }}
                placeholder={t('Default value')}
                value={col.defaultValue}
                onChange={(e) => updateColumn(col.key, 'defaultValue', e.target.value)}
              />
            </>
          )}

          {/* 序号列：显示只读的 "# (auto)" */}
          {col.isSequence && <Input style={{ width: 140 }} value="# (auto)" disabled />}

          {/* 删除按钮 */}
          <Button icon={<DeleteOutlined />} onClick={() => removeColumn(col.key)} />
        </Space>
      ))}

      {/* 底部操作按钮 */}
      <div style={{ marginTop: 12 }}>
        <Space>
          <Button icon={<PlusOutlined />} onClick={addColumn}>
            {t('Add Column')}
          </Button>
          <Button type="primary" onClick={handleSave}>
            {t('Save Template')}
          </Button>
        </Space>
      </div>
    </div>
  );
};
