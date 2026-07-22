/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';
import { TemplatePrintActionInitializer } from './TemplatePrintActionInitializer';
import { TemplateListPage } from './TemplateListPage';
import { FontSettingsPage } from './FontSettingsPage';
import { useTemplatePrintActionProps } from './useTemplatePrintActionProps';
import { registerFonts } from './font-utils';
import zhCN from '../locale/zh-CN.json';
import enUS from '../locale/en-US.json';

const NAMESPACE = 'plugin-template-print';

/**
 * 模板打印客户端插件（V1 运行时）。
 * 负责注册：
 * - 国际化资源
 * - 模板管理页面组件
 * - 字体设置页面
 * - 打印操作初始化器和按钮
 * - V2 流程引擎模型（跨运行时兼容）
 */
export class PluginTemplatePrintClient extends Plugin {
  async load() {
    // ===== 国际化资源注册 =====
    // 注册插件专用命名空间
    this.app.i18n.addResources('zh-CN', NAMESPACE, zhCN);
    this.app.i18n.addResources('en-US', NAMESPACE, enUS);
    // 同时注册到 'client' 命名空间，以便 schema 中的 {{t(...)}} 表达式能正确解析
    this.app.i18n.addResources('zh-CN', 'client', zhCN);
    this.app.i18n.addResources('en-US', 'client', enUS);

    // ===== 组件注册 =====
    this.app.addComponents({
      TemplateListPage,
      TemplatePrintActionInitializer,
    });

    // ===== Scope 注册（schema 中可用的 hooks） =====
    this.app.addScopes({
      useTemplatePrintActionProps,
    });

    // ===== 插件设置页面注册 =====
    this.app.pluginSettingsManager.add('print-templates', {
      icon: 'PrinterOutlined',
      title: '{{t("Template Print")}}',
      aclSnippet: 'pm.print-templates',
    });

    this.app.pluginSettingsManager.add('print-templates.list', {
      title: '{{t("Templates")}}',
      Component: TemplateListPage,
    });

    this.app.pluginSettingsManager.add('print-templates.fonts', {
      title: '{{t("General Settings")}}',
      Component: FontSettingsPage,
    });

    // ===== 操作初始化器注册 =====
    // 在详情页（含分页详情）和表格页的操作配置中注入「模板打印」按钮
    const initializerData = {
      type: 'item',
      name: 'printTemplate',
      title: '{{t("Template Print")}}',
      Component: 'TemplatePrintActionInitializer',
      schema: {
        'x-component': 'Action',
        'x-toolbar': 'ActionSchemaToolbar',
        'x-settings': 'actionSettings:printTemplate',
        'x-action': 'printTemplate',
      },
    };

    this.app.schemaInitializerManager.addItem('details:configureActions', 'printTemplate', initializerData);
    this.app.schemaInitializerManager.addItem('detailsWithPaging:configureActions', 'printTemplate', initializerData);
    this.app.schemaInitializerManager.addItem('table:configureActions', 'printTemplate', initializerData);

    // ===== V2 流程引擎模型注册（跨运行时兼容） =====
    // 注册 V2 的 PrintTemplateActionModel，使 V2 配置的页面在 V1 中也能正常工作
    this.app.flowEngine.registerModelLoaders({
      PrintTemplateActionModel: {
        extends: 'ActionModel',
        loader: () => import('../client-v2/PrintTemplateActionModel'),
      },
    });
    await this.app.flowEngine.preloadModelLoaders();

    // ===== 字体配置动态加载 =====
    // 从 API 加载用户自定义的字体白名单，更新 Quill 字体选择器
    try {
      const res = await this.app.apiClient.request({ url: 'printTemplateFonts:get' });
      const data = res?.data?.data;
      if (data?.fontWhitelist && Array.isArray(data.fontWhitelist) && data.fontWhitelist.length > 0) {
        registerFonts(data.fontWhitelist);
      }
    } catch {
      // 字体配置加载失败不影响主功能，使用默认字体
    }
  }
}

export default PluginTemplatePrintClient;
