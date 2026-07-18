/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client-v2';
import zhCN from '../locale/zh-CN.json';
import enUS from '../locale/en-US.json';

const NAMESPACE = 'plugin-template-print';

/**
 * 模板打印客户端插件（V2 运行时）。
 * 负责注册：
 * - V2 国际化资源
 * - 流程引擎中的打印操作模型
 * - V2 设置侧边栏菜单项
 */
export class PluginTemplatePrintClient extends Plugin {
  async load() {
    // ===== 国际化资源注册 =====
    this.app.i18n.addResources('zh-CN', NAMESPACE, zhCN);
    this.app.i18n.addResources('en-US', NAMESPACE, enUS);
    this.app.i18n.addResources('zh-CN', 'client', zhCN);
    this.app.i18n.addResources('en-US', 'client', enUS);

    // ===== V2 流程引擎操作模型注册 =====
    this.flowEngine.registerModelLoaders({
      PrintTemplateActionModel: {
        extends: 'ActionModel',
        loader: () => import('./PrintTemplateActionModel'),
      },
    });

    // 预加载模型加载器，确保流程引擎初始化时模型类已可用
    await this.flowEngine.preloadModelLoaders();

    // ===== V2 设置侧边栏菜单注册 =====
    const t = (key: string) => this.app.i18n.t(key, { ns: 'plugin-template-print' });
    this.app.pluginSettingsManager.addMenuItem({
      key: 'print-templates',
      icon: 'PrinterOutlined',
      title: t('Template Print'),
      aclSnippet: 'pm.print-templates',
      showTabs: true,
    });
    this.app.pluginSettingsManager.addPageTabItem({
      menuKey: 'print-templates',
      key: 'index',
      title: t('Templates'),
      componentLoader: () => import('./TemplateListPage'),
    });
  }
}

export default PluginTemplatePrintClient;
