import React, { useCallback, useEffect, useState } from 'react';
import { Cascader } from 'antd';
import { useCollectionManager, useCompile } from '@nocobase/client';
import { useTranslation } from 'react-i18next';
import type { DefaultOptionType } from 'antd/es/cascader';
import { NAMESPACE } from './locale';

interface CollectionFieldPickerProps {
  /** The collection name to get fields from */
  collectionName: string;
  /** Called when a field is selected, receives dot-separated field path */
  onInsert: (fieldPath: string) => void;
  /** Optional button label */
  label?: string;
  disabled?: boolean;
}

const ASSOCIATION_TYPES = new Set(['belongsTo', 'hasOne', 'hasMany', 'belongsToMany', 'belongsToArray']);
const MAX_DEPTH = 4;

/**
 * Recursively builds field option tree.
 * getCollectionFields is synchronous (reads from in-memory cache), so eager
 * recursive building is safe and avoids Cascader loadData flicker issues.
 */
function buildFieldOptionsTree(
  collectionName: string,
  getCollectionFields: (name: string) => any[],
  compile: (val: any) => string,
  depth = 0,
): DefaultOptionType[] {
  if (depth >= MAX_DEPTH || !collectionName) return [];

  const fields = getCollectionFields(collectionName);
  if (!fields?.length) return [];

  return fields
    .filter((field) => field.interface && !field.hidden)
    .map((field) => {
      const isAssociation = ASSOCIATION_TYPES.has(field.type);
      const option: DefaultOptionType = {
        value: field.name,
        label: compile(field.uiSchema?.title || field.name),
        isLeaf: !isAssociation,
      };
      if (isAssociation && field.target) {
        const children = buildFieldOptionsTree(field.target, getCollectionFields, compile, depth + 1);
        if (children.length > 0) {
          option.children = children;
        }
      }
      return option;
    });
}

export const CollectionFieldPicker: React.FC<CollectionFieldPickerProps> = ({
  collectionName,
  onInsert,
  label,
  disabled = false,
}) => {
  const { t } = useTranslation(NAMESPACE);
  const compile = useCompile();
  const cm = useCollectionManager();
  const [options, setOptions] = useState<DefaultOptionType[]>([]);

  const getCollectionFields = useCallback((name: string) => cm?.getCollection(name)?.getFields() ?? [], [cm]);

  // Rebuild the full option tree whenever collectionName changes
  useEffect(() => {
    if (!collectionName) {
      setOptions([]);
      return;
    }
    const opts = buildFieldOptionsTree(collectionName, getCollectionFields, compile);
    setOptions(opts);
  }, [collectionName, getCollectionFields, compile]);

  const handleChange = useCallback(
    (_value: any[], selectedOptions?: DefaultOptionType[]) => {
      if (!selectedOptions?.length) return;
      const fieldPath = selectedOptions.map((o) => o.value as string).join('.');
      onInsert(fieldPath);
    },
    [onInsert],
  );

  return (
    <Cascader
      options={options}
      onChange={handleChange as any}
      disabled={disabled || !collectionName}
      placeholder={t('Select a field')}
      style={{ minWidth: 160 }}
    >
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
