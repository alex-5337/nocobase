/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useTranslation } from 'react-i18next';

/** 插件国际化命名空间 */
export const NAMESPACE = 'plugin-template-print';

/**
 * 获取插件专用翻译函数。
 * 使用 fallback 模式，优先查找插件命名空间，找不到时回退到 'client' 命名空间。
 */
export function usePluginTranslation() {
  return useTranslation([NAMESPACE, 'client'], { nsMode: 'fallback' });
}
