/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Form } from 'antd';
import ReactQuill from 'react-quill-new';
import Quill from 'quill';
import QuillTableBetter from 'quill-table-better';
import 'react-quill-new/dist/quill.snow.css';
import 'quill-table-better/dist/quill-table-better.css';
import { useTranslation } from 'react-i18next';
import { useAPIClient } from '@nocobase/client';
import { NAMESPACE } from './locale';
import { CollectionFieldPicker } from './CollectionFieldPicker';
import { QrcodeInsertModal, type QrcodeConfig } from './QrcodeInsertModal';
import { generateQrcodePlaceholderHTML, getConfigFromImg, QRCODE_ICON_SVG } from './qrcode-utils';
import { registerFonts, DEFAULT_FONTS } from './font-utils';

// 注册 quill-table-better 模块
Quill.register({ 'modules/table-better': QuillTableBetter }, true);

// 注册默认字体白名单（模块加载时执行），确保首次渲染就有可用字体
registerFonts(DEFAULT_FONTS);

/**
 * 注册一个虚拟 blot，使 Quill 工具栏将 'qrcode' 识别为已知格式，
 * 从而不会将二维码按钮置灰（disabled）。
 */
const Embed = Quill.import('blots/embed') as any;
class QrcodeFormatBlot extends Embed {
  static blotName = 'qrcode';
  static tagName = 'span';
}
Quill.register(QrcodeFormatBlot);

/**
 * 根据浏览器语言获取 quill-table-better 的本地化语言标识
 */
function getTableLanguage(): string {
  if (typeof navigator === 'undefined') return 'en_US';
  const lang = navigator.language;
  if (/\b(Hant|TW|HK|MO)\b/i.test(lang)) return 'zh_TW';
  if (lang.startsWith('zh')) return 'zh_CN';
  return 'en_US';
}

/** quill-table-better 模块配置 */
const TABLE_MODULE_CONFIG = {
  language: getTableLanguage(),
  menus: ['column', 'row', 'merge', 'table', 'cell', 'wrap', 'copy', 'delete'],
  toolbarTable: true,
};

/**
 * WordTemplateEditor 对外暴露的方法
 */
export interface WordTemplateEditorHandle {
  /** 获取编辑器中的完整 HTML 内容 */
  getHTML: () => string;
}

interface Props {
  /** Ant Design Form 实例 */
  form: any;
  /** 页面设置（纸张大小、方向、边距等） */
  pageSettings?: {
    paperSize?: string;
    orientation?: string;
    customWidth?: number;
    customHeight?: number;
    margins?: { top?: number; bottom?: number; left?: number; right?: number };
  };
}

/** 纸张尺寸定义（twips），与 server 端保持一致 */
const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  A4: { width: 11906, height: 16838 },
  A3: { width: 16838, height: 23814 },
  Letter: { width: 12240, height: 15840 },
  Legal: { width: 12240, height: 20160 },
  A5: { width: 8392, height: 11906 },
  B5: { width: 9919, height: 14043 },
};

/** 默认边距（twips），1 inch = 1440 twips */
const DEFAULT_MARGINS = { top: 1440, bottom: 1440, left: 1440, right: 1440 };

/**
 * 获取纸张尺寸（twips），支持自定义纸张大小。
 * 自定义纸张的宽高以 mm 存储，转换为 twips。
 */
function getPaperSizeTwips(pageSettings?: Props['pageSettings']): { width: number; height: number } {
  if (pageSettings?.paperSize === 'Custom') {
    const mmW = pageSettings.customWidth || 210;
    const mmH = pageSettings.customHeight || 297;
    return {
      width: Math.round((mmW / 25.4) * 1440),
      height: Math.round((mmH / 25.4) * 1440),
    };
  }
  const paperSize = pageSettings?.paperSize || 'A4';
  return PAPER_SIZES[paperSize] || PAPER_SIZES.A4;
}

/**
 * Word 模板编辑器组件。
 * 基于 Quill 富文本编辑器，支持：
 * - 基本的文字格式化（加粗、斜体、对齐等）
 * - 表格（通过 quill-table-better）
 * - 数据字段变量插入（如 {customerName}）
 * - 二维码占位符插入与编辑
 *
 * 包含两个关键的 Monkey Patch 修复：
 * 1. 移除 Quill 2 内置的 'tr' matcher，避免与 quill-table-better 的 matcher 冲突
 * 2. 修补 ReactQuill 的 setEditorContents 方法使用 updateContents 而非 setContents，
 *    以确保表格 blot 正确渲染
 */
export const WordTemplateEditor = forwardRef<WordTemplateEditorHandle, Props>(({ form, pageSettings }, ref) => {
  const { t } = useTranslation(NAMESPACE);
  const quillRef = useRef<any>(null);
  // 通过 Form.useWatch 监听表单中 collectionName 字段的变化
  const collectionName = Form.useWatch('collectionName', form);
  // 标记 matcher 修复是否已执行（仅执行一次）
  const matcherFixed = useRef(false);
  // 保存最后一次光标选区，用于编辑器失焦时仍能正确定位插入位置
  const lastSelectionRef = useRef<any>(null);
  // 字体列表（直接传入工具栏，false 代表「清除格式」选项）
  const [fonts, setFonts] = useState<(string | false)[]>([false, ...DEFAULT_FONTS]);
  const apiClient = useAPIClient();

  // 组件挂载时从 API 加载字体白名单
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.request({ url: 'printTemplateFonts:get' });
        const data = res?.data?.data;
        if (data?.fontWhitelist && Array.isArray(data.fontWhitelist) && data.fontWhitelist.length > 0) {
          registerFonts(data.fontWhitelist);
          setFonts([false, ...data.fontWhitelist]);
        }
      } catch {
        // API 失败时保持默认字体
      }
    })();
  }, [apiClient]);

  // --- 纸张内容宽度约束 ---
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * 约束 .ql-editor 宽高和 padding 匹配 Word 页面。
   *
   * 把 .ql-editor 模拟成一页纸：宽度 = 纸张宽度，padding-left/right = 边距宽度，
   * 编辑器内编辑的位置与 Word 渲染完全一致。
   *
   * 换算关系（html-docx-js 使用 twips，Word 渲染 altChunk 使用 96 DPI）：
   *   1 inch = 1440 twips = 96 px
   *   1 px = 1440/96 = 15 twips
   *   内容区宽度（px）= (paperWidth_twips - leftMargin - rightMargin) / 15
   *
   * 当用户设置的边距超出纸张大小时，自动等比压缩边距，
   * 确保内容区至少占纸张宽高的 10%。
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const qlEditor = el.querySelector('.ql-editor') as HTMLElement;
      if (!qlEditor) return;

      // 获取纸张物理尺寸（twips）
      const paperSize = getPaperSizeTwips(pageSettings);
      const orientation = pageSettings?.orientation || 'portrait';
      const paperWT = orientation === 'landscape' ? paperSize.height : paperSize.width;
      const paperHT = orientation === 'landscape' ? paperSize.width : paperSize.height;

      // 用户设置的边距（twips）
      let marginL = pageSettings?.margins?.left ?? DEFAULT_MARGINS.left;
      let marginR = pageSettings?.margins?.right ?? DEFAULT_MARGINS.right;
      let marginT = pageSettings?.margins?.top ?? DEFAULT_MARGINS.top;
      let marginB = pageSettings?.margins?.bottom ?? DEFAULT_MARGINS.bottom;

      // 自动压缩边距：如果水平边距总和超出纸张宽度，按比例压缩
      const marginW = marginL + marginR;
      if (marginW >= paperWT) {
        const maxPerSide = paperWT * 0.45; // 每侧最多占纸张 45%，留 10% 内容区
        const ratio = maxPerSide / Math.max(marginL, marginR);
        marginL = Math.round(Math.min(marginL * ratio, maxPerSide));
        marginR = Math.round(Math.min(marginR * ratio, maxPerSide));
      }
      // 垂直方向同理
      const marginH = marginT + marginB;
      if (marginH >= paperHT) {
        const maxPerSide = paperHT * 0.45;
        const ratio = maxPerSide / Math.max(marginT, marginB);
        marginT = Math.round(Math.min(marginT * ratio, maxPerSide));
        marginB = Math.round(Math.min(marginB * ratio, maxPerSide));
      }

      // 转 px：15 twips = 1 px
      const marginHPx = Math.round(marginL / 15);
      const marginVPx = Math.round(marginT / 15);
      const marginBPx = Math.round(marginB / 15);
      const contentWPx = Math.round((paperWT - marginL - marginR) / 15);
      const contentHPx = Math.round((paperHT - marginT - marginB) / 15);

      // 总尺寸 = 内容区 + 边距，使 .ql-editor 等于纸张尺寸
      const targetWidth = contentWPx + marginHPx + marginHPx;
      const targetHeight = contentHPx + marginVPx + marginBPx;

      qlEditor.style.width = `${targetWidth}px`;
      qlEditor.style.maxWidth = 'none';
      qlEditor.style.marginLeft = 'auto';
      qlEditor.style.marginRight = 'auto';
      qlEditor.style.padding = `${marginVPx}px ${marginHPx}px ${marginBPx}px ${marginHPx}px`;
      qlEditor.style.minHeight = `${targetHeight}px`;
      qlEditor.style.height = 'auto';
      qlEditor.style.background = '#fff';

      // 让 .ql-container 随 .ql-editor 自适应高度，不裁剪
      const qlContainer = qlEditor.closest('.ql-container') as HTMLElement;
      if (qlContainer) {
        qlContainer.style.height = 'auto';
        qlContainer.style.overflow = 'visible';
      }
    };

    update();
    const observer = new ResizeObserver(() => update());
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageSettings]);

  // 从表单读取已存储的模板内容
  const storedHTML = form.getFieldValue('content') || '';
  const [value, setValue] = useState('');

  // --- 二维码弹窗状态 ---
  const [qrcodeModalOpen, setQrcodeModalOpen] = useState(false);
  const [editingQrcodeConfig, setEditingQrcodeConfig] = useState<QrcodeConfig | undefined>(undefined);
  // 记录正在编辑的二维码 DOM 元素（用于编辑模式下的替换）
  const editingQrcodeElRef = useRef<HTMLElement | null>(null);
  // 使用 ref 保存回调函数引用，确保 Quill 工具栏按钮始终能访问最新的闭包
  const handleOpenQrcodeModalRef = useRef<() => void>(() => {});

  // 打开新建二维码弹窗
  handleOpenQrcodeModalRef.current = () => {
    editingQrcodeElRef.current = null;
    setEditingQrcodeConfig(undefined);
    setQrcodeModalOpen(true);
  };

  /**
   * 处理编辑器内容变更。
   * 同步 React state 和表单字段，防止 shouldComponentUpdate
   * 在每次用户编辑后触发 setEditorContents 重写。
   */
  const handleChange = useCallback(
    (html: string) => {
      setValue(html);
      form.setFieldsValue({ content: html });
    },
    [form],
  );

  // 安全获取 Quill 编辑器实例（getEditor() 在编辑器未实例化时会抛异常）
  const getEditorSafe = useCallback(() => {
    try {
      return quillRef.current?.getEditor() ?? null;
    } catch {
      return null;
    }
  }, []);

  // 暴露 getHTML 方法给父组件，从编辑器 DOM 直接读取 HTML
  useImperativeHandle(ref, () => ({
    getHTML: () => {
      const editor = getEditorSafe();
      return editor ? editor.root.innerHTML : '';
    },
  }));

  /**
   * 核心初始化 Effect：修复 quill-table-better 表格渲染的两个问题
   *
   * 问题 1：Quill 2 内置的 'tr' matcher (matchTable) 会为 Delta ops 添加 'table' 格式。
   *   quill-table-better 注册了自己的 'tr' matcher 添加 'table-cell'/'table-th'。
   *   两者同时作用于 <tr>，生成冲突的 blot 格式，导致表格无法正常渲染。
   *   解决方案：移除 Quill 2 内置的 'tr' matcher。
   *
   * 问题 2：ReactQuill 的 setEditorContents 调用 editor.setContents()，
   *   quill-table-better 明确警告不应使用此方法，必须用 updateContents
   *   才能正确渲染表格 blot。
   *   解决方案：Monkey-patch setEditorContents 使用 updateContents。
   */
  useEffect(() => {
    const editor = getEditorSafe();
    if (!editor || matcherFixed.current) return;
    matcherFixed.current = true;

    // 监听选区变化，记录最后光标位置（即使编辑器失焦也能恢复）
    editor.on('selection-change', (range: any) => {
      if (range) {
        lastSelectionRef.current = range;
      }
    });

    // Ctrl+\ 快捷键：清除内联格式但保留表格结构
    editor.keyboard.addBinding({ key: '\\', shortKey: true, ctrlKey: true }, (range: any) => {
      if (!range || range.length === 0) return true;
      // 需要清除的内联格式列表
      const inlineFormats = [
        'bold',
        'italic',
        'underline',
        'strike',
        'color',
        'background',
        'font',
        'size',
        'header',
        'list',
        'indent',
        'align',
        'code',
        'link',
        'blockquote',
        'code-block',
        'script',
      ];
      inlineFormats.forEach((fmt) => {
        editor.removeFormat(range.index, range.length, fmt);
      });
      return false;
    });

    // --- 修复 1：移除 Quill 2 内置的 'tr' matcher ---
    let trSeen = false;
    editor.clipboard.matchers = editor.clipboard.matchers
      .slice()
      .reverse()
      .filter(([s]: [string, Function]) => {
        if (s === 'tr') {
          if (trSeen) return false; // 移除后续重复的 'tr' matcher
          trSeen = true;
        }
        return true;
      })
      .reverse();

    // --- 修复 2：修补 setEditorContents 使用 updateContents ---
    const rqInstance = quillRef.current;
    const { onEditorChange } = rqInstance;
    rqInstance.setEditorContents = function (ed: any, val: string) {
      this.value = val;
      const sel = this.getEditorSelection();
      if (typeof val === 'string') {
        // HTML 字符串 → 转换为 Delta → updateContents
        const delta = ed.clipboard.convert({ html: val });
        // 暂时解除 editor-change 监听，防止程序化更新触发
        // onChange → setValue 循环导致 shouldComponentUpdate 重复调用 setEditorContents
        ed.off('editor-change', onEditorChange);
        ed.updateContents(delta, Quill.sources.USER);
        ed.on('editor-change', onEditorChange);
      } else {
        // Delta 对象直接更新
        ed.off('editor-change', onEditorChange);
        ed.updateContents(val, Quill.sources.USER);
        ed.on('editor-change', onEditorChange);
      }
      // 异步恢复光标位置
      Promise.resolve()
        .then(() => this.setEditorSelection(ed, sel))
        .catch(() => {});
    };

    // 如果有已存储的内容，加载到编辑器
    if (storedHTML) {
      setValue(storedHTML);
    }
  }, [storedHTML, getEditorSafe]);

  /**
   * 插入数据字段变量（如 {customerName}）。
   * 优先使用编辑器当前光标位置，如果编辑器失焦则使用最后记录的光标位置。
   */
  const handleInsertVariable = useCallback(
    (fieldPath: string) => {
      const editor = getEditorSafe();
      if (!editor) return;

      const variableText = `{${fieldPath}}`;
      // 优先使用当前选区，回退到最后记录的选区，再回退到文档末尾
      const selection = editor.getSelection() || lastSelectionRef.current;

      if (selection) {
        editor.insertText(selection.index, variableText);
        editor.setSelection(selection.index + variableText.length);
      } else {
        const length = editor.getLength();
        editor.insertText(length, variableText);
        editor.setSelection(length + variableText.length);
      }

      editor.focus();
    },
    [getEditorSafe],
  );

  /**
   * 插入或更新二维码占位符。
   * 编辑模式：替换旧的占位符 DOM 元素后同步内容。
   * 新建模式：在光标位置插入占位符 HTML。
   */
  const handleInsertQrcode = useCallback(
    async (config: QrcodeConfig) => {
      const editor = getEditorSafe();
      if (!editor) return;

      const placeholderHTML = await generateQrcodePlaceholderHTML(config);

      // 编辑已有二维码：替换 DOM 元素
      if (editingQrcodeElRef.current) {
        const oldEl = editingQrcodeElRef.current;
        oldEl.insertAdjacentHTML('afterend', placeholderHTML);
        oldEl.remove();
        editingQrcodeElRef.current = null;
        // DOM 操作后同步内容到 React state
        handleChange(editor.root.innerHTML);
      } else {
        // 新建二维码：在光标位置插入
        const selection = editor.getSelection() || lastSelectionRef.current;
        if (selection) {
          editor.clipboard.dangerouslyPasteHTML(selection.index, placeholderHTML);
        } else {
          const length = editor.getLength();
          editor.clipboard.dangerouslyPasteHTML(length, placeholderHTML);
        }
      }

      editor.focus();
      setQrcodeModalOpen(false);
      setEditingQrcodeConfig(undefined);
    },
    [handleChange, getEditorSafe],
  );

  /**
   * 点击二维码占位符的处理函数。
   * 识别点击的 img 元素中的配置信息，打开编辑弹窗。
   */
  const handleQrcodePlaceholderClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'IMG') return;

    const config = getConfigFromImg(target as HTMLImageElement);
    if (!config) return;

    e.preventDefault();
    e.stopPropagation();
    editingQrcodeElRef.current = target;
    setEditingQrcodeConfig(config);
    setQrcodeModalOpen(true);
  }, []);

  // 监听编辑器容器上的点击事件，检测二维码占位符点击
  useEffect(() => {
    const editorEl = getEditorSafe()?.root;
    if (!editorEl) return;

    editorEl.addEventListener('click', handleQrcodePlaceholderClick as EventListener);
    return () => {
      editorEl.removeEventListener('click', handleQrcodePlaceholderClick as EventListener);
    };
  }, [handleQrcodePlaceholderClick, getEditorSafe]);

  // 手动向 Quill 工具栏注入二维码按钮，避免 Quill 将其置灰
  useEffect(() => {
    const timer = setTimeout(() => {
      const toolbar = document.querySelector('.ql-toolbar.ql-snow');
      if (!toolbar) return;

      if (!toolbar.querySelector('.ql-qrcode')) {
        // 在 "清除格式" (clean) 按钮前插入二维码按钮
        const cleanBtn = toolbar.querySelector('button.ql-clean');
        const btn = document.createElement('button');
        btn.className = 'ql-qrcode';
        btn.type = 'button';
        btn.innerHTML = QRCODE_ICON_SVG;
        btn.addEventListener('click', () => {
          handleOpenQrcodeModalRef.current();
        });
        if (cleanBtn?.parentNode) {
          cleanBtn.parentNode.insertBefore(btn, cleanBtn);
        } else {
          toolbar.appendChild(btn);
        }
      }

      // 修复 Quill 字体选项显示：Picker.buildItem 依赖 option.textContent 设置
      // data-label，而 addSelect 创建的 option 没有 textContent。CSS 规则
      // .ql-picker-item[data-label]::before { content: attr(data-label) }
      // 需要 data-label 属性存在才能显示字体名。直接给 Picker item 打补丁。
      const fontPicker = toolbar.querySelector('.ql-picker.ql-font');
      if (fontPicker) {
        fontPicker.querySelectorAll('.ql-picker-item').forEach((item) => {
          const value = item.getAttribute('data-value');
          if (value && !item.hasAttribute('data-label')) {
            item.setAttribute('data-label', value);
          }
        });
        const fontLabel = fontPicker.querySelector('.ql-picker-label');
        if (fontLabel) {
          const value = fontLabel.getAttribute('data-value');
          if (value && !fontLabel.hasAttribute('data-label')) {
            fontLabel.setAttribute('data-label', value);
          }
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [fonts]);

  // Quill 模块配置，使用 useMemo 避免每次渲染重新创建
  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ font: fonts }],
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ align: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote', 'code-block'],
          [{ indent: '-1' }, { indent: '+1' }],
          ['table-better'],
          ['link', 'image'],
          ['clean'],
        ],
        handlers: {
          font(value: string | false) {
            if (!this.quill.hasFocus()) this.quill.focus();
            const range = this.quill.getSelection();
            if (!range) return;
            if (value === false) {
              // 清除字体格式
              this.quill.removeFormat(range.index, range.length);
            } else {
              // 直接应用 font-family 内联样式
              this.quill.formatText(range.index, range.length, { font: value });
            }
          },
        },
      },
      // 禁用 Quill 内置表格模块，使用 table-better 替代
      table: false,
      'table-better': TABLE_MODULE_CONFIG,
      keyboard: {
        bindings: QuillTableBetter.keyboardBindings,
      },
    }),
    [fonts],
  );

  return (
    <div>
      {/* 顶部工具栏区域：提示信息 + 变量插入按钮 */}
      <div
        style={{
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span style={{ color: '#666', fontSize: 12 }}>
          {t('Tip: Click the variable button to insert data fields, e.g. {customerName}. Or type them directly.')}
        </span>
        <CollectionFieldPicker
          collectionName={collectionName}
          onInsert={handleInsertVariable}
          label={t('Insert Variable')}
        />
      </div>

      {/* Quill 富文本编辑器，容器有滚动条，内部 .ql-editor 被约束为 Word 页面尺寸 */}
      <div
        ref={containerRef}
        style={{
          border: '1px solid #d9d9d9',
          borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          background: '#e8e8e8',
          position: 'relative',
          overflow: 'auto',
          maxHeight: 540,
        }}
      >
        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={value}
          onChange={handleChange}
          useSemanticHTML={false}
          modules={modules}
          style={{ minHeight: 0, marginBottom: 8 }}
          placeholder="Design your Word template here..."
        />
      </div>

      {/* 二维码插入/编辑弹窗 */}
      <QrcodeInsertModal
        open={qrcodeModalOpen}
        collectionName={collectionName}
        initialConfig={editingQrcodeConfig}
        onOk={handleInsertQrcode}
        onCancel={() => {
          editingQrcodeElRef.current = null;
          setQrcodeModalOpen(false);
          setEditingQrcodeConfig(undefined);
        }}
      />
    </div>
  );
});
