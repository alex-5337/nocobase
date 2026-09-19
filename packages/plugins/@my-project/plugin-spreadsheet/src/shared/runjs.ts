/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { registerRunJSContextContribution, registerRunJSLib, registerRunJSSnippet } from '@nocobase/flow-engine';

const XLSX_LIB_NAME = 'xlsx';

const exportSheetSnippet = {
  contexts: ['*'],
  versions: ['*'],
  scenes: ['block'],
  prefix: 'sn-xlsx-export',
  label: 'Export rows to Excel (SheetJS)',
  description: 'Build a workbook from rows with ctx.libs.xlsx and download it as an .xlsx file',
  locales: {
    'zh-CN': {
      label: '导出数据到 Excel（SheetJS）',
      description: '使用 ctx.libs.xlsx 把数据构造成工作簿并下载为 .xlsx 文件',
    },
  },
  content: `
// Build a workbook from rows and download it as .xlsx
const XLSX = ctx.libs.xlsx;

const rows = [
  { name: 'Alice', amount: 12 },
  { name: 'Bob', amount: 34 },
];
const sheet = XLSX.utils.json_to_sheet(rows);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

// In the browser this triggers a download; pass { type: 'buffer' } to get a binary string instead
XLSX.writeFile(workbook, 'export.xlsx');
`,
};

const parseFileSnippet = {
  contexts: ['*'],
  versions: ['*'],
  scenes: ['block'],
  prefix: 'sn-xlsx-parse',
  label: 'Parse an Excel file (SheetJS)',
  description: 'Read a local xlsx/xls/csv file with ctx.libs.xlsx and turn the first sheet into rows',
  locales: {
    'zh-CN': {
      label: '解析 Excel 文件（SheetJS）',
      description: '使用 ctx.libs.xlsx 读取本地 xlsx/xls/csv 文件，并把第一个工作表转换成行数据',
    },
  },
  content: `
// Read a local spreadsheet file and turn the first sheet into rows
const XLSX = ctx.libs.xlsx;

const input = document.createElement('input');
input.type = 'file';
input.accept = '.xlsx,.xls,.csv';
input.onchange = async () => {
  const file = input.files && input.files[0];
  if (!file) return;

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  ctx.message.success(\`Parsed \${rows.length} row(s) from \${file.name}\`);
  console.log(rows);
};

ctx.render(input);
`,
};

function buildXlsxDoc(pick: (en: string, zhCN: string) => string) {
  return {
    properties: {
      libs: {
        properties: {
          xlsx: {
            description: pick(
              'SheetJS spreadsheet toolkit. Reads and writes xlsx/xls/csv and other formats. Example: `ctx.libs.xlsx.utils.json_to_sheet([{ a: 1 }])`.',
              'SheetJS 电子表格工具库，可读写 xlsx/xls/csv 等格式。示例：`ctx.libs.xlsx.utils.json_to_sheet([{ a: 1 }])`。',
            ),
            properties: {
              read: {
                type: 'function',
                description: pick(
                  'Parse spreadsheet data into a workbook.',
                  '把电子表格数据解析成工作簿（Workbook）。',
                ),
                detail: '(data: ArrayBuffer | string, opts?: { type: "array" | "binary" | "base64" }) => Workbook',
                completion: { insertText: `ctx.libs.xlsx.read(await file.arrayBuffer(), { type: 'array' })` },
              },
              write: {
                type: 'function',
                description: pick(
                  'Serialize a workbook into the requested output type.',
                  '把工作簿序列化成指定的输出类型。',
                ),
                detail: '(workbook: Workbook, opts: { type: "array" | "binary" | "base64" }) => ArrayBuffer | string',
                completion: { insertText: `ctx.libs.xlsx.write(workbook, { type: 'array' })` },
              },
              writeFile: {
                type: 'function',
                description: pick(
                  'Write a workbook out. In the browser this triggers a file download.',
                  '写出工作簿，在浏览器中会触发文件下载。',
                ),
                detail: '(workbook: Workbook, filename: string, opts?: object) => void',
                completion: { insertText: `ctx.libs.xlsx.writeFile(workbook, 'export.xlsx')` },
              },
              readFile: {
                type: 'function',
                description: pick(
                  'Read a worksheet file by name (Node.js only; in the browser use read/2 with file.arrayBuffer()).',
                  '按文件名读取电子表格（仅 Node.js 可用；浏览器中请改用 read 配合 file.arrayBuffer()）。',
                ),
                detail: '(filename: string, opts?: object) => Workbook',
                completion: { insertText: `ctx.libs.xlsx.readFile(filename)` },
              },
              utils: {
                description: pick(
                  'SheetJS helper functions for converting between worksheets, rows and CSV.',
                  'SheetJS 辅助函数，用于在工作表、行数据与 CSV 之间转换。',
                ),
                properties: {
                  json_to_sheet: {
                    type: 'function',
                    description: pick('Build a worksheet from an array of row objects.', '把对象数组构造成工作表。'),
                    detail: '(rows: object[], opts?: object) => Worksheet',
                    completion: { insertText: 'ctx.libs.xlsx.utils.json_to_sheet(rows)' },
                  },
                  sheet_to_json: {
                    type: 'function',
                    description: pick('Convert a worksheet into an array of row objects.', '把工作表转换成对象数组。'),
                    detail: '(sheet: Worksheet, opts?: { defval?: unknown; header?: number | string[] }) => object[]',
                    completion: { insertText: 'ctx.libs.xlsx.utils.sheet_to_json(sheet, { defval: null })' },
                  },
                  aoa_to_sheet: {
                    type: 'function',
                    description: pick('Build a worksheet from an array of arrays.', '把二维数组构造成工作表。'),
                    detail: '(rows: unknown[][]) => Worksheet',
                    completion: { insertText: 'ctx.libs.xlsx.utils.aoa_to_sheet(rows)' },
                  },
                  book_new: {
                    type: 'function',
                    description: pick('Create an empty workbook.', '创建一个空工作簿。'),
                    detail: '() => Workbook',
                    completion: { insertText: 'ctx.libs.xlsx.utils.book_new()' },
                  },
                  book_append_sheet: {
                    type: 'function',
                    description: pick('Append a worksheet to a workbook.', '把工作表追加到工作簿中。'),
                    detail: '(workbook: Workbook, sheet: Worksheet, name?: string) => void',
                    completion: { insertText: `ctx.libs.xlsx.utils.book_append_sheet(workbook, sheet, 'Sheet1')` },
                  },
                  sheet_to_csv: {
                    type: 'function',
                    description: pick('Convert a worksheet into a CSV string.', '把工作表转换成 CSV 字符串。'),
                    detail: '(sheet: Worksheet, opts?: object) => string',
                    completion: { insertText: 'ctx.libs.xlsx.utils.sheet_to_csv(sheet)' },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

let registered = false;

/**
 * Expose SheetJS to the frontend RunJS sandbox as `ctx.libs.xlsx`.
 *
 * The library is bundled with the plugin (no CDN, works offline) and lazily loaded on first access,
 * so the spreadsheet parser is only fetched when a RunJS script actually reads `ctx.libs.xlsx`.
 */
export function registerSpreadsheetRunJS(): void {
  if (registered) return;
  registered = true;

  registerRunJSLib(XLSX_LIB_NAME, () => import('xlsx-js-style'), { cache: 'global' });

  registerRunJSContextContribution(({ FlowRunJSContext }) => {
    FlowRunJSContext.define(buildXlsxDoc((en) => en));
    FlowRunJSContext.define(
      buildXlsxDoc((_, zhCN) => zhCN),
      { locale: 'zh-CN' },
    );
  });

  registerRunJSSnippet('plugin/plugin-spreadsheet/export-sheet', async () => ({ default: exportSheetSnippet }));
  registerRunJSSnippet('plugin/plugin-spreadsheet/parse-file', async () => ({ default: parseFileSnippet }));
}
