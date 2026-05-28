/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export function countLines(value: string): number {
  if (!value) return 0;
  let count = 1;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\n') count++;
  }
  return count;
}

export function truncateLines(value: string, maxLines: number): string {
  let lineCount = 0;
  let pos = 0;
  const len = value.length;
  while (pos < len) {
    if (lineCount >= maxLines) {
      return value.slice(0, pos);
    }
    const idx = value.indexOf('\n', pos);
    if (idx === -1) {
      return value;
    }
    lineCount++;
    pos = idx + 1;
  }
  return value;
}
