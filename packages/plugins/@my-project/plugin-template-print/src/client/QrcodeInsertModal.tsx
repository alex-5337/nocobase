/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Radio, Space, Cascader } from 'antd';
import { useCollectionManager, useCompile } from '@nocobase/client';
import { useTranslation } from 'react-i18next';
import { NAMESPACE } from './locale';
import { buildFieldOptionsTree } from './qrcode-utils';

/**
 * 二维码配置接口
 */
export interface QrcodeConfig {
  /** 值类型：'constant' 为固定值，'field' 为数据字段 */
  valueType: 'constant' | 'field';
  /** 固定值内容或字段路径 */
  value: string;
  /** 二维码宽度（像素） */
  width: number;
  /** 二维码高度（像素） */
  height: number;
}

/**
 * QrcodeInsertModal 组件的属性接口
 */
interface QrcodeInsertModalProps {
  /** 弹窗是否可见 */
  open: boolean;
  /** 关联的数据表名称 */
  collectionName: string;
  /** 初始配置（编辑已有二维码时传入） */
  initialConfig?: QrcodeConfig;
  /** 确认回调 */
  onOk: (config: QrcodeConfig) => void | Promise<void>;
  /** 取消回调 */
  onCancel: () => void;
}

/** 默认二维码配置 */
const DEFAULT_CONFIG: QrcodeConfig = {
  valueType: 'constant',
  value: '',
  width: 100,
  height: 100,
};

/**
 * 二维码插入/编辑弹窗组件。
 * 支持两种值类型：固定值（手动输入）和数据字段（从数据表字段中选择）。
 */
export const QrcodeInsertModal: React.FC<QrcodeInsertModalProps> = ({
  open,
  collectionName,
  initialConfig,
  onOk,
  onCancel,
}) => {
  const { t } = useTranslation(NAMESPACE);
  const compile = useCompile();
  const cm = useCollectionManager();
  const [form] = Form.useForm();

  // 封装获取字段列表的方法
  const getCollectionFields = useCallback((name: string) => cm?.getCollection(name)?.getFields() ?? [], [cm]);

  // 根据 collectionName 构建字段选项树
  const fieldOptions = useMemo(() => {
    if (!collectionName) return [];
    return buildFieldOptionsTree(collectionName, getCollectionFields, compile);
  }, [collectionName, getCollectionFields, compile]);

  // 值类型状态：固定值 或 数据字段
  const [valueType, setValueType] = useState<'constant' | 'field'>(initialConfig?.valueType || 'constant');
  // 选中的字段路径
  const [fieldPath, setFieldPath] = useState<string>(initialConfig?.valueType === 'field' ? initialConfig.value : '');

  // 确认按钮处理：校验表单并组装配置
  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const config: QrcodeConfig = {
        valueType,
        value: valueType === 'constant' ? values.constantValue : fieldPath,
        width: values.width || DEFAULT_CONFIG.width,
        height: values.height || DEFAULT_CONFIG.height,
      };
      await onOk(config);
      form.resetFields();
    } catch {
      // 表单校验失败，不做处理
    }
  };

  // 取消按钮处理
  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  // 弹窗打开时，根据 initialConfig 初始化表单字段值
  useEffect(() => {
    if (open) {
      if (initialConfig) {
        setValueType(initialConfig.valueType);
        setFieldPath(initialConfig.valueType === 'field' ? initialConfig.value : '');
        form.setFieldsValue({
          constantValue: initialConfig.valueType === 'constant' ? initialConfig.value : '',
          width: initialConfig.width,
          height: initialConfig.height,
        });
      } else {
        // 新建模式：使用默认配置
        setValueType(DEFAULT_CONFIG.valueType);
        setFieldPath('');
        form.setFieldsValue({
          constantValue: '',
          width: DEFAULT_CONFIG.width,
          height: DEFAULT_CONFIG.height,
        });
      }
    }
  }, [open, initialConfig, form]);

  return (
    <Modal title={t('Insert QR Code')} open={open} onOk={handleOk} onCancel={handleCancel} destroyOnClose width={480}>
      <Form form={form} layout="vertical">
        {/* 值类型选择：固定值 / 数据字段 */}
        <Form.Item label={t('Value Type')}>
          <Radio.Group value={valueType} onChange={(e) => setValueType(e.target.value)}>
            <Space direction="vertical">
              <Radio value="constant">{t('Constant Value')}</Radio>
              <Radio value="field">{t('Data Field')}</Radio>
            </Space>
          </Radio.Group>
        </Form.Item>

        {/* 根据值类型展示不同的输入控件 */}
        {valueType === 'constant' ? (
          <Form.Item
            name="constantValue"
            label={t('QR Code Content')}
            rules={[{ required: true, message: t('Please enter QR code content') }]}
          >
            <Input placeholder={t('Enter text or URL')} />
          </Form.Item>
        ) : (
          <Form.Item label={t('Select Field')} required>
            <Cascader
              options={fieldOptions}
              value={fieldPath ? fieldPath.split('.') : undefined}
              onChange={(_value, selectedOptions) => {
                if (selectedOptions?.length) {
                  const path = selectedOptions.map((o) => o.value as string).join('.');
                  setFieldPath(path);
                }
              }}
              placeholder={t('Select a field')}
              style={{ width: '100%' }}
              disabled={!collectionName}
            />
          </Form.Item>
        )}

        {/* 二维码尺寸设置 */}
        <Space>
          <Form.Item name="width" label={t('Width (px)')} rules={[{ required: true }]}>
            <InputNumber min={50} max={500} step={10} />
          </Form.Item>
          <Form.Item name="height" label={t('Height (px)')} rules={[{ required: true }]}>
            <InputNumber min={50} max={500} step={10} />
          </Form.Item>
        </Space>
      </Form>
    </Modal>
  );
};
