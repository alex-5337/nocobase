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
 * 默认字体白名单，作为后备配置。
 * 当 API 配置尚未加载时，使用此默认值。
 */
export const DEFAULT_FONTS = [
  'SimSun',
  'SimHei',
  'KaiTi',
  'Microsoft YaHei',
  'FangSong',
  'Arial',
  'Times New Roman',
  'Verdana',
  'Georgia',
  'Courier New',
  'Tahoma',
];

/**
 * 注册字体白名单到 Quill。
 * 在 Quill 2 中，字体有两个 attributor：
 * - attributors/class/font：ClassAttributor，工具栏下拉菜单读取此 whitelist
 * - attributors/style/font：StyleAttributor，生成 font-family 内联样式供 html-docx-js 转换
 * 两者通过 blotName 'font' 关联，必须同时更新 whitelist 才能让下拉显示正确且输出内联样式。
 */
export function registerFonts(fonts: string[]) {
  const FontClass = Quill.import('attributors/class/font') as any;
  const FontStyle = Quill.import('attributors/style/font') as any;
  FontClass.whitelist = [...fonts];
  FontStyle.whitelist = [...fonts];
  // 以 style 版本注册，确保编辑时生成 font-family 内联样式而非 class="ql-font-xxx"
  Quill.register(FontStyle, true);
}
