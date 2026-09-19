/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  FlowContext,
  FlowEngine,
  getRunJSDocFor,
  getSnippetBody,
  listSnippetsForContext,
  setupRunJSContexts,
} from '@nocobase/flow-engine';
import { registerSpreadsheetRunJS } from '../../shared/runjs';

const EXPORT_SNIPPET_REF = 'plugin/plugin-spreadsheet/export-sheet';
const PARSE_SNIPPET_REF = 'plugin/plugin-spreadsheet/parse-file';

describe('plugin-spreadsheet RunJS integration', () => {
  beforeAll(() => {
    registerSpreadsheetRunJS();
  });

  it('should expose SheetJS to the sandbox as ctx.libs.xlsx', async () => {
    const engine = new FlowEngine();
    const ctx: any = engine.context;

    const result = await ctx.runjs(`
      const XLSX = ctx.libs.xlsx;
      const sheet = XLSX.utils.json_to_sheet([{ a: 1 }, { b: 2 }]);
      return JSON.stringify(XLSX.utils.sheet_to_json(sheet));
    `);

    expect(result.success).toBe(true);
    expect(result.value).toBe('[{"a":1},{"b":2}]');
  });

  it('should resolve ctx.libs.xlsx through bracket access and destructuring', async () => {
    const engine = new FlowEngine();
    const ctx: any = engine.context;

    const bracket = await ctx.runjs(`return typeof ctx.libs['xlsx'].read;`);
    expect(bracket.success).toBe(true);
    expect(bracket.value).toBe('function');

    const destructured = await ctx.runjs(`const { xlsx } = ctx.libs; return typeof xlsx.writeFile;`);
    expect(destructured.success).toBe(true);
    expect(destructured.value).toBe('function');
  });

  it('should register idempotently', async () => {
    expect(() => registerSpreadsheetRunJS()).not.toThrow();

    const snippets = await listSnippetsForContext('*', 'v1', 'en-US');
    expect(snippets.filter((snippet) => snippet.ref === EXPORT_SNIPPET_REF)).toHaveLength(1);
    expect(snippets.filter((snippet) => snippet.ref === PARSE_SNIPPET_REF)).toHaveLength(1);
  });

  it('should register snippets that use ctx.libs.xlsx', async () => {
    const exportBody = await getSnippetBody(EXPORT_SNIPPET_REF);
    expect(exportBody).toContain('ctx.libs.xlsx');
    expect(exportBody).toContain('writeFile');

    const parseBody = await getSnippetBody(PARSE_SNIPPET_REF);
    expect(parseBody).toContain('ctx.libs.xlsx');
    expect(parseBody).toContain('sheet_to_json');

    const zhSnippets = await listSnippetsForContext('*', 'v1', 'zh-CN');
    expect(zhSnippets.find((snippet) => snippet.ref === EXPORT_SNIPPET_REF)?.name).toBe('导出数据到 Excel（SheetJS）');
  });

  it('should contribute ctx.libs.xlsx doc meta for the editor', async () => {
    await setupRunJSContexts();

    const doc = getRunJSDocFor(new FlowContext() as any, { version: 'v1' });
    const xlsxDoc = doc?.properties?.libs?.properties?.xlsx;

    expect(xlsxDoc).toBeTruthy();
    expect(xlsxDoc.properties?.read).toBeTruthy();
    expect(xlsxDoc.properties?.utils?.properties?.json_to_sheet).toBeTruthy();

    const zhCtx: any = new FlowContext();
    zhCtx.defineProperty('locale', { value: 'zh-CN' });
    const zhXlsxDoc = getRunJSDocFor(zhCtx, { version: 'v1' })?.properties?.libs?.properties?.xlsx;

    expect(zhXlsxDoc?.description).toContain('SheetJS 电子表格工具库');
  });
});
