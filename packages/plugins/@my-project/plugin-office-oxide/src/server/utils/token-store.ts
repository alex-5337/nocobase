/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import fs from 'fs';
import path from 'path';

const TOKEN_FILE = path.resolve(__dirname, '../../token.json');

interface TokenData {
  token: string;
  mineruCategories: Record<string, boolean>;
}

function readData(): TokenData {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const raw = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
      return {
        token: raw.token || '',
        mineruCategories: raw.mineruCategories || {},
      };
    }
  } catch {
    // ignore
  }
  return { token: '', mineruCategories: {} };
}

function writeData(data: TokenData): void {
  const dir = path.dirname(TOKEN_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data), 'utf-8');
}

export function loadToken(): string {
  return readData().token || process.env.MINERU_TOKEN || '';
}

export function saveToken(token: string): void {
  const data = readData();
  data.token = token;
  writeData(data);
  process.env.MINERU_TOKEN = token;
}

export function getMineruCategories(): Record<string, boolean> {
  return { ...readData().mineruCategories };
}

export function setMineruCategory(category: string, enabled: boolean): void {
  const data = readData();
  data.mineruCategories[category] = enabled;
  writeData(data);
}

export function isMineruEnabledFor(ext: string, category: string): boolean {
  return readData().mineruCategories[category] === true;
}
