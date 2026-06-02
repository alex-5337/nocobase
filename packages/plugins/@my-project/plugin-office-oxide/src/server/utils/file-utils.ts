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
import os from 'os';
import { koaMulter as multer } from '@nocobase/utils';

const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.pptx',
  '.ppt',
  '.png',
  '.jpg',
  '.jpeg',
  '.jp2',
  '.webp',
  '.gif',
  '.bmp',
];

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.jp2', '.webp', '.gif', '.bmp']);
const OFFICE_EXTENSIONS = new Set(['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt']);

function isImageExt(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext);
}

function isOfficeExt(ext: string): boolean {
  return OFFICE_EXTENSIONS.has(ext);
}

const MINERU_CATEGORIES = ['pdf', 'word', 'excel', 'ppt', 'image'] as const;
type MineruCategory = (typeof MINERU_CATEGORIES)[number];

const EXT_TO_CATEGORY: Record<string, MineruCategory> = {
  '.pdf': 'pdf',
  '.docx': 'word',
  '.doc': 'word',
  '.xlsx': 'excel',
  '.xls': 'excel',
  '.pptx': 'ppt',
  '.ppt': 'ppt',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.jp2': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.bmp': 'image',
};

export { ALLOWED_EXTENSIONS, MINERU_CATEGORIES, EXT_TO_CATEGORY, isImageExt, isOfficeExt };
export type { MineruCategory };

export function getExt(filename: string): string {
  return path.extname(filename).toLowerCase();
}

export function getTempPath(filename: string): string {
  const tmpDir = os.tmpdir();
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`;
  return path.join(tmpDir, uniqueName);
}

export function validateExt(ext: string): boolean {
  return ALLOWED_EXTENSIONS.includes(ext);
}

export function pkgName() {
  return '@my-project/plugin-office-oxide';
}

export async function multipartMiddleware(ctx: any, next: any) {
  if (!ctx.action || ctx.action.resourceName !== 'officeOxide') {
    return next();
  }

  if (!ctx.is('multipart/form-data')) {
    return next();
  }

  const upload = multer({ dest: os.tmpdir() }).single('file');

  try {
    await upload(ctx, () => {});
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.body = { markdown: '', html: '', error: message || 'File upload failed', resultField: 'error' };
    return;
  }

  await next();
}

export function resolveFilePath(ctx: any) {
  const file = ctx.file;
  if (file) {
    return {
      filePath: file.path,
      filename: file.originalname,
      isTemp: true,
    };
  }

  const params = ctx.action.params.values || {};

  if (params.filePath) {
    const filePath = params.filePath;
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return {
      filePath,
      filename: path.basename(filePath),
      isTemp: false,
    };
  }

  if (params.base64) {
    const matches = params.base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return null;
    }
    const mime = matches[1];
    const ext = mimeToExt(mime);
    const data = new Uint8Array(Buffer.from(matches[2], 'base64'));
    const filename = `upload-${Date.now()}${ext}`;
    const filePath = getTempPath(filename);
    fs.writeFileSync(filePath, data);
    return {
      filePath,
      filename,
      isTemp: true,
    };
  }

  return null;
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/msword': '.doc',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.ms-powerpoint': '.ppt',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jp2': '.jp2',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
  };
  return map[mime] || '';
}
