/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

function parseMarkdownTable(markdown: string): string[][] {
  const rows: string[][] = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
      continue;
    }
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
      continue;
    }
    const cells = trimmed
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
    rows.push(cells);
  }

  return rows;
}

function tableToMarkdown(rows: string[][]): string {
  if (rows.length === 0) return '';

  const colCount = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((r) => {
    while (r.length < colCount) r.push('');
    return r;
  });

  const colWidths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    colWidths.push(3);
    for (let r = 0; r < normalized.length; r++) {
      const len = (normalized[r][c] || '').length;
      if (len > colWidths[c]) colWidths[c] = len;
    }
  }

  const separator = '|' + colWidths.map((w) => '-'.repeat(w + 2)).join('|') + '|';

  let needsSeparator = false;
  if (normalized.length > 0) {
    const nonEmpty = normalized[0].filter((c) => c.trim() !== '');
    const otherNonEmpty = normalized
      .slice(1)
      .flat()
      .filter((c) => c.trim() !== '');
    needsSeparator = nonEmpty.length > 0 && otherNonEmpty.length > 0;
  }

  const parts: string[] = [];

  if (needsSeparator) {
    const headerLine = '| ' + normalized[0].map((c) => (c || '').padEnd(colWidths[0] || 3)).join(' | ') + ' |';
    parts.push(headerLine);
    parts.push(separator);
    for (let r = 1; r < normalized.length; r++) {
      const rowLine = '| ' + normalized[r].map((c, i) => (c || '').padEnd(colWidths[i] || 3)).join(' | ') + ' |';
      parts.push(rowLine);
    }
  } else {
    for (let r = 0; r < normalized.length; r++) {
      const rowLine = '| ' + normalized[r].map((c, i) => (c || '').padEnd(colWidths[i] || 3)).join(' | ') + ' |';
      parts.push(rowLine);
    }
  }

  return parts.join('\n');
}

export function fixMergedCells(markdown: string): string {
  const tableRegex = /((?:^\|.+\|[\r\n]+)+)/gm;
  let result = markdown;
  let match;

  while ((match = tableRegex.exec(markdown)) !== null) {
    const originalTable = match[1].trimEnd();
    const rows = parseMarkdownTable(originalTable);

    if (rows.length < 2) continue;

    const colCount = Math.max(...rows.map((r) => r.length));

    for (let pass = 0; pass < colCount; pass++) {
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < colCount; c++) {
          if (rows[r][c] !== undefined && rows[r][c].trim() === '') {
            if (r > 0 && rows[r - 1][c] && rows[r - 1][c].trim() !== '') {
              rows[r][c] = rows[r - 1][c];
            }
            if (rows[r][c].trim() === '' && c > 0 && rows[r][c - 1] && rows[r][c - 1].trim() !== '') {
              rows[r][c] = rows[r][c - 1];
            }
          }
        }
      }
    }

    const fixedTable = tableToMarkdown(rows);
    result = result.replace(originalTable, fixedTable);
  }

  return result;
}
