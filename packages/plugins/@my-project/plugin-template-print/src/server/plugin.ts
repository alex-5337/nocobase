import './blob-polyfill';
import { Plugin } from '@nocobase/server';
import archiver from 'archiver';
import ExcelJS from 'exceljs';
// @ts-ignore
import htmlDocx from 'html-docx-js/dist/html-docx';

function extractFieldValue(data: Record<string, any>, fieldPath: string): any {
  return fieldPath.split('.').reduce((obj, key) => (obj != null ? obj[key] : undefined), data);
}

function replaceVariables(html: string, data: Record<string, any>): string {
  // Match {placeholder} where placeholder may contain inner HTML tags (e.g. from Quill editor).
  // Non-greedy match to handle the shortest {…} span, then strip inner HTML tags to get the field name.
  return html.replace(/{([\s\S]*?)}/g, (_match, inner) => {
    const fieldPath = inner.replace(/<[^>]*>/g, '').replace(/[{}]/g, '').trim();
    if (!fieldPath) return _match;
    const value = extractFieldValue(data, fieldPath);
    return value != null ? String(value) : '';
  });
}

async function renderWord(
  templateContent: string,
  records: Record<string, any>[],
  variables: { placeholder: string; fieldPath: string; defaultValue?: string }[],
): Promise<Buffer> {
  if (records.length === 1) {
    const filledHtml = replaceVariables(templateContent, records[0]);
    const docxBuffer = htmlDocx.asBlob(filledHtml, {
      orientation: 'portrait',
      margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
    });
    return Buffer.from(await docxBuffer.arrayBuffer());
  }

  // Multiple records: render each as a separate page, ZIP together
  const archive = archiver('zip', { zlib: { level: 9 } });
  const buffers: { name: string; data: Buffer }[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const filledHtml = replaceVariables(templateContent, record);
    const docxBlob = htmlDocx.asBlob(filledHtml, {
      orientation: 'portrait',
      margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
    });
    const buf = Buffer.from(await docxBlob.arrayBuffer());
    buffers.push({ name: `record_${i + 1}.docx`, data: buf });
  }

  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => {
      // 将 Buffer 数组转换为 Uint8Array 数组以满足类型要求
      const uint8Arrays = chunks.map((chunk) => new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      resolve(Buffer.concat(uint8Arrays));
    });
    archive.on('error', reject);

    for (const b of buffers) {
      archive.append(b.data, { name: b.name });
    }
    archive.finalize();
  });
}

async function renderExcel(
  templateContent: string,
  records: Record<string, any>[],
  variables: { placeholder: string; fieldPath: string; defaultValue?: string }[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Parse template JSON
  const templateConfig = JSON.parse(templateContent);
  const sheetName = templateConfig.sheetName || 'Sheet1';
  const worksheet = workbook.addWorksheet(sheetName);

  // Write static headers
  if (templateConfig.columns) {
    const headerRow = worksheet.getRow(1);
    templateConfig.columns.forEach((col: any, colIndex: number) => {
      const cell = headerRow.getCell(colIndex + 1);
      cell.value = col.label || '';
      cell.font = { bold: true };
    });

    // Fill data rows starting from row 2
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const row = worksheet.getRow(i + 2);

      templateConfig.columns.forEach((col: any, colIndex: number) => {
        const cell = row.getCell(colIndex + 1);
        if (col.isSequence) {
          cell.value = i + 1;
        } else if (col.fieldPath) {
          const value = extractFieldValue(record, col.fieldPath);
          cell.value = value != null ? value : col.defaultValue ?? '';
        }
      });
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export class PluginTemplatePrintServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {
    this.db.collection({
      name: 'printTemplates',
      title: 'Print Templates',
      filterTargetKey: 'id',
      fields: [
        { type: 'string', name: 'name', title: 'Template Name' },
        { type: 'string', name: 'type', title: 'Type' },
        { type: 'string', name: 'collectionName', title: 'Collection Name' },
        { type: 'text', name: 'content', title: 'Template Content', length: 'long' },
        { type: 'json', name: 'variables', title: 'Variables' },
        { type: 'text', name: 'description', title: 'Description' },
        { type: 'boolean', name: 'enabled', title: 'Enabled', defaultValue: true },
      ],
    });
  }

  async load() {
    this.app.resourceManager.registerActionHandlers({
      'printTemplates:render': async (ctx, next) => {
        const { templateId, recordIds } = ctx.action.params.values || ctx.action.params;

        if (!templateId) {
          ctx.throw(400, 'Template ID is required');
        }

        const validRecordIds = Array.isArray(recordIds) ? recordIds.filter((id) => id != null) : [];
        if (validRecordIds.length === 0) {
          ctx.throw(400, 'Record IDs are required');
        }

        const repo = ctx.db.getRepository('printTemplates');
        const template = await repo.findOne({ filterByTk: templateId });

        if (!template) {
          ctx.throw(404, 'Template not found');
        }

        // Query target collection records
        const targetRepo = ctx.db.getRepository(template.collectionName);
        const records = await targetRepo.find({
          filter: { id: validRecordIds },
          appends: ctx.action.params.appends || [],
        });

        if (!records || records.length === 0) {
          ctx.throw(404, 'No records found');
        }

        const variables = template.variables || [];
        const plainRecords = records.map((r: any) => (r.toJSON ? r.toJSON() : r));

        let buffer: Buffer;
        let contentType: string;
        let filename: string;

        if (template.type === 'word') {
          buffer = await renderWord(template.content, plainRecords, variables);
          if (plainRecords.length > 1) {
            contentType = 'application/zip';
            filename = `${template.name}_records.zip`;
          } else {
            contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            filename = `${template.name}_${plainRecords[0].id || 'document'}.docx`;
          }
        } else {
          buffer = await renderExcel(template.content, plainRecords, variables);
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          filename = `${template.name}.xlsx`;
        }

        ctx.set('Content-Type', contentType);
        ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        ctx.body = buffer;
        await next();
      },
    });

    this.app.acl.allow('printTemplates', '*', 'loggedIn');
  }

  async install() {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginTemplatePrintServer;
