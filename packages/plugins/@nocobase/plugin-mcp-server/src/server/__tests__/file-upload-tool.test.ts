/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import Koa from 'koa';
import { describe, expect, it } from 'vitest';
import { McpToolsManager } from '@nocobase/ai';
import { createFileUploadTool } from '../file-upload-tool';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

type UploadEcho = {
  method: string;
  path: string;
  query: Record<string, any>;
  contentType: string;
  authorization: string;
  dataSource: string;
  rawBase64: string;
};

function createUploadEchoApp() {
  const app = new Koa();
  app.use(async (ctx) => {
    const chunks: Buffer[] = [];
    for await (const chunk of ctx.req) {
      chunks.push(chunk as Buffer);
    }
    const raw = Buffer.allocUnsafe(chunks.reduce((total, chunk) => total + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      raw.set(chunk, offset);
      offset += chunk.length;
    }
    ctx.type = 'application/json';
    ctx.body = {
      method: ctx.method,
      path: ctx.path,
      query: ctx.query,
      contentType: ctx.get('content-type'),
      authorization: ctx.get('authorization'),
      dataSource: ctx.get('x-data-source'),
      rawBase64: raw.toString('base64'),
    } satisfies UploadEcho;
  });

  return {
    callback: () => app.callback(),
    resourcer: {
      options: {
        prefix: '/api',
      },
    },
  };
}

function createFailingApp(statusCode: number) {
  return {
    callback: () => (req, res) => {
      req.resume();
      res.statusCode = statusCode;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ errors: [{ message: 'Mime type not allowed by storage rule' }] }));
    },
    resourcer: {
      options: {
        prefix: '/api',
      },
    },
  };
}

describe('createFileUploadTool', () => {
  it('should expose the upload tool with required inputs', () => {
    const tool = createFileUploadTool({
      app: createUploadEchoApp(),
      mcpToolsManager: new McpToolsManager(),
    });

    expect(tool.name).toBe('resource_upload_file');
    expect(tool.inputSchema.required).toEqual(['filename', 'contentBase64']);
    expect(Object.keys(tool.inputSchema.properties)).toEqual([
      'dataSource',
      'resource',
      'filename',
      'contentBase64',
      'attachmentField',
    ]);
  });

  it('should post the decoded content as multipart to the file collection', async () => {
    const tool = createFileUploadTool({
      app: createUploadEchoApp(),
      mcpToolsManager: new McpToolsManager(),
    });

    const result = (await tool.call(
      {
        filename: '凭证.png',
        contentBase64: PNG_BASE64,
        attachmentField: 'main_bill.credential',
      },
      { token: 'test-token' },
    )) as unknown as UploadEcho;

    expect(result.method).toBe('POST');
    expect(result.path).toBe('/api/attachments:create');
    expect(result.query.attachmentField).toBe('main_bill.credential');
    expect(result.contentType).toMatch(/^multipart\/form-data; boundary=----nocobaseMcp[0-9a-f]{32}$/);
    expect(result.authorization).toBe('Bearer test-token');

    const boundary = result.contentType.split('boundary=')[1];
    const raw = Buffer.from(result.rawBase64, 'base64');
    const text = raw.toString('utf8');

    expect(text.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(text).toContain('name="file"');
    expect(text).toContain('filename="凭证.png"');
    expect(text).toContain('Content-Type: image/png');
    expect(text.endsWith(`\r\n--${boundary}--\r\n`)).toBe(true);
    expect(raw.toString('hex')).toContain(Buffer.from(PNG_BASE64, 'base64').toString('hex'));
  });

  it('should upload to the given file collection and forward the data source', async () => {
    const tool = createFileUploadTool({
      app: createUploadEchoApp(),
      mcpToolsManager: new McpToolsManager(),
    });

    const result = (await tool.call({
      resource: 'ledger_vouchers',
      filename: 'invoice.pdf',
      contentBase64: PNG_BASE64,
      dataSource: 'reporting',
    })) as unknown as UploadEcho;

    expect(result.path).toBe('/api/ledger_vouchers:create');
    expect(result.query.attachmentField).toBeUndefined();
    expect(result.dataSource).toBe('reporting');
    expect(Buffer.from(result.rawBase64, 'base64').toString('utf8')).toContain('Content-Type: application/pdf');
  });

  it('should reject missing or invalid arguments', async () => {
    const tool = createFileUploadTool({
      app: createUploadEchoApp(),
      mcpToolsManager: new McpToolsManager(),
    });

    await expect(tool.call({ contentBase64: PNG_BASE64 })).rejects.toThrow('filename is required');
    await expect(tool.call({ filename: 'a.png' })).rejects.toThrow('contentBase64 is required');
    await expect(tool.call({ filename: 'a.png', contentBase64: '!!!' })).rejects.toThrow(
      'contentBase64 is not valid base64 content',
    );
  });

  it('should throw when the upload request is rejected', async () => {
    const tool = createFileUploadTool({
      app: createFailingApp(400),
      mcpToolsManager: new McpToolsManager(),
    });

    await expect(tool.call({ filename: 'a.png', contentBase64: PNG_BASE64 })).rejects.toThrow(
      'Mime type not allowed by storage rule',
    );
  });
});
