/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  message,
  Popconfirm,
  Space,
  Tabs,
  Upload,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, PictureOutlined } from '@ant-design/icons';
import { useAPIClient, useDataSourceManager, useCompile } from '@nocobase/client';
import { useTranslation } from 'react-i18next';
import { NAMESPACE } from './locale';
import {
  WordTemplateEditor,
  WordTemplateEditorHandle,
  PageSettings,
  HeaderFooterConfig,
  HeaderFooterItem,
} from './WordTemplateEditor';
import { ExcelTemplateEditor } from './ExcelTemplateEditor';
import { DEFAULT_FONTS } from './font-utils';
import { FONT_SIZES, FONT_SIZE_LABELS, LINE_HEIGHTS } from './quill-formats';

/** 字号可选项：与模板内容编辑器（Quill）一致，pt 值 + 中文号数显示 */
const FONT_SIZE_PT_OPTIONS = FONT_SIZES.map((s) => ({
  label: FONT_SIZE_LABELS[s] || s,
  value: parseFloat(s),
}));

/** 行间距可选项：与模板内容编辑器（Quill）一致 */
const LINE_HEIGHT_OPTIONS = LINE_HEIGHTS.map((lh) => ({ label: lh, value: parseFloat(lh) }));

/** 页眉/页脚默认字号（pt，小五）与服务端导出默认一致（sz=18 半磅） */
const HF_DEFAULT_FONT_SIZE = 9;
/** 页眉/页脚默认行间距（倍数） */
const HF_DEFAULT_LINE_HEIGHT = 1.5;

/** 新建 Word 模板的默认内容：一页空段落（Quill 空文档结构），保存时不强制先编辑内容 */
const DEFAULT_WORD_CONTENT = '<p><br></p>';

/** twips ↔ mm 转换：1 英寸 = 25.4 mm = 1440 twips */
const TWIPS_PER_MM = 1440 / 25.4;

/**
 * 以 mm 显示、以 twips 存储的边距输入组件。
 * 用户看到的是直观的毫米值，表单存储的是内部 twips 值。
 */
const MarginInput: React.FC<{
  value?: number;
  onChange?: (value: number | null) => void;
  direction: string;
}> = ({ value, onChange, direction }) => {
  const mmValue = value != null ? Math.round(value / TWIPS_PER_MM) : undefined;
  return (
    <InputNumber
      min={0}
      step={1}
      style={{ width: 78 }}
      addonBefore={direction}
      value={mmValue}
      onChange={(v) => {
        onChange?.(v != null ? Math.round(v * TWIPS_PER_MM) : null);
      }}
    />
  );
};

/**
 * 背景图配置组件（管理 pageSettings.background 整个对象）。
 * 图片读取为 dataURL 存入模板（导出 Word 时服务端直接内嵌，无需额外存储），
 * 限制 2MB 以内；上传时记录图片原始尺寸，供导出时计算「适应/裁剪」布局。
 */
const BackgroundImageInput: React.FC<{
  value?: PageSettings['background'];
  onChange?: (value: PageSettings['background']) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation(NAMESPACE);
  const update = (patch: Partial<NonNullable<PageSettings['background']>>) => {
    onChange?.({ size: 'stretch', opacity: 100, ...value, ...patch });
  };

  const handleUpload = (file: File) => {
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      message.error(t('Only PNG/JPEG images are supported'));
      return false;
    }
    if (file.size > 2 * 1024 * 1024) {
      message.error(t('Image size cannot exceed 2MB'));
      return false;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      // 读取图片原始尺寸，供导出 Word 时计算「适应/裁剪」模式的布局
      const img = new Image();
      img.onload = () => update({ image: dataUrl, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => update({ image: dataUrl, width: undefined, height: undefined });
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    return false; // 阻止 antd 默认上传行为
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Upload accept="image/png,image/jpeg" showUploadList={false} beforeUpload={handleUpload}>
          <Button icon={<UploadOutlined />}>{value?.image ? t('Replace Image') : t('Upload Image')}</Button>
        </Upload>
        {value?.image && (
          <>
            <img
              src={value.image}
              alt={t('Background preview')}
              style={{
                height: 40,
                maxWidth: 160,
                objectFit: 'contain',
                border: '1px solid #d9d9d9',
                borderRadius: 4,
              }}
            />
            <Button
              danger
              size="small"
              onClick={() => update({ image: undefined, width: undefined, height: undefined })}
            >
              {t('Remove')}
            </Button>
          </>
        )}
      </div>
      {value?.image && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 13, color: '#666' }}>{t('Display Mode')}</span>
            <Select
              style={{ width: 110 }}
              value={value.size ?? 'stretch'}
              onChange={(size) => update({ size })}
              options={[
                { label: t('Stretch'), value: 'stretch' },
                { label: t('Tile'), value: 'tile' },
                { label: t('Fit'), value: 'contain' },
                { label: t('Cover'), value: 'cover' },
              ]}
            />
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 13, color: '#666' }}>{t('Opacity')}</span>
            <InputNumber
              min={1}
              max={100}
              step={5}
              style={{ width: 90 }}
              value={value.opacity ?? 100}
              onChange={(v) => update({ opacity: v ?? 100 })}
              addonAfter="%"
            />
          </span>
        </div>
      )}
    </div>
  );
};

/** 转义 HTML 文本 */
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 页码占位符灰底样式（仅样式，不设 contenteditable=false；padding 极小，避免光标移出后视觉上仍困在灰底内） */
const HF_TOKEN_STYLE = 'background:#f0f0f0;color:#555;border-radius:3px;padding:0 1px;margin:0 2px;font-size:12px';

/** 页码/总页数占位符 HTML（普通 span + 灰底，非不可编辑元素；data-hf 仅作方向键识别的标记） */
const hfTokenHtml = (type: 'page' | 'pages') => `<span data-hf="${type}" style="${HF_TOKEN_STYLE}">{${type}}</span>`;

/**
 * 页眉/页脚片段列表 → 可编辑 HTML。
 * 页码/总页数输出为普通 span + 灰底（不设 contenteditable=false，非不可编辑元素）：
 * 光标可自由移动/删除/回车，编辑行为与普通文本一致；
 * 解析时以正则从文本中提取回片段，预览/导出时替换成实际数字。
 * 图片用原生 <img>（浏览器对 img 的前后光标与回车换行支持成熟）。
 */
const hfItemsToHtml = (items: HeaderFooterItem[]): string =>
  items
    .map((item) => {
      switch (item.type) {
        case 'text':
          return escapeHtml(item.text).replace(/\n/g, '<br>');
        case 'page':
          return hfTokenHtml('page');
        case 'pages':
          return hfTokenHtml('pages');
        case 'break':
          return '<br>';
        case 'image': {
          const w = item.width ?? 120;
          const h = item.height ?? 60;
          return (
            `<img data-hf="image" src="${escapeHtml(item.image)}" data-width="${w}" data-height="${h}" ` +
            `style="width:${w}px;height:${h}px;max-height:90px;object-fit:contain;vertical-align:middle;margin:0 2px;border:1px solid #eee;border-radius:4px" alt=""/>`
          );
        }
      }
    })
    .join('');

/** 可编辑 DOM → 片段列表（br/块级元素视为换行；页码占位从文本中按正则提取；清理空文本与尾部换行） */
const hfDomToItems = (root: HTMLElement): HeaderFooterItem[] => {
  const items: HeaderFooterItem[] = [];
  let textBuffer = '';
  /** 把累计的文本按 {page}/{pages} 拆分为 text/page/pages 片段 */
  const flushText = () => {
    const raw = textBuffer;
    textBuffer = '';
    if (!raw) return;
    for (const part of raw.split(/(\{page\}|\{pages\})/g)) {
      if (!part) continue;
      if (part === '{page}') items.push({ type: 'page' });
      else if (part === '{pages}') items.push({ type: 'pages' });
      else items.push({ type: 'text', text: part });
    }
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      textBuffer += node.textContent || '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === 'BR') {
      flushText();
      items.push({ type: 'break' });
      return;
    }
    if (el.tagName === 'IMG') {
      flushText();
      const src = el.getAttribute('src') || '';
      const w = parseFloat(el.getAttribute('data-width') || '');
      const h = parseFloat(el.getAttribute('data-height') || '');
      items.push({
        type: 'image',
        image: src,
        width: w > 0 ? w : undefined,
        height: h > 0 ? h : undefined,
      });
      return;
    }
    const isBlock = el.tagName === 'DIV' || el.tagName === 'P';
    const children = Array.from(el.childNodes);
    for (const child of children) walk(child);
    if (isBlock) {
      // Chrome 空段落占位 <div><br></div> 中的 br 已计入换行，不再额外补一个（否则多空行）
      const brOnly =
        children.length === 1 &&
        children[0].nodeType === Node.ELEMENT_NODE &&
        (children[0] as HTMLElement).tagName === 'BR';
      if (!brOnly) {
        flushText();
        items.push({ type: 'break' });
      }
    }
  };
  for (const child of Array.from(root.childNodes)) walk(child);
  flushText();
  // 清理：空文本片段、尾部换行（contentEditable 末尾常残留占位换行）
  const cleaned: HeaderFooterItem[] = items.filter(
    (it): it is HeaderFooterItem => !(it.type === 'text' && !it.text.trim()),
  );
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].type === 'break') cleaned.pop();
  return cleaned;
};

/** 记录折叠光标在根容器内的字符偏移（normalizeTokenSpans 改动 DOM 后用于恢复光标） */
const captureCaretOffset = (root: HTMLElement): number | null => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return null;
  const target = range.startContainer;
  if (target.nodeType !== Node.TEXT_NODE) return null;
  let acc = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    if (node === target) return acc + range.startOffset;
    acc += (node.textContent || '').length;
    node = walker.nextNode();
  }
  return null;
};

/** 按字符偏移恢复折叠光标（normalizeTokenSpans 只移动文本、不改字符顺序与总长，偏移仍然有效） */
const restoreCaretAtOffset = (root: HTMLElement, offset: number) => {
  const sel = window.getSelection();
  if (!sel) return;
  const textNodes: Node[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    textNodes.push(node);
    node = walker.nextNode();
  }
  let acc = 0;
  for (const n of textNodes) {
    const len = (n.textContent || '').length;
    if (acc + len >= offset) {
      const local = offset - acc;
      const parent = n.parentElement;
      const range = document.createRange();
      if (parent?.matches('span[data-hf]')) {
        // 光标落在灰底占位 span 的文本边界时，放到 span 外（避免后续输入被吸进占位符带灰底）
        if (local <= 0) range.setStartBefore(parent);
        else if (local >= len) range.setStartAfter(parent);
        else range.setStart(n, local);
      } else {
        range.setStart(n, local);
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    acc += len;
  }
  if (textNodes.length > 0) {
    const last = textNodes[textNodes.length - 1];
    const range = document.createRange();
    range.setStart(last, (last.textContent || '').length);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
};

/**
 * 规范化灰底占位 span 的内容：灰底只包住完整的 {page}/{pages}。
 * 用户在占位符前后输入/修改导致 span 内容变化时，把新增文字移出 span（恢复普通样式），
 * 占位符被改坏（非完整 token）时去掉灰底还原为普通文本（解析仍按正则识别其中的占位符）。
 */
const normalizeTokenSpans = (root: HTMLElement) => {
  root.querySelectorAll('span[data-hf]').forEach((span) => {
    const text = span.textContent || '';
    if (text === '{page}' || text === '{pages}') {
      // 完整占位符：确保 data-hf 与内容一致，规整为单一文本节点（编辑时浏览器会拆分）
      const hf = text === '{pages}' ? 'pages' : 'page';
      if (span.getAttribute('data-hf') !== hf) span.setAttribute('data-hf', hf);
      if (span.childNodes.length !== 1 || span.firstChild?.nodeType !== Node.TEXT_NODE) {
        span.textContent = text;
      }
      return;
    }
    // 完整 token 出现在 span 内容的最前或最后：保留 token 在 span 内（维持灰底），其余文字移到 span 外
    const startsWithToken = text.startsWith('{page}') ? '{page}' : text.startsWith('{pages}') ? '{pages}' : null;
    const endsWithToken = text.endsWith('{pages}') ? '{pages}' : text.endsWith('{page}') ? '{page}' : null;
    const token = startsWithToken ?? endsWithToken;
    if (token) {
      const hf = token === '{pages}' ? 'pages' : 'page';
      span.setAttribute('data-hf', hf);
      span.textContent = token;
      if (startsWithToken) {
        span.after(document.createTextNode(text.slice(token.length)));
      } else {
        span.before(document.createTextNode(text.slice(0, -token.length)));
      }
      return;
    }
    // 占位符被改坏：去掉灰底，还原为普通文本
    span.replaceWith(document.createTextNode(text));
  });
};

/**
 * 页眉/页脚配置组件（管理 pageSettings.header/footer 整个对象）。
 * 所见即所得：在一个文本框内直接输入文本（回车即换行），工具栏可插入图片 / 当前页码 {page} / 总页数 {pages}，
 * 页码占位即普通文本（可自由编辑/删除），内容解析为片段列表 items 存储；旧版纯文本（text 字段）自动兼容。
 */
const HeaderFooterInput: React.FC<{
  value?: HeaderFooterConfig;
  onChange?: (value: HeaderFooterConfig) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation(NAMESPACE);
  const apiClient = useAPIClient();
  const edRef = useRef<HTMLDivElement>(null);
  const [imgEditor, setImgEditor] = useState<{ src: string; width: number; height: number } | null>(null);
  // 字体白名单：与模板内容编辑器一致（默认 DEFAULT_FONTS，API 配置覆盖）
  const [fontList, setFontList] = useState<string[]>(DEFAULT_FONTS);
  const align = value?.align || 'center';

  // 组件挂载时从 API 加载字体白名单（与 WordTemplateEditor 同源）
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.request({ url: 'printTemplateFonts:get' });
        const data = res?.data?.data;
        if (data?.fontWhitelist && Array.isArray(data.fontWhitelist) && data.fontWhitelist.length > 0) {
          setFontList(data.fontWhitelist);
        }
      } catch {
        // API 失败时保持默认字体
      }
    })();
  }, [apiClient]);

  const valueItems: HeaderFooterItem[] = useMemo(
    () =>
      value?.items && value.items.length > 0
        ? value.items
        : (value?.text || '').split(/\r?\n/).map((line) => ({ type: 'text' as const, text: line })),
    [value],
  );

  /** 对外输出：保留字体/字号/行间距样式配置，过滤空文本片段 */
  const emit = (items: HeaderFooterItem[]) => {
    onChange?.({
      align,
      fontFamily: value?.fontFamily,
      fontSize: value?.fontSize,
      lineHeight: value?.lineHeight,
      items: items.filter((it) => !(it.type === 'text' && !it.text.trim())),
    });
  };

  /** 样式（字体/字号/行间距/对齐）变更：保留现有内容片段 */
  const updateStyle = (patch: Partial<HeaderFooterConfig>) => {
    const ed = edRef.current;
    onChange?.({
      ...value,
      ...patch,
      align,
      items: ed ? hfDomToItems(ed) : valueItems,
    });
  };

  const handleInput = () => {
    const ed = edRef.current;
    if (!ed) return;
    // 保持手动输入原样（输入什么显示什么）；仅当用户通过「页码/总页数」按钮插入的灰底占位
    // span 内容变化时，normalize 把占位符前后新增的文字移出 span，避免灰底蔓延，并恢复光标位置
    const caret = captureCaretOffset(ed);
    normalizeTokenSpans(ed);
    if (caret !== null) restoreCaretAtOffset(ed, caret);
    emit(hfDomToItems(ed));
  };

  // 外部 value 变化时同步 DOM（仅在内容不一致时重写，避免覆盖用户正在编辑的输入）
  const valueKey = useMemo(() => JSON.stringify(valueItems), [valueItems]);
  useEffect(() => {
    const ed = edRef.current;
    if (!ed) return;
    if (JSON.stringify(hfDomToItems(ed)) !== valueKey) {
      ed.innerHTML = hfItemsToHtml(valueItems);
    }
  }, [valueKey, valueItems]);

  /** 在光标处插入 HTML（图片上传用，光标留在内容后） */
  const insertHtml = (html: string) => {
    const ed = edRef.current;
    if (!ed) return;
    ed.focus();
    document.execCommand('insertHTML', false, html);
    handleInput();
  };

  /** 插入页码/总页数占位：光标处插入纯文本 {page}/{pages}（与普通文本一致，可自由编辑/删除），光标落在其后 */
  const insertToken = (type: 'page' | 'pages') => {
    const ed = edRef.current;
    if (!ed) return;
    ed.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      document.execCommand('insertHTML', false, `{${type}}`);
      handleInput();
      return;
    }
    const range = sel.getRangeAt(0);
    // 若选中了内容（如图片块），折叠到选区末尾
    if (!range.collapsed) {
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    // 插入灰底占位 {page}/{pages}（普通 span，可自由编辑/删除/移动光标），光标落在其后
    const token = document.createElement('span');
    token.setAttribute('data-hf', type);
    token.style.cssText = HF_TOKEN_STYLE;
    token.textContent = `{${type}}`;
    range.insertNode(token);
    const after = document.createRange();
    after.setStartAfter(token);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    handleInput();
  };

  /** 右键点击：Chrome 默认不移动光标（光标会困在原处，如灰底占位内），这里手动把光标移到点击处 */
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 2) return;
    if ((e.target as HTMLElement).closest('img[data-hf="image"]')) return; // 图片交给点击弹窗
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (range) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  /** 键盘处理：
   * - Enter：光标前/后紧邻图片时，浏览器默认会在其后插入空段落（多出空行），改为手动插入 <br>（软换行）；
   * - ArrowRight/ArrowLeft：光标在灰底占位 span 内文本的边界时，Chrome 会把光标停在 span 内，手动跨出 span。
   * 其余情况（含普通文本）交给浏览器默认处理。 */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;
    const container = range.startContainer;

    // 方向键跨出灰底占位 span：光标位于 span 内文本的最前/最后位置时，Chrome 会把光标停在 span 内，这里手动移到 span 外
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      let span: HTMLElement | null = null;
      let atStart = false;
      let atEnd = false;
      if (container.nodeType === Node.TEXT_NODE) {
        const t = container as Text;
        span = t.parentElement;
        atStart = t.previousSibling === null && range.startOffset <= 0;
        atEnd = t.nextSibling === null && range.startOffset >= t.length;
      } else if (container.nodeType === Node.ELEMENT_NODE && (container as HTMLElement).matches('span[data-hf]')) {
        span = container as HTMLElement;
        atStart = range.startOffset <= 0;
        atEnd = range.startOffset >= span.childNodes.length;
      }
      if (span && span.matches('span[data-hf]')) {
        if (e.key === 'ArrowRight' && atEnd) {
          e.preventDefault();
          const after = document.createRange();
          after.setStartAfter(span);
          after.collapse(true);
          sel.removeAllRanges();
          sel.addRange(after);
        } else if (e.key === 'ArrowLeft' && atStart) {
          e.preventDefault();
          const before = document.createRange();
          before.setStartBefore(span);
          before.collapse(true);
          sel.removeAllRanges();
          sel.addRange(before);
        }
      }
      return;
    }

    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    const containerNode = container;
    let prev: Node | null = null;
    let next: Node | null = null;
    if (containerNode.nodeType === Node.TEXT_NODE) {
      prev = containerNode.previousSibling;
      next = containerNode.nextSibling;
    } else {
      prev = containerNode.childNodes[range.startOffset - 1] ?? null;
      next = containerNode.childNodes[range.startOffset] ?? null;
    }
    const isImage = (n: Node | null) =>
      !!n && n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).matches('img[data-hf="image"]');
    if (!isImage(prev) && !isImage(next)) return;
    e.preventDefault();
    const br = document.createElement('br');
    range.insertNode(br);
    const after = document.createRange();
    after.setStartAfter(br);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    handleInput();
  };

  /** 上传图片：读取 dataURL + 原始尺寸，默认显示宽不超过 200px（等比），插入光标处 */
  const handleImageUpload = (file: File) => {
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      message.error(t('Only PNG/JPEG images are supported'));
      return false;
    }
    if (file.size > 2 * 1024 * 1024) {
      message.error(t('Image size cannot exceed 2MB'));
      return false;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      const build = (width: number, height: number) => {
        // 直接插入原生 <img>（不包 contenteditable=false）：保证图片前后可正常放置光标与回车换行
        const node = `<img data-hf="image" src="${escapeHtml(
          dataUrl,
        )}" data-width="${width}" data-height="${height}" style="width:${width}px;height:${height}px;max-height:90px;object-fit:contain;vertical-align:middle;margin:0 2px;border:1px solid #eee;border-radius:4px" alt=""/>`;
        insertHtml(node);
      };
      img.onload = () => {
        const width = Math.min(img.naturalWidth, 200);
        const height = img.naturalWidth > 0 ? Math.round((width * img.naturalHeight) / img.naturalWidth) : 50;
        build(width, height);
      };
      img.onerror = () => build(200, 50);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    return false; // 阻止 antd 默认上传行为
  };

  /** 点击图片 → 打开尺寸/删除弹窗 */
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const img = (e.target as HTMLElement).closest('img[data-hf="image"]') as HTMLImageElement | null;
    if (!img) return;
    e.preventDefault();
    setImgEditor({
      src: img.src,
      width: parseFloat(img.getAttribute('data-width') || '') || 120,
      height: parseFloat(img.getAttribute('data-height') || '') || 60,
    });
  };

  /** 按 src 查找编辑器内的图片元素 */
  const findImageBySrc = (src: string): HTMLImageElement | null => {
    const ed = edRef.current;
    if (!ed) return null;
    let target: HTMLImageElement | null = null;
    ed.querySelectorAll('img[data-hf="image"]').forEach((im) => {
      if ((im as HTMLImageElement).src === src) target = im as HTMLImageElement;
    });
    return target;
  };

  const applyImage = () => {
    if (!imgEditor) return;
    const target = findImageBySrc(imgEditor.src);
    if (target) {
      target.setAttribute('data-width', String(imgEditor.width));
      target.setAttribute('data-height', String(imgEditor.height));
      target.style.width = `${imgEditor.width}px`;
      target.style.height = `${imgEditor.height}px`;
    }
    setImgEditor(null);
    handleInput();
  };

  const removeImage = () => {
    if (!imgEditor) return;
    findImageBySrc(imgEditor.src)?.remove();
    setImgEditor(null);
    handleInput();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 工具条：内容（图片/页码/总页数）+ 样式（字体/字号/行间距/对齐） */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Space size={4} wrap>
          <Upload accept="image/png,image/jpeg" showUploadList={false} beforeUpload={handleImageUpload}>
            <Button size="small" icon={<PictureOutlined />}>
              {t('Image')}
            </Button>
          </Upload>
          <Button size="small" onClick={() => insertToken('page')}>
            {t('Page Number')}
          </Button>
          <Button size="small" onClick={() => insertToken('pages')}>
            {t('Total Pages')}
          </Button>
        </Space>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 13, color: '#666' }}>{t('Font')}</span>
            <Select
              size="small"
              style={{ width: 140 }}
              value={value?.fontFamily || ''}
              onChange={(v) => updateStyle({ fontFamily: v || undefined })}
              options={[{ label: t('Default Font'), value: '' }, ...fontList.map((f) => ({ label: f, value: f }))]}
            />
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 13, color: '#666' }}>{t('Font Size')}</span>
            <Select
              size="small"
              style={{ width: 84 }}
              value={value?.fontSize ?? HF_DEFAULT_FONT_SIZE}
              onChange={(v) => updateStyle({ fontSize: v })}
              options={FONT_SIZE_PT_OPTIONS}
            />
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 13, color: '#666' }}>{t('Line Spacing')}</span>
            <Select
              size="small"
              style={{ width: 76 }}
              value={value?.lineHeight ?? HF_DEFAULT_LINE_HEIGHT}
              onChange={(v) => updateStyle({ lineHeight: v })}
              options={LINE_HEIGHT_OPTIONS}
            />
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 13, color: '#666' }}>{t('Alignment')}</span>
            <Select
              size="small"
              style={{ width: 90 }}
              value={align}
              onChange={(v) => updateStyle({ align: v })}
              options={[
                { label: t('Left'), value: 'left' },
                { label: t('Center'), value: 'center' },
                { label: t('Right'), value: 'right' },
              ]}
            />
          </span>
        </span>
      </div>
      {/* 富文本编辑区：直接输入文本，插入的图片/页码以块形式显示 */}
      <div
        ref={edRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onClick={handleEditorClick}
        style={{
          minHeight: 64,
          maxHeight: 130,
          overflowY: 'auto',
          border: '1px solid #d9d9d9',
          borderRadius: 6,
          padding: '6px 10px',
          fontFamily: value?.fontFamily || 'Helvetica, "Microsoft YaHei", sans-serif',
          fontSize: `${value?.fontSize ?? HF_DEFAULT_FONT_SIZE}pt`,
          lineHeight: value?.lineHeight ?? HF_DEFAULT_LINE_HEIGHT,
          textAlign: align,
          outline: 'none',
          cursor: 'text',
        }}
      />
      {/* 图片设置弹窗（点击图片打开） */}
      <Modal
        title={t('Image Settings')}
        open={!!imgEditor}
        onOk={applyImage}
        onCancel={() => setImgEditor(null)}
        width={360}
      >
        {imgEditor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <img
              src={imgEditor.src}
              alt=""
              style={{ maxHeight: 120, objectFit: 'contain', border: '1px solid #eee', borderRadius: 6 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ whiteSpace: 'nowrap' }}>{t('Width')}</span>
              <InputNumber
                min={10}
                max={500}
                style={{ width: 100 }}
                addonAfter="px"
                value={imgEditor.width}
                onChange={(v) => {
                  const w = v ?? 120;
                  const h =
                    imgEditor.height && imgEditor.width
                      ? Math.round((imgEditor.height * w) / imgEditor.width)
                      : imgEditor.height;
                  setImgEditor({ ...imgEditor, width: w, height: h });
                }}
              />
              <Button danger size="small" onClick={removeImage}>
                {t('Remove')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

/**
 * 模板数据接口
 */
interface Template {
  id: number;
  name: string;
  type: string;
  collectionName: string;
  enabled: boolean;
  content: string;
  variables: any[];
  pageSettings?: PageSettings;
  description: string;
  createdAt: string;
}

/**
 * 模板管理列表页组件。
 * 功能包括：
 * - 模板列表的增删改查
 * - Word/Excel 模板编辑器集成
 * - 数据源和数据表信息展示
 */
export const TemplateListPage: React.FC = () => {
  const { t } = useTranslation(NAMESPACE);
  const [data, setData] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [form] = Form.useForm();
  const apiClient = useAPIClient();
  const dm = useDataSourceManager();
  const compile = useCompile();
  const wordEditorRef = useRef<WordTemplateEditorHandle>(null);

  // 通过 API 获取数据表列表
  const [collections, setCollections] = useState<any[]>([]);
  const fetchCollections = useCallback(async () => {
    try {
      // appends=category 带出数据表的分类信息，用于分组展示
      const res = await apiClient.request({
        url: 'collections:list',
        params: { appends: ['category'], paginate: false },
      });
      setCollections(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch collections', err);
    }
  }, [apiClient]);

  // 组件挂载时加载数据表列表
  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  // 构建按分类分组的数据表选项
  // collections 通过 API 的 appends=category 带出分类信息，
  // category 是 belongsToMany 关联，格式为 [{ id, name, color }]
  const groupedCollectionOptions = useMemo(() => {
    const groups: Record<string, { category: string; children: { label: string; value: string }[] }> = {};
    collections.forEach((c: any) => {
      const catName = c.category?.[0]?.name || t('Others');
      if (!groups[catName]) {
        groups[catName] = { category: catName, children: [] };
      }
      groups[catName].children.push({
        label: `${c?.title || c.name} (${c.name})`,
        value: c.name,
      });
    });
    return Object.values(groups);
  }, [collections, t]);

  // 分类筛选状态（空字符串 = 全部）
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // 分类下拉选项
  const categoryOptions = useMemo(() => {
    return [
      { label: t('All'), value: '' },
      ...groupedCollectionOptions.map((g) => ({
        label: g.category,
        value: g.category,
      })),
    ];
  }, [groupedCollectionOptions, t]);

  // 根据选中分类筛选后的数据表选项（扁平列表，不再用 OptGroup）
  const filteredCollectionOptions = useMemo(() => {
    if (!selectedCategory) {
      return groupedCollectionOptions.flatMap((g) => g.children);
    }
    return groupedCollectionOptions.find((g) => g.category === selectedCategory)?.children || [];
  }, [groupedCollectionOptions, selectedCategory]);

  // 分类变化时，如果当前选中的数据表不属于新分类，则清空
  const handleCategoryChange = useCallback(
    (cat: string) => {
      setSelectedCategory(cat);
      const colName = form.getFieldValue('collectionName');
      if (colName) {
        const isInCategory = groupedCollectionOptions
          .filter((g) => !cat || g.category === cat)
          .some((g) => g.children.some((c) => c.value === colName));
        if (!isInCategory) {
          form.setFieldValue('collectionName', undefined);
        }
      }
    },
    [form, groupedCollectionOptions],
  );

  // 构建 dataSourceName -> displayName 的映射，用于数据源列展示
  const dataSourceDisplayMap = useMemo(() => {
    const map: Record<string, string> = {};
    collections.forEach((c: any) => {
      const dsKey = c.dataSource || c.options?.dataSource || 'main';
      if (!map[dsKey]) {
        const ds = dm?.getDataSource(dsKey);
        map[dsKey] = compile(ds?.displayName || dsKey);
      }
    });
    return map;
  }, [collections, dm, compile]);

  // 构建 collectionName -> dataSourceKey 的映射，用于数据源列的快速查找
  const collectionDataSourceMap = useMemo(() => {
    const map: Record<string, string> = {};
    collections.forEach((c: any) => {
      map[c.name] = c.dataSource || c.options?.dataSource || 'main';
    });
    return map;
  }, [collections]);

  // 构建 collectionName -> title 的映射
  const collectionTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    collections.forEach((c: any) => {
      map[c.name] = c.title || c.options?.title || c.name;
    });
    return map;
  }, [collections]);

  /** 加载模板列表 */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.request({ url: 'printTemplates:list' });
      setData(res.data?.data || []);
    } catch {
      message.error(t('Failed to load templates'));
    } finally {
      setLoading(false);
    }
  }, [apiClient, t]);

  // 组件挂载时加载数据
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** 打开新建模板弹窗 */
  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    form.setFieldsValue({
      enabled: true,
      type: 'word',
      pageSettings: {
        paperSize: 'A4',
        orientation: 'portrait',
        margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
      },
    });
    setModalVisible(true);
  };

  /** 打开编辑模板弹窗 */
  const handleEdit = (record: Template) => {
    setEditingTemplate(record);
    form.setFieldsValue({
      ...record,
      pageSettings: {
        ...record.pageSettings,
        margins: {
          top: 1440,
          bottom: 1440,
          left: 1440,
          right: 1440,
          ...(record.pageSettings?.margins || {}),
        },
      },
    });
    setModalVisible(true);
  };

  /** 删除模板 */
  const handleDelete = async (id: number) => {
    try {
      await apiClient.request({ url: `printTemplates:destroy/${id}`, method: 'post' });
      message.success(t('Deleted'));
      fetchData();
    } catch {
      message.error(t('Failed to delete'));
    }
  };

  /** 保存模板（新增或更新） */
  const doSave = useCallback(
    async (keepOpen?: boolean) => {
      try {
        const values = await form.validateFields();
        // Word 模板：确保从编辑器 DOM 直接读取内容，避免 Quill 的 getSemanticHTML() 丢失自定义 blot HTML；
        // 无内容时写入预设的一页空结构（新建模板无需先编辑内容即可保存，之后编辑再更新）
        if (values.type === 'word') {
          values.content = wordEditorRef.current?.getHTML() || values.content || DEFAULT_WORD_CONTENT;
        }
        if (!values.content) {
          message.warning(t('Please edit template content'));
          return;
        }

        if (editingTemplate) {
          await apiClient.request({
            url: `printTemplates:update/${editingTemplate.id}`,
            method: 'post',
            data: values,
          });
          message.success(t('Updated'));
        } else {
          const res = await apiClient.request({
            url: 'printTemplates:create',
            method: 'post',
            data: values,
          });
          message.success(t('Created'));
          if (keepOpen) {
            // 首次暂存后绑定主键，后续点击不再重复创建
            const created = res?.data?.data;
            if (created?.id) {
              setEditingTemplate(created);
            }
          }
        }
        if (!keepOpen) {
          setModalVisible(false);
        }
        fetchData();
      } catch (err: any) {
        const action = keepOpen ? t('Save Draft') : t('Save');
        // 尝试多种错误格式：Ant Design 表单校验 / Axios API / 标准 Error
        const detail =
          err.errorFields?.[0]?.errors?.[0] ||
          err.response?.data?.errors?.[0]?.message ||
          err.message ||
          t('Unknown error');
        message.error(`${action}${t('failed')}: ${detail}`);
      }
    },
    [form, editingTemplate, apiClient, t, wordEditorRef, fetchData],
  );

  const handleSave = useCallback(() => doSave(false), [doSave]);
  const handleDraftSave = useCallback(() => doSave(true), [doSave]);

  /**
   * 切页自动保存：把当前内容静默持久化到后端，防止编辑过程中数据丢失。
   * 与 doSave 不同：不强制校验表单（名称等字段未填时失败也静默跳过，
   * 不打断编辑；新建模板首次成功后会绑定主键，后续切页直接 update）。
   */
  const handleAutoSave = useCallback(async () => {
    try {
      const values = form.getFieldsValue();
      if (values.type === 'word') {
        values.content = wordEditorRef.current?.getHTML() || values.content || '';
      }
      if (!values.content) return;
      if (editingTemplate) {
        await apiClient.request({
          url: `printTemplates:update/${editingTemplate.id}`,
          method: 'post',
          data: values,
        });
      } else {
        const res = await apiClient.request({
          url: 'printTemplates:create',
          method: 'post',
          data: values,
        });
        const created = res?.data?.data;
        if (created?.id) {
          setEditingTemplate(created);
        }
      }
      fetchData();
    } catch {
      // 静默失败：表单未填写完整等场景下不打断编辑，下次切页会重试
    }
  }, [form, editingTemplate, apiClient, wordEditorRef, fetchData]);

  // 表格列定义
  const columns = [
    { title: t('Name'), dataIndex: 'name', key: 'name' },
    {
      title: t('Type'),
      dataIndex: 'type',
      key: 'type',
      render: (v: string) => (v === 'word' ? t('Word') : t('Excel')),
    },
    {
      title: t('Data source'),
      dataIndex: 'collectionName',
      key: 'dataSource',
      render: (collectionName: string) => {
        const dsKey = collectionDataSourceMap[collectionName] || 'main';
        return dataSourceDisplayMap[dsKey] || dsKey;
      },
    },
    {
      title: t('Collection title'),
      dataIndex: 'collectionName',
      key: 'collectionTitle',
      render: (collectionName: string) => collectionTitleMap[collectionName] || collectionName,
    },
    {
      title: t('Collection name'),
      dataIndex: 'collectionName',
      key: 'collectionName',
    },
    {
      title: t('Enabled'),
      dataIndex: 'enabled',
      key: 'enabled',
      render: (v: boolean) => (v ? t('Yes') : t('No')),
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: any, record: Template) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)} />
          <Popconfirm title={t('Delete?')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 监听模板类型切换，用于条件渲染 Word/Excel 编辑器
  const templateType = Form.useWatch('type', form);
  // 监听页面设置变化，传递给编辑器更新纸张引导框
  const pageSettings = Form.useWatch('pageSettings', form);
  const paperSizeValue = pageSettings?.paperSize;

  // 切换为 Custom 时，自动填充默认宽高值（mm）
  useEffect(() => {
    if (paperSizeValue === 'Custom') {
      const currentPS = form.getFieldValue('pageSettings') || {};
      if (!currentPS.customWidth && !currentPS.customHeight) {
        form.setFieldsValue({
          pageSettings: {
            ...currentPS,
            customWidth: 210,
            customHeight: 297,
          },
        });
      }
    }
  }, [paperSizeValue, form]);

  return (
    <div style={{ padding: 24 }}>
      {/* 页面标题 + 新建按钮 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>{t('Templates')}</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          {t('New Template')}
        </Button>
      </div>

      {/* 模板列表表格 */}
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} />

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editingTemplate ? t('Edit Template') : t('New Template')}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        width={1200}
        destroyOnClose
        footer={(_, { OkBtn, CancelBtn }) => (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={handleDraftSave}>{t('Save Draft')}</Button>
            <Space>
              <CancelBtn />
              <OkBtn />
            </Space>
          </div>
        )}
      >
        <Form form={form} layout="vertical">
          <Tabs
            items={[
              {
                key: 'basic',
                label: t('Basic Info'),
                children: (
                  <>
                    {/* 模板名称 */}
                    <Form.Item name="name" label={t('Name')} rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>

                    {/* 模板类型 */}
                    <Form.Item name="type" label={t('Type')} rules={[{ required: true }]}>
                      <Select
                        options={[
                          { label: t('Word'), value: 'word' },
                          { label: t('Excel'), value: 'excel' },
                        ]}
                      />
                    </Form.Item>

                    {/* 分类 + 关联数据表（一行排列） */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                      <Form.Item label={t('Category')} style={{ flex: '0 0 200px' }}>
                        <Select
                          allowClear
                          placeholder={t('All')}
                          value={selectedCategory}
                          onChange={handleCategoryChange}
                          options={categoryOptions}
                        />
                      </Form.Item>
                      <Form.Item
                        name="collectionName"
                        label={t('Collection')}
                        rules={[{ required: true }]}
                        style={{ flex: 1 }}
                      >
                        <Select
                          showSearch
                          placeholder={t('Select a collection')}
                          filterOption={(input, option) =>
                            (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                          }
                          options={filteredCollectionOptions}
                        />
                      </Form.Item>
                    </div>

                    {/* 描述 */}
                    <Form.Item name="description" label={t('Description')}>
                      <Input.TextArea rows={2} />
                    </Form.Item>

                    {/* 启用开关 */}
                    <Form.Item name="enabled" label={t('Enabled')} valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'pageSettings',
                label: t('Page Settings'),
                children:
                  templateType === 'word' ? (
                    <>
                      {/* 纸张 / 方向 / 自定义尺寸 / 边距 */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        {/* 纸张大小 */}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 13, color: '#666' }}>{t('Paper')}</span>
                          <Form.Item name={['pageSettings', 'paperSize']} style={{ marginBottom: 0 }}>
                            <Select
                              style={{ width: 100 }}
                              options={[
                                { label: 'A4', value: 'A4' },
                                { label: 'A3', value: 'A3' },
                                { label: 'Letter', value: 'Letter' },
                                { label: 'Legal', value: 'Legal' },
                                { label: 'A5', value: 'A5' },
                                { label: 'B5', value: 'B5' },
                                { label: t('Custom'), value: 'Custom' },
                              ]}
                            />
                          </Form.Item>
                        </span>
                        {/* 方向 */}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 13, color: '#666' }}>{t('Orientation')}</span>
                          <Form.Item name={['pageSettings', 'orientation']} style={{ marginBottom: 0 }}>
                            <Select
                              style={{ width: 90 }}
                              options={[
                                { label: t('Portrait'), value: 'portrait' },
                                { label: t('Landscape'), value: 'landscape' },
                              ]}
                            />
                          </Form.Item>
                        </span>
                        {/* 自定义纸张尺寸 */}
                        {paperSizeValue === 'Custom' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                            <Form.Item name={['pageSettings', 'customWidth']} style={{ marginBottom: 0 }}>
                              <InputNumber
                                min={1}
                                max={2000}
                                step={1}
                                style={{ width: 100 }}
                                addonAfter={t('mm')}
                                placeholder="210"
                              />
                            </Form.Item>
                            <span style={{ fontSize: 13, color: '#666' }}>×</span>
                            <Form.Item name={['pageSettings', 'customHeight']} style={{ marginBottom: 0 }}>
                              <InputNumber
                                min={1}
                                max={2000}
                                step={1}
                                style={{ width: 100 }}
                                addonAfter={t('mm')}
                                placeholder="297"
                              />
                            </Form.Item>
                          </span>
                        )}
                        {/* 边距 */}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 13, color: '#666', marginRight: 2 }}>{t('Margins')}</span>
                          <Form.Item name={['pageSettings', 'margins', 'top']} style={{ marginBottom: 0 }}>
                            <MarginInput direction="↑" />
                          </Form.Item>
                          <Form.Item name={['pageSettings', 'margins', 'bottom']} style={{ marginBottom: 0 }}>
                            <MarginInput direction="↓" />
                          </Form.Item>
                          <Form.Item name={['pageSettings', 'margins', 'left']} style={{ marginBottom: 0 }}>
                            <MarginInput direction="←" />
                          </Form.Item>
                          <Form.Item name={['pageSettings', 'margins', 'right']} style={{ marginBottom: 0 }}>
                            <MarginInput direction="→" />
                          </Form.Item>
                          <span style={{ fontSize: 12, color: '#999' }}>mm</span>
                        </span>
                      </div>

                      {/* 页眉/页脚与背景（一次配置所有页面生效） */}
                      <div
                        style={{
                          marginTop: 12,
                          paddingTop: 12,
                          borderTop: '1px dashed #e8e8e8',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 0,
                        }}
                      >
                        <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
                          {t('Header/Footer & Background')}
                          <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
                            {t(
                              'Applies to all pages. Supports {fieldName} variables and {page} / {pages} for page numbers.',
                            )}
                          </span>
                        </div>
                        {/* 页眉：片段编辑（文本/图片/页码/换行）+ 对齐 */}
                        <Form.Item name={['pageSettings', 'header']} label={t('Header')} style={{ marginBottom: 12 }}>
                          <HeaderFooterInput />
                        </Form.Item>
                        {/* 页脚：片段编辑（文本/图片/页码/换行）+ 对齐 */}
                        <Form.Item name={['pageSettings', 'footer']} label={t('Footer')} style={{ marginBottom: 12 }}>
                          <HeaderFooterInput />
                        </Form.Item>
                        {/* 背景图：上传 + 显示方式 + 不透明度 */}
                        <Form.Item name={['pageSettings', 'background']} label={t('Background Image')}>
                          <BackgroundImageInput />
                        </Form.Item>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#999' }}>{t('Page settings only apply to Word templates')}</div>
                  ),
              },
              {
                key: 'content',
                label: t('Template Content'),
                children: (
                  <Form.Item label={t('Edit Template')}>
                    {templateType === 'word' ? (
                      <WordTemplateEditor
                        ref={wordEditorRef}
                        form={form}
                        pageSettings={pageSettings}
                        onPageChange={handleAutoSave}
                      />
                    ) : (
                      <ExcelTemplateEditor form={form} />
                    )}
                  </Form.Item>
                ),
              },
            ]}
          />

          {/* 隐藏字段：模板内容（由编辑器组件内部管理） */}
          <Form.Item name="content" label={t('Template Content')} style={{ display: 'none' }}>
            <Input />
          </Form.Item>

          {/* 隐藏字段：变量列表 */}
          <Form.Item name="variables" label={t('Variables')} style={{ display: 'none' }}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
