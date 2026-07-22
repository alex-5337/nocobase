/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, message, Popconfirm, Space, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAPIClient, useDataSourceManager, useCompile } from '@nocobase/client';
import { useTranslation } from 'react-i18next';
import { NAMESPACE } from './locale';
import { WordTemplateEditor, WordTemplateEditorHandle } from './WordTemplateEditor';
import { ExcelTemplateEditor } from './ExcelTemplateEditor';

/** twips ↔ mm 转换：1 英寸 = 25.4 mm = 1440 twips */
const TWIPS_PER_MM = 1440 / 25.4;

/**
 * 以 mm 显示、以 twips 存储的边距输入组件。
 * 用户看到的是直观的毫米值，表单存储的是内部 twips 值。
 */
const MarginInput: React.FC<{
  value?: number;
  onChange?: (value: number | null) => void;
  direction: string;
}> = ({ value, onChange, direction }) => {
  const mmValue = value != null ? Math.round(value / TWIPS_PER_MM) : undefined;
  return (
    <InputNumber
      min={0}
      step={1}
      style={{ width: 78 }}
      addonBefore={direction}
      value={mmValue}
      onChange={(v) => {
        onChange?.(v != null ? Math.round(v * TWIPS_PER_MM) : null);
      }}
    />
  );
};

/**
 * 模板数据接口
 */
interface Template {
  id: number;
  name: string;
  type: string;
  collectionName: string;
  enabled: boolean;
  content: string;
  variables: any[];
  pageSettings?: {
    paperSize?: string;
    orientation?: string;
    customWidth?: number;
    customHeight?: number;
    margins?: { top?: number; bottom?: number; left?: number; right?: number };
  };
  description: string;
  createdAt: string;
}

/**
 * 模板管理列表页组件。
 * 功能包括：
 * - 模板列表的增删改查
 * - Word/Excel 模板编辑器集成
 * - 数据源和数据表信息展示
 */
export const TemplateListPage: React.FC = () => {
  const { t } = useTranslation(NAMESPACE);
  const [data, setData] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [form] = Form.useForm();
  const apiClient = useAPIClient();
  const dm = useDataSourceManager();
  const compile = useCompile();
  const wordEditorRef = useRef<WordTemplateEditorHandle>(null);

  // 通过 API 获取数据表列表
  const [collections, setCollections] = useState<any[]>([]);
  const fetchCollections = useCallback(async () => {
    try {
      // appends=category 带出数据表的分类信息，用于分组展示
      const res = await apiClient.request({
        url: 'collections:list',
        params: { appends: ['category'], paginate: false },
      });
      setCollections(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch collections', err);
    }
  }, [apiClient]);

  // 组件挂载时加载数据表列表
  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  // 构建按分类分组的数据表选项
  // collections 通过 API 的 appends=category 带出分类信息，
  // category 是 belongsToMany 关联，格式为 [{ id, name, color }]
  const groupedCollectionOptions = useMemo(() => {
    const groups: Record<string, { category: string; children: { label: string; value: string }[] }> = {};
    collections.forEach((c: any) => {
      const catName = c.category?.[0]?.name || t('Others');
      if (!groups[catName]) {
        groups[catName] = { category: catName, children: [] };
      }
      groups[catName].children.push({
        label: `${c?.title || c.name} (${c.name})`,
        value: c.name,
      });
    });
    return Object.values(groups);
  }, [collections, t]);

  // 分类筛选状态（空字符串 = 全部）
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // 分类下拉选项
  const categoryOptions = useMemo(() => {
    return [
      { label: t('All'), value: '' },
      ...groupedCollectionOptions.map((g) => ({
        label: g.category,
        value: g.category,
      })),
    ];
  }, [groupedCollectionOptions, t]);

  // 根据选中分类筛选后的数据表选项（扁平列表，不再用 OptGroup）
  const filteredCollectionOptions = useMemo(() => {
    if (!selectedCategory) {
      return groupedCollectionOptions.flatMap((g) => g.children);
    }
    return groupedCollectionOptions.find((g) => g.category === selectedCategory)?.children || [];
  }, [groupedCollectionOptions, selectedCategory]);

  // 分类变化时，如果当前选中的数据表不属于新分类，则清空
  const handleCategoryChange = useCallback(
    (cat: string) => {
      setSelectedCategory(cat);
      const colName = form.getFieldValue('collectionName');
      if (colName) {
        const isInCategory = groupedCollectionOptions
          .filter((g) => !cat || g.category === cat)
          .some((g) => g.children.some((c) => c.value === colName));
        if (!isInCategory) {
          form.setFieldValue('collectionName', undefined);
        }
      }
    },
    [form, groupedCollectionOptions],
  );

  // 构建 dataSourceName -> displayName 的映射，用于数据源列展示
  const dataSourceDisplayMap = useMemo(() => {
    const map: Record<string, string> = {};
    collections.forEach((c: any) => {
      const dsKey = c.dataSource || c.options?.dataSource || 'main';
      if (!map[dsKey]) {
        const ds = dm?.getDataSource(dsKey);
        map[dsKey] = compile(ds?.displayName || dsKey);
      }
    });
    return map;
  }, [collections, dm, compile]);

  // 构建 collectionName -> dataSourceKey 的映射，用于数据源列的快速查找
  const collectionDataSourceMap = useMemo(() => {
    const map: Record<string, string> = {};
    collections.forEach((c: any) => {
      map[c.name] = c.dataSource || c.options?.dataSource || 'main';
    });
    return map;
  }, [collections]);

  // 构建 collectionName -> title 的映射
  const collectionTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    collections.forEach((c: any) => {
      map[c.name] = c.title || c.options?.title || c.name;
    });
    return map;
  }, [collections]);

  /** 加载模板列表 */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.request({ url: 'printTemplates:list' });
      setData(res.data?.data || []);
    } catch {
      message.error(t('Failed to load templates'));
    } finally {
      setLoading(false);
    }
  }, [apiClient, t]);

  // 组件挂载时加载数据
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** 打开新建模板弹窗 */
  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    form.setFieldsValue({
      enabled: true,
      type: 'word',
      pageSettings: {
        paperSize: 'A4',
        orientation: 'portrait',
        margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
      },
    });
    setModalVisible(true);
  };

  /** 打开编辑模板弹窗 */
  const handleEdit = (record: Template) => {
    setEditingTemplate(record);
    form.setFieldsValue({
      ...record,
      pageSettings: {
        ...record.pageSettings,
        margins: {
          top: 1440,
          bottom: 1440,
          left: 1440,
          right: 1440,
          ...(record.pageSettings?.margins || {}),
        },
      },
    });
    setModalVisible(true);
  };

  /** 删除模板 */
  const handleDelete = async (id: number) => {
    try {
      await apiClient.request({ url: `printTemplates:destroy/${id}`, method: 'post' });
      message.success(t('Deleted'));
      fetchData();
    } catch {
      message.error(t('Failed to delete'));
    }
  };

  /** 保存模板（新增或更新） */
  const doSave = useCallback(
    async (keepOpen?: boolean) => {
      try {
        const values = await form.validateFields();
        // Word 模板：确保从编辑器 DOM 直接读取内容，避免 Quill 的 getSemanticHTML() 丢失自定义 blot HTML
        if (values.type === 'word') {
          values.content = wordEditorRef.current?.getHTML() || values.content || '';
        }
        if (!values.content) {
          message.warning(t('Please edit template content'));
          return;
        }

        if (editingTemplate) {
          await apiClient.request({
            url: `printTemplates:update/${editingTemplate.id}`,
            method: 'post',
            data: values,
          });
          message.success(t('Updated'));
        } else {
          const res = await apiClient.request({
            url: 'printTemplates:create',
            method: 'post',
            data: values,
          });
          message.success(t('Created'));
          if (keepOpen) {
            // 首次暂存后绑定主键，后续点击不再重复创建
            const created = res?.data?.data;
            if (created?.id) {
              setEditingTemplate(created);
            }
          }
        }
        if (!keepOpen) {
          setModalVisible(false);
        }
        fetchData();
      } catch (err: any) {
        const action = keepOpen ? t('Save Draft') : t('Save');
        // 尝试多种错误格式：Ant Design 表单校验 / Axios API / 标准 Error
        const detail =
          err.errorFields?.[0]?.errors?.[0] ||
          err.response?.data?.errors?.[0]?.message ||
          err.message ||
          t('Unknown error');
        message.error(`${action}${t('failed')}: ${detail}`);
      }
    },
    [form, editingTemplate, apiClient, t, wordEditorRef, fetchData],
  );

  const handleSave = useCallback(() => doSave(false), [doSave]);
  const handleDraftSave = useCallback(() => doSave(true), [doSave]);

  // 表格列定义
  const columns = [
    { title: t('Name'), dataIndex: 'name', key: 'name' },
    {
      title: t('Type'),
      dataIndex: 'type',
      key: 'type',
      render: (v: string) => (v === 'word' ? t('Word') : t('Excel')),
    },
    {
      title: t('Data source'),
      dataIndex: 'collectionName',
      key: 'dataSource',
      render: (collectionName: string) => {
        const dsKey = collectionDataSourceMap[collectionName] || 'main';
        return dataSourceDisplayMap[dsKey] || dsKey;
      },
    },
    {
      title: t('Collection title'),
      dataIndex: 'collectionName',
      key: 'collectionTitle',
      render: (collectionName: string) => collectionTitleMap[collectionName] || collectionName,
    },
    {
      title: t('Collection name'),
      dataIndex: 'collectionName',
      key: 'collectionName',
    },
    {
      title: t('Enabled'),
      dataIndex: 'enabled',
      key: 'enabled',
      render: (v: boolean) => (v ? t('Yes') : t('No')),
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: any, record: Template) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)} />
          <Popconfirm title={t('Delete?')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 监听模板类型切换，用于条件渲染 Word/Excel 编辑器
  const templateType = Form.useWatch('type', form);
  // 监听页面设置变化，传递给编辑器更新纸张引导框
  const pageSettings = Form.useWatch('pageSettings', form);
  const paperSizeValue = pageSettings?.paperSize;

  // 切换为 Custom 时，自动填充默认宽高值（mm）
  useEffect(() => {
    if (paperSizeValue === 'Custom') {
      const currentPS = form.getFieldValue('pageSettings') || {};
      if (!currentPS.customWidth && !currentPS.customHeight) {
        form.setFieldsValue({
          pageSettings: {
            ...currentPS,
            customWidth: 210,
            customHeight: 297,
          },
        });
      }
    }
  }, [paperSizeValue, form]);

  return (
    <div style={{ padding: 24 }}>
      {/* 页面标题 + 新建按钮 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>{t('Templates')}</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          {t('New Template')}
        </Button>
      </div>

      {/* 模板列表表格 */}
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} />

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editingTemplate ? t('Edit Template') : t('New Template')}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        width={1200}
        destroyOnClose
        footer={(_, { OkBtn, CancelBtn }) => (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={handleDraftSave}>{t('Save Draft')}</Button>
            <Space>
              <CancelBtn />
              <OkBtn />
            </Space>
          </div>
        )}
      >
        <Form form={form} layout="vertical">
          <Tabs
            items={[
              {
                key: 'basic',
                label: t('Basic Info'),
                children: (
                  <>
                    {/* 模板名称 */}
                    <Form.Item name="name" label={t('Name')} rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>

                    {/* 模板类型 */}
                    <Form.Item name="type" label={t('Type')} rules={[{ required: true }]}>
                      <Select
                        options={[
                          { label: t('Word'), value: 'word' },
                          { label: t('Excel'), value: 'excel' },
                        ]}
                      />
                    </Form.Item>

                    {/* 分类 + 关联数据表（一行排列） */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                      <Form.Item label={t('Category')} style={{ flex: '0 0 200px' }}>
                        <Select
                          allowClear
                          placeholder={t('All')}
                          value={selectedCategory}
                          onChange={handleCategoryChange}
                          options={categoryOptions}
                        />
                      </Form.Item>
                      <Form.Item
                        name="collectionName"
                        label={t('Collection')}
                        rules={[{ required: true }]}
                        style={{ flex: 1 }}
                      >
                        <Select
                          showSearch
                          placeholder={t('Select a collection')}
                          filterOption={(input, option) =>
                            (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                          }
                          options={filteredCollectionOptions}
                        />
                      </Form.Item>
                    </div>

                    {/* 描述 */}
                    <Form.Item name="description" label={t('Description')}>
                      <Input.TextArea rows={2} />
                    </Form.Item>

                    {/* 页面设置（仅 Word 模板） */}
                    {templateType === 'word' && (
                      <>
                        <Form.Item label={t('Page Settings')}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            {/* 纸张大小 */}
                            <span
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                            >
                              <span style={{ fontSize: 13, color: '#666' }}>{t('Paper')}</span>
                              <Form.Item name={['pageSettings', 'paperSize']} style={{ marginBottom: 0 }}>
                                <Select
                                  style={{ width: 100 }}
                                  options={[
                                    { label: 'A4', value: 'A4' },
                                    { label: 'A3', value: 'A3' },
                                    { label: 'Letter', value: 'Letter' },
                                    { label: 'Legal', value: 'Legal' },
                                    { label: 'A5', value: 'A5' },
                                    { label: 'B5', value: 'B5' },
                                    { label: t('Custom'), value: 'Custom' },
                                  ]}
                                />
                              </Form.Item>
                            </span>
                            {/* 方向 */}
                            <span
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                            >
                              <span style={{ fontSize: 13, color: '#666' }}>{t('Orientation')}</span>
                              <Form.Item name={['pageSettings', 'orientation']} style={{ marginBottom: 0 }}>
                                <Select
                                  style={{ width: 90 }}
                                  options={[
                                    { label: t('Portrait'), value: 'portrait' },
                                    { label: t('Landscape'), value: 'landscape' },
                                  ]}
                                />
                              </Form.Item>
                            </span>
                            {/* 自定义纸张尺寸 */}
                            {paperSizeValue === 'Custom' && (
                              <span
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                              >
                                <Form.Item name={['pageSettings', 'customWidth']} style={{ marginBottom: 0 }}>
                                  <InputNumber
                                    min={1}
                                    max={2000}
                                    step={1}
                                    style={{ width: 100 }}
                                    addonAfter={t('mm')}
                                    placeholder="210"
                                  />
                                </Form.Item>
                                <span style={{ fontSize: 13, color: '#666' }}>×</span>
                                <Form.Item name={['pageSettings', 'customHeight']} style={{ marginBottom: 0 }}>
                                  <InputNumber
                                    min={1}
                                    max={2000}
                                    step={1}
                                    style={{ width: 100 }}
                                    addonAfter={t('mm')}
                                    placeholder="297"
                                  />
                                </Form.Item>
                              </span>
                            )}
                            {/* 边距 */}
                            <span
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}
                            >
                              <span style={{ fontSize: 13, color: '#666', marginRight: 2 }}>{t('Margins')}</span>
                              <Form.Item name={['pageSettings', 'margins', 'top']} style={{ marginBottom: 0 }}>
                                <MarginInput direction="↑" />
                              </Form.Item>
                              <Form.Item name={['pageSettings', 'margins', 'bottom']} style={{ marginBottom: 0 }}>
                                <MarginInput direction="↓" />
                              </Form.Item>
                              <Form.Item name={['pageSettings', 'margins', 'left']} style={{ marginBottom: 0 }}>
                                <MarginInput direction="←" />
                              </Form.Item>
                              <Form.Item name={['pageSettings', 'margins', 'right']} style={{ marginBottom: 0 }}>
                                <MarginInput direction="→" />
                              </Form.Item>
                              <span style={{ fontSize: 12, color: '#999' }}>mm</span>
                            </span>
                          </div>
                        </Form.Item>
                      </>
                    )}

                    {/* 启用开关 */}
                    <Form.Item name="enabled" label={t('Enabled')} valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'content',
                label: t('Template Content'),
                children: (
                  <Form.Item label={t('Edit Template')}>
                    {templateType === 'word' ? (
                      <WordTemplateEditor ref={wordEditorRef} form={form} pageSettings={pageSettings} />
                    ) : (
                      <ExcelTemplateEditor form={form} />
                    )}
                  </Form.Item>
                ),
              },
            ]}
          />

          {/* 隐藏字段：模板内容（由编辑器组件内部管理） */}
          <Form.Item name="content" label={t('Template Content')} style={{ display: 'none' }}>
            <Input />
          </Form.Item>

          {/* 隐藏字段：变量列表 */}
          <Form.Item name="variables" label={t('Variables')} style={{ display: 'none' }}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
