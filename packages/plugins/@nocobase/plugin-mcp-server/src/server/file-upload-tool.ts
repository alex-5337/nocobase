/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { randomUUID } from 'node:crypto';
import type { McpTool, McpToolCallContext, McpToolsManager } from '@nocobase/ai';
import inject from 'light-my-request';
import mime from 'mime-types';

const DEFAULT_FILE_RESOURCE = 'attachments';
const MULTIPART_FIELD_NAME = 'file';
const FALLBACK_MIMETYPE = 'application/octet-stream';
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

type UploadFileArgs = {
  dataSource?: string;
  resource?: string;
  filename?: string;
  contentBase64?: string;
  attachmentField?: string;
};

function normalizeHeaderValue(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function decodeBase64Content(contentBase64: string) {
  const normalized = contentBase64.replace(/\s/g, '');
  if (!normalized) {
    throw new Error('contentBase64 is empty');
  }
  if (!BASE64_PATTERN.test(normalized)) {
    throw new Error('contentBase64 is not valid base64 content');
  }
  return Buffer.from(normalized, 'base64');
}

function buildBoundary() {
  return `----nocobaseMcp${randomUUID().replace(/-/g, '')}`;
}

function buildMultipartPayload(options: { boundary: string; filename: string; mimetype: string; buffer: Buffer }) {
  const { boundary, filename, mimetype, buffer } = options;
  const safeFilename = filename.replace(/["\r\n]/g, '');
  // Content is written as UTF-8 bytes and re-read as latin1 by the upload middleware, the same round trip a browser upload performs for non-ASCII file names.
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${MULTIPART_FIELD_NAME}"; filename="${safeFilename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
    'utf8',
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.allocUnsafe(header.length + buffer.length + footer.length);
  body.set(header, 0);
  body.set(buffer, header.length);
  body.set(footer, header.length + buffer.length);
  return body;
}

function buildUploadHeaders(args: UploadFileArgs, context: McpToolCallContext | undefined, boundary: string) {
  const incomingHeaders = context?.headers || {};
  const headers: Record<string, any> = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
  };

  const forwardedRole = normalizeHeaderValue(incomingHeaders['x-role'] || incomingHeaders['X-Role']);
  if (forwardedRole) {
    headers['x-role'] = forwardedRole;
  }

  const forwardedAuthenticator = normalizeHeaderValue(
    incomingHeaders['x-authenticator'] || incomingHeaders['X-Authenticator'],
  );
  if (forwardedAuthenticator) {
    headers['x-authenticator'] = forwardedAuthenticator;
  }

  if (context?.token) {
    headers.authorization = `Bearer ${context.token}`;
  } else {
    const authorization = normalizeHeaderValue(incomingHeaders.authorization || incomingHeaders.Authorization);
    if (authorization) {
      headers.authorization = authorization;
    }
  }

  if (args.dataSource && args.dataSource !== 'main') {
    headers['x-data-source'] = args.dataSource;
  }

  return headers;
}

export function createFileUploadTool(options: {
  app: {
    callback: () => any;
    resourcer: { options?: { prefix?: string } };
  };
  mcpToolsManager: McpToolsManager;
}): McpTool {
  const prefix = options.app.resourcer.options?.prefix || '/api';

  const tool = {
    name: 'resource_upload_file',
    description:
      'Upload a binary file into a file collection (attachments by default) and return the created file record. Pass the file content as base64, then link the returned file id to business records through resource_create or resource_update. Use attachmentField to store the file with the storage configured on that field, for example main_bill.credential.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['filename', 'contentBase64'],
      properties: {
        dataSource: {
          type: 'string',
          description: 'Data source key. Defaults to main.',
        },
        resource: {
          type: 'string',
          description: 'File collection resource name. Defaults to attachments.',
        },
        filename: {
          type: 'string',
          description:
            'Original file name including extension. Determines extname, title and the uploaded content type.',
        },
        contentBase64: {
          type: 'string',
          description: 'Base64 encoded file content.',
        },
        attachmentField: {
          type: 'string',
          description:
            'Attachment field path such as main_bill.credential. The storage configured on that field is used for the upload.',
        },
      },
    },
  } as McpTool;

  tool.call = async (args: Record<string, any>, context?: McpToolCallContext) => {
    const typedArgs = (args || {}) as UploadFileArgs;
    const filename = typedArgs.filename?.trim();
    if (!filename) {
      throw new Error('filename is required');
    }
    if (!typedArgs.contentBase64) {
      throw new Error('contentBase64 is required');
    }

    const resource = typedArgs.resource?.trim() || DEFAULT_FILE_RESOURCE;
    const buffer = decodeBase64Content(typedArgs.contentBase64);
    const boundary = buildBoundary();
    const payload = buildMultipartPayload({
      boundary,
      filename,
      mimetype: (mime.lookup(filename) as string) || FALLBACK_MIMETYPE,
      buffer,
    });

    const response = await inject(options.app.callback(), {
      method: 'POST',
      url: `${prefix.replace(/\/$/, '')}/${resource}:create`,
      query: typedArgs.attachmentField ? { attachmentField: typedArgs.attachmentField } : {},
      headers: buildUploadHeaders(typedArgs, context, boundary),
      payload,
    });

    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    const body =
      contentType.includes('application/json') || contentType.includes('+json')
        ? (() => {
            try {
              return response.json();
            } catch (error) {
              return response.payload;
            }
          })()
        : response.payload;

    if (response.statusCode >= 400) {
      throw new Error(
        JSON.stringify({
          statusCode: response.statusCode,
          body,
        }),
      );
    }

    return options.mcpToolsManager.postProcessToolResult(
      {
        ...tool,
        resourceName: resource,
        actionName: 'create',
        path: `/${resource}:create`,
        method: 'POST',
      },
      body,
      {
        args: typedArgs,
        callContext: context,
        response: {
          statusCode: response.statusCode,
          headers: response.headers,
          body,
        },
      },
    );
  };

  return tool;
}
