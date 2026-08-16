/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Cascader, Tag } from 'antd';
import { useCollectionManager_deprecated, useCompile } from '@nocobase/client';
import { useTranslation } from 'react-i18next';
import type { DefaultOptionType } from 'antd/es/cascader';
import { NAMESPACE } from './locale';
import { buildFieldOptionsTree, FieldOption } from './qrcode-utils';

/**
 * 选中字段的元数据（用于判断是否为需要弹窗配置的一对多字段）
 */
export interface InsertFieldMeta {
  isToMany?: boolean;
  target?: string;
}

/**
 * CollectionFieldPicker 组件的属性接口
 */
interface CollectionFieldPickerProps {
  /** 数据表名称，用于获取字段列表 */
  collectionName: string;
  /** 选中字段后的回调，接收点分隔的字段路径（如 "user.name"）与字段元数据 */
  onInsert: (fieldPath: string, meta?: InsertFieldMeta) => void;
  /** 可选的触发器按钮内容 */
  label?: React.ReactNode;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 数据表字段选择器组件。
 * 使用 Cascader 级联选择器展示字段树，支持关联字段展开，
 * 选中后以点分隔路径（如 "user.profile.name"）回调。
 */
export const CollectionFieldPicker: React.FC<CollectionFieldPickerProps> = ({
  collectionName,
  onInsert,
  label,
  disabled = false,
}) => {
  const { t } = useTranslation(NAMESPACE);
  const compile = useCompile();
  const { getCollectionFields } = useCollectionManager_deprecated();
  const [options, setOptions] = useState<DefaultOptionType[]>([]);

  // 当 collectionName 变化时，重建完整的字段选项树。
  // 注意：compile 来自 useCompile，每次渲染都是新函数引用，不能放进依赖数组，
  // 否则 effect 会在每次渲染后重跑并 setOptions(新数组)，触发无限渲染循环。
  useEffect(() => {
    if (!collectionName) {
      setOptions([]);
      return;
    }
    const opts = buildFieldOptionsTree(collectionName, getCollectionFields, compile);
    setOptions(opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, getCollectionFields]);

  // 处理字段选中事件，将选中路径拼接为点分隔的字段路径，并携带一对多元数据
  const handleChange = useCallback(
    (value: (string | number)[] | undefined, selectedOptions?: DefaultOptionType[]) => {
      if (!selectedOptions?.length) return;
      const fieldPath = selectedOptions.map((o) => o.value as string).join('.');
      const lastOption = selectedOptions[selectedOptions.length - 1] as FieldOption | undefined;
      onInsert(fieldPath, lastOption?.fieldMeta);
    },
    [onInsert],
  );

  return (
    <Cascader
      options={options}
      onChange={handleChange}
      disabled={disabled || !collectionName}
      placeholder={t('Select a field')}
      style={{ minWidth: 160 }}
      optionRender={(option) => (
        // 一对多字段在选项后标记「维表」，提示选中后会生成可编辑表格
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>{option.label}</span>
          {(option as FieldOption).fieldMeta?.isToMany && (
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>
              {t('To-many')}
            </Tag>
          )}
        </span>
      )}
    >
      {/* 自定义触发器，显示标签或默认的 {x} 占位符 */}
      <span
        style={{
          cursor: disabled || !collectionName ? 'not-allowed' : 'pointer',
          opacity: disabled || !collectionName ? 0.5 : 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          whiteSpace: 'nowrap',
        }}
      >
        {label || `{x}`}
      </span>
    </Cascader>
  );
};
