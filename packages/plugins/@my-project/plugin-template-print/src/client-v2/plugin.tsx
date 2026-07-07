import { Plugin } from '@nocobase/client-v2';
import zhCN from '../locale/zh-CN.json';
import enUS from '../locale/en-US.json';

const NAMESPACE = 'plugin-template-print';

export class PluginTemplatePrintClient extends Plugin {
  async load() {
    // Register locale resources for V2
    this.app.i18n.addResources('zh-CN', NAMESPACE, zhCN);
    this.app.i18n.addResources('en-US', NAMESPACE, enUS);
    this.app.i18n.addResources('zh-CN', 'client', zhCN);
    this.app.i18n.addResources('en-US', 'client', enUS);

    // Register action model
    this.flowEngine.registerModelLoaders({
      PrintTemplateActionModel: {
        extends: 'ActionModel',
        loader: () => import('./PrintTemplateActionModel'),
      },
    });

    // Eagerly resolve model loaders so the model class is available synchronously
    // when the flow engine initializes the model tree from saved data.
    await this.flowEngine.preloadModelLoaders();

    // Register settings menu item in the V2 settings sidebar
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
