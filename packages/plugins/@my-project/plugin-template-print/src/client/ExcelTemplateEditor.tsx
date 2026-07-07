import React from 'react';
import { Button, Input, Select, Space, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { CollectionFieldPicker } from './CollectionFieldPicker';
import { useTranslation } from 'react-i18next';
import { NAMESPACE } from './locale';

interface ColumnConfig {
  key: string;
  label: string;
  fieldPath: string;
  isSequence: boolean;
  defaultValue: string;
}

interface Props {
  form: any;
}

export const ExcelTemplateEditor: React.FC<Props> = ({ form }) => {
  const { t } = useTranslation(NAMESPACE);
  const existingContent = form.getFieldValue('content');
  const collectionName = form.getFieldValue('collectionName');
  let initialColumns: ColumnConfig[] = [];
  try {
    if (existingContent) {
      const parsed = JSON.parse(existingContent);
      initialColumns = parsed.columns || [];
    }
  } catch {
    // ignore parse error
  }

  const [columns, setColumns] = React.useState<ColumnConfig[]>(() =>
    initialColumns.length > 0
      ? initialColumns
      : [{ key: '1', label: '', fieldPath: '', isSequence: false, defaultValue: '' }],
  );

  const handleSave = () => {
    const templateConfig = {
      sheetName: 'Sheet1',
      columns,
    };
    form.setFieldsValue({ content: JSON.stringify(templateConfig) });
    message.success('Template saved');
  };

  const addColumn = () => {
    setColumns([
      ...columns,
      { key: String(Date.now()), label: '', fieldPath: '', isSequence: false, defaultValue: '' },
    ]);
  };

  const removeColumn = (key: string) => {
    setColumns(columns.filter((c) => c.key !== key));
  };

  const updateColumn = (key: string, field: keyof ColumnConfig, value: any) => {
    setColumns(columns.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  };

  return (
    <div>
      <div style={{ marginBottom: 12, color: '#666', fontSize: 12 }}>
        {t('Define Excel columns. Each column maps to a data field. The header row is auto-generated from labels.')}
      </div>

      {columns.map((col, index) => (
        <Space key={col.key} style={{ display: 'flex', marginBottom: 8 }} align="start">
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
              { label: 'Field', value: 'field' },
              { label: 'Sequence #', value: 'sequence' },
            ]}
          />
          {!col.isSequence && (
            <>
              <Input
                style={{ width: 140 }}
                placeholder={t('Column header')}
                value={col.label}
                onChange={(e) => updateColumn(col.key, 'label', e.target.value)}
              />
              <Input
                style={{ width: 130 }}
                placeholder="data.field.path"
                value={col.fieldPath}
                onChange={(e) => updateColumn(col.key, 'fieldPath', e.target.value)}
              />
              <CollectionFieldPicker
                collectionName={collectionName}
                onInsert={(fieldPath) => updateColumn(col.key, 'fieldPath', fieldPath)}
                label={t('Field')}
              />
              <Input
                style={{ width: 100 }}
                placeholder={t('Default value')}
                value={col.defaultValue}
                onChange={(e) => updateColumn(col.key, 'defaultValue', e.target.value)}
              />
            </>
          )}
          {col.isSequence && <Input style={{ width: 140 }} value="# (auto)" disabled />}
          <Button icon={<DeleteOutlined />} onClick={() => removeColumn(col.key)} />
        </Space>
      ))}

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
