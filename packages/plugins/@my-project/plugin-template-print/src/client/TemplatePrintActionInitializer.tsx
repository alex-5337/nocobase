import { ActionInitializer } from '@nocobase/client';
import React from 'react';

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
