/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export default {
  info: {
    title: 'NocoBase API - Office Oxide plugin',
  },
  tags: [
    {
      name: 'Office Oxide',
      description: 'Convert Office/PDF documents to Markdown or HTML',
    },
  ],
  paths: {
    '/officeOxide:toMarkdown': {
      post: {
        summary: 'Convert a document to Markdown',
        description:
          'Converts an Office (DOCX/XLSX/PPTX) or PDF document to Markdown. Accepts multipart file upload, base64 data URI, or a server-side file path.',
        tags: ['Office Oxide'],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description: 'The file to convert (PDF, DOCX, XLSX, PPTX, images, etc.)',
                  },
                },
              },
            },
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  filePath: {
                    type: 'string',
                    description: 'Absolute path to the file on the server',
                  },
                  base64: {
                    type: 'string',
                    description: 'Base64 data URI of the file (e.g. data:application/pdf;base64,...)',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Conversion result',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/conversionResult',
                },
              },
            },
          },
        },
      },
    },
    '/officeOxide:toHtml': {
      post: {
        summary: 'Convert a document to HTML',
        description:
          'Converts an Office (DOCX/XLSX/PPTX) or PDF document to HTML. Accepts multipart file upload, base64 data URI, or a server-side file path.',
        tags: ['Office Oxide'],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description: 'The file to convert (PDF, DOCX, XLSX, PPTX, images, etc.)',
                  },
                },
              },
            },
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  filePath: {
                    type: 'string',
                    description: 'Absolute path to the file on the server',
                  },
                  base64: {
                    type: 'string',
                    description: 'Base64 data URI of the file (e.g. data:application/pdf;base64,...)',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Conversion result',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/conversionResult',
                },
              },
            },
          },
        },
      },
    },
    '/officeOxide:toPng': {
      post: {
        summary: 'Convert PDF pages to PNG images (JSON base64)',
        description:
          'Renders PDF pages as PNG images using MuPDF. Only PDF files are supported. Accepts multipart file upload, base64 data URI, or a server-side file path. Returns JSON with base64-encoded images and filenames.',
        tags: ['Office Oxide'],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description: 'The PDF file to render',
                  },
                  scale: {
                    type: 'number',
                    description: 'Scale factor (default: 2). Higher values produce larger images.',
                    default: 2,
                  },
                  pages: {
                    type: 'string',
                    description:
                      'Pages to render: "all", a single number, or a range like "1-5" or "1,3,7" (1-based). Defaults to all pages.',
                  },
                },
              },
            },
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  filePath: {
                    type: 'string',
                    description: 'Absolute path to the PDF file on the server',
                  },
                  base64: {
                    type: 'string',
                    description: 'Base64 data URI of the PDF file (e.g. data:application/pdf;base64,...)',
                  },
                  scale: {
                    type: 'number',
                    description: 'Scale factor (default: 2). Higher values produce larger images.',
                    default: 2,
                  },
                  pages: {
                    type: 'string',
                    description:
                      'Pages to render: "all", a single number, or a range like "1-5" or "1,3,7" (1-based). Defaults to all pages.',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Rendered images as JSON with base64 data',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/toPngResult',
                },
              },
            },
          },
        },
      },
    },
    '/officeOxide:getMineruToken': {
      get: {
        summary: 'Get MinerU configuration',
        description: 'Returns the current MinerU token, category settings, OCR configuration, and base URL.',
        tags: ['Office Oxide'],
        responses: {
          200: {
            description: 'Current MinerU configuration',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: {
                      type: 'string',
                      description: 'MinerU API token (null if not set)',
                    },
                    mineruCategories: {
                      type: 'object',
                      description: 'Enabled MinerU processing categories',
                      properties: {
                        pdf: { type: 'boolean' },
                        word: { type: 'boolean' },
                        excel: { type: 'boolean' },
                        ppt: { type: 'boolean' },
                        image: { type: 'boolean' },
                      },
                    },
                    ocrConfig: {
                      $ref: '#/components/schemas/ocrConfig',
                    },
                    baseUrl: {
                      type: 'string',
                      description: 'MinerU API base URL',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/officeOxide:setMineruToken': {
      post: {
        summary: 'Update MinerU configuration',
        description: 'Sets the MinerU API token, category settings, OCR configuration, and/or base URL.',
        tags: ['Office Oxide'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  token: {
                    type: 'string',
                    description: 'MinerU API token',
                  },
                  mineruCategories: {
                    type: 'object',
                    description: 'MinerU processing categories to enable/disable',
                    properties: {
                      pdf: { type: 'boolean' },
                      word: { type: 'boolean' },
                      excel: { type: 'boolean' },
                      ppt: { type: 'boolean' },
                      image: { type: 'boolean' },
                    },
                  },
                  ocrConfig: {
                    $ref: '#/components/schemas/ocrConfig',
                  },
                  baseUrl: {
                    type: 'string',
                    description: 'MinerU API base URL',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Configuration updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: {
                      type: 'boolean',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      conversionResult: {
        type: 'object',
        description: 'Document conversion result',
        properties: {
          markdown: {
            type: 'string',
            description: 'Converted Markdown content (populated for toMarkdown)',
          },
          html: {
            type: 'string',
            description: 'Converted HTML content (populated for toHtml)',
          },
          error: {
            type: 'string',
            description: 'Error message if conversion failed, null on success',
            nullable: true,
          },
          resultField: {
            type: 'string',
            description: 'Which field contains the result: "markdown", "html", or "error"',
            enum: ['markdown', 'html', 'error'],
          },
        },
      },
      toPngResult: {
        type: 'object',
        description: 'PDF to PNG conversion result',
        properties: {
          images: {
            type: 'array',
            description: 'Rendered page images',
            items: {
              type: 'object',
              properties: {
                page: {
                  type: 'integer',
                  description: 'Page number (1-based)',
                },
                data: {
                  type: 'string',
                  description: 'Base64-encoded image data',
                },
                format: {
                  type: 'string',
                  description: 'Image format',
                  enum: ['png'],
                },
                width: {
                  type: 'integer',
                  description: 'Image width in pixels',
                },
                height: {
                  type: 'integer',
                  description: 'Image height in pixels',
                },
              },
            },
          },
          filenames: {
            type: 'array',
            description: 'Suggested filenames for each rendered page (e.g. ["myfile-page1.png"])',
            items: {
              type: 'string',
            },
          },
          pageCount: {
            type: 'integer',
            description: 'Total number of pages in the PDF',
          },
          renderedPages: {
            type: 'integer',
            description: 'Number of pages rendered',
          },
          error: {
            type: 'string',
            description: 'Error message if conversion failed, null on success',
            nullable: true,
          },
          resultField: {
            type: 'string',
            description: 'Which field contains the result: "images" or "error"',
            enum: ['images', 'error'],
          },
        },
      },
      ocrConfig: {
        type: 'object',
        description: 'OCR processing options',
        properties: {
          ocr: {
            type: 'boolean',
            description: 'Enable OCR for text recognition',
          },
          formula: {
            type: 'boolean',
            description: 'Enable formula parsing',
          },
          table: {
            type: 'boolean',
            description: 'Enable table recognition',
          },
        },
      },
    },
  },
};
