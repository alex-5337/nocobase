/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { ActionInitializer } from '@nocobase/client';
import React from 'react';

/**
 * 模板打印操作初始化器。
 * 在页面操作配置区域注入「模板打印」按钮的 schema 定义。
 */
export const TemplatePrintActionInitializer = (props: any) => {
  const schema = {
    title: '{{ t("Template Print") }}',
    'x-action': 'printTemplate',
    'x-component': 'Action',
    'x-use-component-props': 'useTemplatePrintActionProps',
    'x-component-props': {
      icon: 'PrinterOutlined',
    },
    'x-designer': 'Action.Designer',
    'x-settings': 'actionSettings:printTemplate',
  };
  return <ActionInitializer {...props} schema={schema} />;
};
