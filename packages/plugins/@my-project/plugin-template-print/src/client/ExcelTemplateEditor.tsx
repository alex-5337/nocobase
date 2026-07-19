/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Button, Select, Input, Tooltip, Tag, Divider, Switch, Form, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowDownOutlined,
  ArrowRightOutlined,
  MinusOutlined,
  ColumnHeightOutlined,
} from '@ant-design/icons';
import { CollectionFieldPicker } from './CollectionFieldPicker';
import { useTranslation } from 'react-i18next';
import { NAMESPACE } from './locale';

// ============================================================
// 类型定义
// ============================================================

/** 单个单元格数据 */
interface SpreadsheetCell {
  text: string;
  fieldPath: string;
  floatDirection: 'none' | 'downward' | 'rightward';
  defaultValue: string;
  isSequence: boolean;
  bold: boolean;
}

/** 完整的表格模板数据 */
interface SpreadsheetData {
  version: number;
  sheetName: string;
  colCount: number;
  rowCount: number;
  cells: Record<string, SpreadsheetCell>;
}

interface Props {
  form: any;
}

// ============================================================
// 常量
// ============================================================

const COL_MIN = 1;
const ROW_MIN = 1;
const COL_DEFAULT = 6;
const ROW_DEFAULT = 8;

const emptyCell = (): SpreadsheetCell => ({
  text: '',
  fieldPath: '',
  floatDirection: 'none',
  defaultValue: '',
  isSequence: false,
  bold: false,
});

/** Excel 风格列标签: A, B, C, ..., Z, AA, AB, ... */
const toColLabel = (i: number): string => {
  let label = '';
  let n = i;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
};

/** 单元格 key: "R{row}C{col}" */
const cellKey = (r: number, c: number) => `R${r}C${c}`;

/** 浮动方向元数据 */
const FLOAT_META = {
  none: { icon: <span style={{ fontSize: 11, color: '#999' }}>—</span>, color: '#999', label: 'No Float', short: '—' },
  downward: {
    icon: <ArrowDownOutlined style={{ fontSize: 11, color: '#1677ff' }} />,
    color: '#1677ff',
    label: 'Float Downward',
    short: '↓',
  },
  rightward: {
    icon: <ArrowRightOutlined style={{ fontSize: 11, color: '#52c41a' }} />,
    color: '#52c41a',
    label: 'Float Rightward',
    short: '→',
  },
};

// ============================================================
// 组件
// ============================================================

export const ExcelTemplateEditor: React.FC<Props> = ({ form }) => {
  const { t } = useTranslation(NAMESPACE);

  // 监听表单中的 collectionName（hook 必须放在顶层）
  const collectionName = Form.useWatch('collectionName', form);

  // 从表单 content 字段解析已有数据
  const parseSavedContent = useCallback((): SpreadsheetData | null => {
    const raw = form.getFieldValue('content');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      // 新版格式（v2）：有 cells 和 version 字段
      if (parsed.version === 2 && parsed.cells) return parsed;
      // 旧版格式（v1 columns 数组）—— 自动转换
      if (parsed.columns && Array.isArray(parsed.columns)) {
        const cols = parsed.columns.length || COL_DEFAULT;
        const rows = 2; // 表头 + 数据样本
        const cells: Record<string, SpreadsheetCell> = {};
        parsed.columns.forEach((col: any, idx: number) => {
          cells[cellKey(0, idx)] = {
            text: col.label || '',
            fieldPath: col.fieldPath || '',
            floatDirection: col.floatDirection || 'none',
            defaultValue: col.defaultValue || '',
            isSequence: col.isSequence || false,
            bold: true,
          };
          cells[cellKey(1, idx)] = {
            text: col.defaultValue || '...',
            fieldPath: '',
            floatDirection: 'none',
            defaultValue: '',
            isSequence: false,
            bold: false,
          };
        });
        return { version: 2, sheetName: 'Sheet1', colCount: cols, rowCount: rows, cells };
      }
    } catch {
      /* 忽略解析错误 */
    }
    return null;
  }, [form]);

  // ===== 状态 =====
  const savedData = useMemo(() => parseSavedContent(), [parseSavedContent]);

  const [colCount, setColCount] = useState(savedData?.colCount || COL_DEFAULT);
  const [rowCount, setRowCount] = useState(savedData?.rowCount || ROW_DEFAULT);
  const [cells, setCells] = useState<Record<string, SpreadsheetCell>>(savedData?.cells || {});
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [editingMode, setEditingMode] = useState(false); // 是否处于公式栏编辑状态
  const [editValue, setEditValue] = useState('');

  // 引用：用于公式栏自动聚焦
  const formulaInputRef = useRef<any>(null);

  // 通用公式选项
  const FORMULA_OPTIONS = useMemo<MenuProps['items']>(
    () => [
      { key: 'SUM', label: 'SUM' },
      { key: 'AVERAGE', label: 'AVERAGE' },
      { key: 'COUNT', label: 'COUNT' },
      { key: 'MAX', label: 'MAX' },
      { key: 'MIN', label: 'MIN' },
      { key: 'IF', label: 'IF' },
      { key: 'CONCATENATE', label: 'CONCATENATE' },
    ],
    [],
  );

  // 在输入框末尾插入文本并聚焦
  const appendToInput = useCallback((text: string) => {
    setEditValue((prev) => prev + text);
    setEditingMode(true);
    requestAnimationFrame(() => {
      formulaInputRef.current?.focus();
    });
  }, []);

  // ===== 单元格读写 =====
  const getCell = useCallback(
    (r: number, c: number): SpreadsheetCell => {
      const key = cellKey(r, c);
      return cells[key] || emptyCell();
    },
    [cells],
  );

  const setCell = useCallback((r: number, c: number, updates: Partial<SpreadsheetCell>) => {
    setCells((prev) => {
      const key = cellKey(r, c);
      const existing = prev[key] || emptyCell();
      return { ...prev, [key]: { ...existing, ...updates } };
    });
  }, []);

  // 选中某个单元格时，更新公式栏内容
  useEffect(() => {
    if (selectedCell) {
      const cell = getCell(selectedCell.row, selectedCell.col);
      setEditValue(cell.text);
      setEditingMode(false);
    }
  }, [selectedCell, getCell]);

  // ===== 行/列操作 =====
  const addRow = useCallback(() => {
    setRowCount((r) => Math.min(r + 1, 100));
  }, []);

  const addCol = useCallback(() => {
    setColCount((c) => Math.min(c + 1, 26));
  }, []);

  const removeRow = useCallback(
    (r: number) => {
      if (rowCount <= ROW_MIN) return;
      setCells((prev) => {
        const next = { ...prev };
        for (let c = 0; c < colCount; c++) delete next[cellKey(r, c)];
        // 下面的行上移
        for (let rr = r + 1; rr < rowCount; rr++) {
          for (let c = 0; c < colCount; c++) {
            const fromKey = cellKey(rr, c);
            if (next[fromKey]) {
              next[cellKey(rr - 1, c)] = next[fromKey];
              delete next[fromKey];
            }
          }
        }
        return next;
      });
      setRowCount((prev) => prev - 1);
      setSelectedCell(null);
    },
    [colCount, rowCount],
  );

  const removeCol = useCallback(
    (c: number) => {
      if (colCount <= COL_MIN) return;
      setCells((prev) => {
        const next = { ...prev };
        for (let r = 0; r < rowCount; r++) delete next[cellKey(r, c)];
        // 右侧的列左移
        for (let rr = 0; rr < rowCount; rr++) {
          for (let cc = c + 1; cc < colCount; cc++) {
            const fromKey = cellKey(rr, cc);
            if (next[fromKey]) {
              next[cellKey(rr, cc - 1)] = next[fromKey];
              delete next[fromKey];
            }
          }
        }
        return next;
      });
      setColCount((prev) => prev - 1);
      setSelectedCell(null);
    },
    [rowCount, colCount],
  );

  // ===== 自动同步模板内容到表单 =====
  useEffect(() => {
    const data: SpreadsheetData = {
      version: 2,
      sheetName: 'Sheet1',
      colCount,
      rowCount,
      cells,
    };
    form.setFieldsValue({ content: JSON.stringify(data) });
  }, [colCount, rowCount, cells, form]);

  // ===== 公式栏确认编辑 =====
  const confirmEdit = useCallback(() => {
    if (selectedCell) {
      setCell(selectedCell.row, selectedCell.col, { text: editValue });
      setEditingMode(false);
    }
  }, [selectedCell, editValue, setCell]);

  // ===== 选中单元格信息 =====
  const selectedData = selectedCell ? getCell(selectedCell.row, selectedCell.col) : null;

  // ===== 渲染 =====
  return (
    <div>
      {/* ===== 说明行 ===== */}
      <div style={{ marginBottom: 8, color: '#888', fontSize: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>{t('Click cell to select, edit in formula bar below')}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tag color="#1677ff" style={{ lineHeight: '16px', fontSize: 10, margin: 0 }}>
            ↓
          </Tag>
          {t('Float Downward')}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tag color="#52c41a" style={{ lineHeight: '16px', fontSize: 10, margin: 0 }}>
            →
          </Tag>
          {t('Float Rightward')}
        </span>
      </div>

      {/* ===== 工具栏 ===== */}
      <div
        style={{
          marginBottom: 6,
          padding: '6px 10px',
          background: '#f5f5f5',
          borderRadius: 6,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap',
          border: '1px solid #e8e8e8',
        }}
      >
        {/* 行列操作 */}
        <Button size="small" icon={<PlusOutlined />} onClick={addRow}>
          {t('Row')}
        </Button>
        <Button size="small" icon={<ColumnHeightOutlined />} onClick={addCol}>
          {t('Column')}
        </Button>
        <Divider type="vertical" />

        {/* 选中单元格 - 格式 + 删除行列 */}
        {selectedCell && selectedData && (
          <>
            {/* 浮动方向 */}
            <Select
              size="small"
              style={{ width: 100 }}
              value={selectedData.floatDirection}
              onChange={(v) => setCell(selectedCell.row, selectedCell.col, { floatDirection: v })}
              options={[
                { label: t('No Float'), value: 'none' },
                { label: `↓ ${t('Float Downward')}`, value: 'downward' },
                { label: `→ ${t('Float Rightward')}`, value: 'rightward' },
              ]}
            />

            {/* 序号 */}
            <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>{t('Seq')}</span>
            <Switch
              size="small"
              checked={selectedData.isSequence}
              onChange={(v) => setCell(selectedCell.row, selectedCell.col, { isSequence: v })}
            />

            {/* 加粗 */}
            <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>{t('Bold')}</span>
            <Switch
              size="small"
              checked={selectedData.bold}
              onChange={(v) => setCell(selectedCell.row, selectedCell.col, { bold: v })}
            />

            <Divider type="vertical" />

            {/* 删除行列 */}
            <Tooltip title={t('Delete Row')}>
              <Button
                size="small"
                danger
                icon={<MinusOutlined />}
                disabled={rowCount <= ROW_MIN}
                onClick={() => removeRow(selectedCell.row)}
              />
            </Tooltip>
            <Tooltip title={t('Delete Column')}>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={colCount <= COL_MIN}
                onClick={() => removeCol(selectedCell.col)}
              />
            </Tooltip>
          </>
        )}
      </div>

      {/* ===== 公式栏（统一编辑：常量、变量、公式） ===== */}
      {selectedCell && selectedData && (
        <div
          style={{
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            background: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: 4,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#1677ff',
              minWidth: 48,
              background: '#e6f4ff',
              padding: '2px 6px',
              borderRadius: 3,
              textAlign: 'center',
              flexShrink: 0,
            }}
          >
            {toColLabel(selectedCell.col)}
            {selectedCell.row + 1}
          </span>
          <Input
            ref={formulaInputRef}
            size="small"
            style={{ flex: 1, fontFamily: 'Menlo, Consolas, monospace', fontSize: 13 }}
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              setEditingMode(true);
            }}
            onBlur={() => {
              if (editingMode) confirmEdit();
            }}
            onPressEnter={() => {
              confirmEdit();
            }}
            placeholder={t('Cell content: type constant, or insert variable/formula')}
          />
          {/* 变量选择器 */}
          <CollectionFieldPicker
            collectionName={collectionName}
            onInsert={(fieldPath) => {
              appendToInput(`{${fieldPath}}`);
            }}
            label={
              <span style={{ fontSize: 12, color: '#1677ff', cursor: 'pointer', whiteSpace: 'nowrap' }}>{`{x}`}</span>
            }
          />
          {/* 公式选择器 */}
          <Dropdown
            menu={{
              items: FORMULA_OPTIONS,
              onClick: ({ key }) => {
                const formulaMap: Record<string, string> = {
                  SUM: '=SUM(...)',
                  AVERAGE: '=AVERAGE(...)',
                  COUNT: '=COUNT(...)',
                  MAX: '=MAX(...)',
                  MIN: '=MIN(...)',
                  IF: '=IF(condition, value_if_true, value_if_false)',
                  CONCATENATE: '=CONCATENATE(...)',
                };
                appendToInput(formulaMap[key] || `=${key}(...)`);
              },
            }}
            trigger={['click']}
          >
            <Button size="small" style={{ fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
              fx
            </Button>
          </Dropdown>
          {selectedData.floatDirection !== 'none' && (
            <Tag color={FLOAT_META[selectedData.floatDirection].color} style={{ flexShrink: 0 }}>
              {FLOAT_META[selectedData.floatDirection].short} {t(FLOAT_META[selectedData.floatDirection].label as any)}
            </Tag>
          )}
          {selectedData.isSequence && (
            <Tag color="#faad14" style={{ flexShrink: 0 }}>
              #
            </Tag>
          )}
        </div>
      )}

      {/* ===== 电子表格网格 ===== */}
      <div
        style={{
          overflow: 'auto',
          border: '1px solid #d9d9d9',
          borderRadius: 4,
          maxHeight: 420,
          background: '#fff',
        }}
      >
        <table
          style={{
            borderCollapse: 'collapse',
            minWidth: (colCount + 1) * 110,
            tableLayout: 'fixed',
            width: '100%',
          }}
        >
          {/* 列头 */}
          <thead>
            <tr>
              <th
                style={{
                  width: 42,
                  minWidth: 42,
                  background: '#e8e8e8',
                  border: '1px solid #d4d4d4',
                  padding: 0,
                  textAlign: 'center',
                  fontSize: 11,
                  color: '#555',
                  fontWeight: 600,
                  position: 'sticky',
                  top: 0,
                  zIndex: 3,
                }}
              >
                #
              </th>
              {Array.from({ length: colCount }, (_, ci) => (
                <th
                  key={ci}
                  style={{
                    background: '#e8e8e8',
                    border: '1px solid #d4d4d4',
                    padding: '3px 0',
                    textAlign: 'center',
                    fontSize: 11,
                    color: '#555',
                    fontWeight: 600,
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    width: 110,
                    minWidth: 90,
                  }}
                >
                  {toColLabel(ci)}
                </th>
              ))}
            </tr>
          </thead>

          {/* 数据行 */}
          <tbody>
            {Array.from({ length: rowCount }, (_, ri) => (
              <tr
                key={ri}
                style={{
                  background: ri % 2 === 0 ? '#fff' : '#fafafa',
                }}
              >
                {/* 行号 */}
                <td
                  style={{
                    background: '#f0f0f0',
                    border: '1px solid #d4d4d4',
                    padding: 0,
                    textAlign: 'center',
                    fontSize: 11,
                    color: '#666',
                    fontWeight: 500,
                    width: 42,
                    minWidth: 42,
                    userSelect: 'none',
                  }}
                >
                  {ri + 1}
                </td>

                {/* 单元格 */}
                {Array.from({ length: colCount }, (_, ci) => {
                  const cell = getCell(ri, ci);
                  const isSel = selectedCell?.row === ri && selectedCell?.col === ci;
                  const hasFloat = cell.floatDirection !== 'none';

                  // 计算行背景
                  let bg = ri % 2 === 0 ? '#fff' : '#fafafa';
                  if (isSel) bg = '#e6f4ff';
                  else if (hasFloat && cell.floatDirection === 'downward') bg = '#f0f9ff';
                  else if (hasFloat && cell.floatDirection === 'rightward') bg = '#f6ffed';
                  else if (cell.isSequence) bg = '#fffbe6';

                  return (
                    <td
                      key={ci}
                      onClick={() => {
                        setSelectedCell({ row: ri, col: ci });
                      }}
                      style={{
                        border: isSel ? '2px solid #1677ff' : '1px solid #d4d4d4',
                        padding: 0,
                        background: bg,
                        cursor: 'pointer',
                        height: 30,
                        minHeight: 30,
                        position: 'relative',
                        transition: 'border-color 0.1s',
                      }}
                    >
                      {/* 单元格内容 */}
                      <div
                        style={{
                          padding: '2px 6px',
                          minHeight: 26,
                          fontSize: 13,
                          fontWeight: cell.bold ? 600 : 400,
                          lineHeight: '22px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: cell.text ? '#333' : '#ccc',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          fontFamily: 'inherit',
                        }}
                      >
                        {/* 序号标记 */}
                        {cell.isSequence && <span style={{ color: '#faad14', fontWeight: 600, flexShrink: 0 }}>#</span>}
                        {/* 显示单元格内容（内嵌 {field} 高亮） */}
                        {cell.text ? (
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {cell.text.split(/(\{[^}]+\})/g).map((part, i) =>
                              part.startsWith('{') && part.endsWith('}') ? (
                                <span key={i} style={{ color: '#1677ff', fontWeight: 500 }}>
                                  {part}
                                </span>
                              ) : (
                                <span key={i}>{part}</span>
                              ),
                            )}
                          </span>
                        ) : cell.fieldPath ? (
                          <span style={{ color: '#999', fontSize: 11, fontStyle: 'italic', flex: 1 }}>
                            {'{' + cell.fieldPath + '}'}
                          </span>
                        ) : null}
                        {/* 浮动标记 */}
                        {hasFloat && (
                          <span style={{ flexShrink: 0, lineHeight: 1 }}>{FLOAT_META[cell.floatDirection]?.icon}</span>
                        )}
                      </div>

                      {/* 底边浮动指示条 */}
                      {hasFloat && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: 2,
                            background: FLOAT_META[cell.floatDirection].color,
                            opacity: 0.6,
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 无选中时提示 */}
      {!selectedCell && (
        <div
          style={{
            marginTop: 10,
            padding: '12px 16px',
            background: '#fafafa',
            borderRadius: 6,
            border: '1px dashed #d9d9d9',
            textAlign: 'center',
            color: '#999',
            fontSize: 13,
          }}
        >
          {t('Click cell to select, edit in formula bar below')}
        </div>
      )}
    </div>
  );
};
