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

const ALLOWED_EXTENSIONS = ['.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt'];

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
  } catch (err: any) {
    ctx.throw(400, err.message || 'File upload failed');
  }

  const uploadedFile = ctx.file;
  if (!uploadedFile) {
    ctx.throw(400, ctx.t('No file uploaded', { ns: pkgName() }));
  }

  const ext = getExt(uploadedFile.originalname);
  if (!validateExt(ext)) {
    try {
      fs.unlinkSync(uploadedFile.path);
    } catch {
      // cleanup failure is non-critical
    }
    ctx.throw(400, ctx.t('Unsupported file format', { ns: pkgName() }));
  }

  ctx.uploadedFilePath = uploadedFile.path;
  ctx.uploadedFilename = uploadedFile.originalname;

  await next();

  if (ctx.uploadedFilePath) {
    try {
      fs.unlinkSync(ctx.uploadedFilePath);
    } catch {
      // cleanup failure is non-critical
    }
  }
}

export function resolveFilePath(ctx: any): { filePath: string; filename: string; isTemp: boolean } | null {
  if (ctx.uploadedFilePath) {
    return { filePath: ctx.uploadedFilePath, filename: ctx.uploadedFilename, isTemp: false };
  }

  const { path: filePath, file, filename } = ctx.action.params.values || {};

  if (filePath) {
    const ext = getExt(filePath);
    if (!validateExt(ext)) {
      ctx.throw(400, ctx.t('Unsupported file format', { ns: pkgName() }));
    }
    return { filePath, filename: filePath, isTemp: false };
  }

  if (file && filename) {
    const ext = getExt(filename);
    if (!validateExt(ext)) {
      ctx.throw(400, ctx.t('Unsupported file format', { ns: pkgName() }));
    }
    const tempPath = getTempPath(filename);
    const buffer = Buffer.from(file, 'base64');
    fs.writeFileSync(tempPath, new Uint8Array(buffer));
    return { filePath: tempPath, filename, isTemp: true };
  }

  return null;
}
