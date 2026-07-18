/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineCollection } from '@nocobase/database';

/**
 * 打印模板字体配置集合。
 * 单例模式 — 整个应用只有一条记录，存储用户自定义的字体白名单。
 * `fontWhitelist` 为 JSON 数组，如 ["SimSun", "SimHei", "Arial"]。
 */
export default defineCollection({
  name: 'printTemplateFonts',
  dataCategory: 'system',
  fields: [
    {
      type: 'jsonb',
      name: 'fontWhitelist',
      defaultValue: [
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
      ],
    },
  ],
});
