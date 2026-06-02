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
const DEFAULT_BASE_URL = 'https://mineru.net/api/v4';

interface TokenData {
  token: string;
  mineruCategories: Record<string, boolean>;
  ocrConfig: MineruOcrConfig;
  baseUrl: string;
}

export interface MineruOcrConfig {
  ocr: boolean;
  formula: boolean;
  table: boolean;
}

function defaultOcrConfig(): MineruOcrConfig {
  return { ocr: true, formula: false, table: true };
}

function readData(): TokenData {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const raw = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
      return {
        token: raw.token || '',
        mineruCategories: raw.mineruCategories || {},
        ocrConfig: raw.ocrConfig || defaultOcrConfig(),
        baseUrl: raw.baseUrl || DEFAULT_BASE_URL,
      };
    }
  } catch {
    // ignore
  }
  return { token: '', mineruCategories: {}, ocrConfig: defaultOcrConfig(), baseUrl: DEFAULT_BASE_URL };
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

export function getOcrConfig(): MineruOcrConfig {
  return { ...readData().ocrConfig };
}

export function setOcrConfig(config: MineruOcrConfig): void {
  const data = readData();
  data.ocrConfig = config;
  writeData(data);
}

export function getBaseUrl(): string {
  return readData().baseUrl || DEFAULT_BASE_URL;
}

export function setBaseUrl(url: string): void {
  const data = readData();
  data.baseUrl = url;
  writeData(data);
}
