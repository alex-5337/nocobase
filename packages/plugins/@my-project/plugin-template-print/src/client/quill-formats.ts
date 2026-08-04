/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import Quill from 'quill';

/**
 * 字号可选值（CSS pt 值），Quill whitelist 使用。
 * 涵盖 WPS/Word 完整中文号数体系 + 大号数值，生成 font-size 内联样式。
 */
export const FONT_SIZES = [
  '5pt', // 八号
  '5.5pt', // 七号
  '6.5pt', // 小六
  '7.5pt', // 六号
  '9pt', // 小五
  '10.5pt', // 五号
  '12pt', // 小四
  '14pt', // 四号
  '15pt', // 小三
  '16pt', // 三号
  '18pt', // 小二
  '22pt', // 二号
  '24pt', // 小一
  '26pt', // 一号
  '36pt', // 小初
  '42pt', // 初号
  '48pt',
  '54pt',
  '60pt',
  '66pt',
  '72pt',
  '80pt',
  '88pt',
  '96pt',
];

/**
 * 字号下拉显示名映射：中文号数 → 号名，数值 → 数字本身。
 */
export const FONT_SIZE_LABELS: Record<string, string> = {
  '5pt': '八号',
  '5.5pt': '七号',
  '6.5pt': '小六',
  '7.5pt': '六号',
  '9pt': '小五',
  '10.5pt': '五号',
  '12pt': '小四',
  '14pt': '四号',
  '15pt': '小三',
  '16pt': '三号',
  '18pt': '小二',
  '22pt': '二号',
  '24pt': '小一',
  '26pt': '一号',
  '36pt': '小初',
  '42pt': '初号',
  '48pt': '48',
  '54pt': '54',
  '60pt': '60',
  '66pt': '66',
  '72pt': '72',
  '80pt': '80',
  '88pt': '88',
  '96pt': '96',
};

/**
 * Heading 级别 → 对应默认字号映射。
 * 与 WPS 一致：标题1=二号，标题2=三号，标题3=四号，标题4=小四，标题5=五号。
 */
export const HEADING_SIZE_MAP: Record<number, string> = {
  1: '22pt',
  2: '16pt',
  3: '14pt',
  4: '12pt',
  5: '10.5pt',
};

/**
 * 正文（Normal）默认字号，与 Word 中文文档默认小四保持一致。
 */
export const DEFAULT_BODY_SIZE = '12pt';

/**
 * 行间距可选值（纯数字，映射为 CSS line-height）。
 * 1   = 单倍行距  |  1.5 = 一点五倍行距  |  2 = 双倍行距
 */
export const LINE_HEIGHTS = ['1', '1.15', '1.5', '1.75', '2', '2.5', '3'];

/**
 * 行间距工具栏图标 SVG。
 * 参考 WPS/Word 的行距图标：左侧垂直双向箭头 + 右侧多行横线。
 * 尺寸与 Quill 官方图标一致（18×18、.ql-stroke 线条风格），snow 主题的悬停高亮同样生效。
 */
export const LINE_HEIGHT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
  <line class="ql-stroke" x1="2" y1="9" x2="5" y2="9"/>
  <line class="ql-stroke" x1="6.5" y1="9" x2="16" y2="9"/>
  <line class="ql-stroke" x1="6.5" y1="3.5" x2="16" y2="3.5"/>
  <line class="ql-stroke" x1="6.5" y1="14.5" x2="16" y2="14.5"/>
  <polyline class="ql-stroke" points="5 9 3.5 7.5 2 9"/>
  <polyline class="ql-stroke" points="5 9 3.5 10.5 2 9"/>
</svg>`;

/**
 * 注册字体大小格式到 Quill。
 * Quill 2 的 Size 使用 StyleAttributor，生成 inline font-size CSS，
 * html-docx-js 在转换为 Word 时可以保留该样式。
 */
export function registerSizes(): void {
  const SizeClass = Quill.import('attributors/class/size') as any;
  const SizeStyle = Quill.import('attributors/style/size') as any;
  SizeClass.whitelist = FONT_SIZES;
  SizeStyle.whitelist = FONT_SIZES;
  // 以 style 版本注册，确保编辑时生成 font-size 内联样式
  Quill.register(SizeStyle, true);
}

/**
 * 注册行间距格式到 Quill。
 * 自定义 StyleAttributor，作用于 block 级别，生成 inline line-height CSS。
 * html-docx-js 在转换为 Word 时可以保留该样式。
 */
export function registerLineHeights(): void {
  const Parchment = Quill.import('parchment') as any;
  const LineHeightAttributor = new Parchment.StyleAttributor('lineheight', 'line-height', {
    whitelist: LINE_HEIGHTS,
  });
  Quill.register(LineHeightAttributor, true);
}
