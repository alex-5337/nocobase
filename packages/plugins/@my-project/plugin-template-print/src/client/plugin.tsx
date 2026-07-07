import { Plugin } from '@nocobase/client';
import { TemplatePrintActionInitializer } from './TemplatePrintActionInitializer';
import { TemplateListPage } from './TemplateListPage';
import { useTemplatePrintActionProps } from './useTemplatePrintActionProps';
import zhCN from '../locale/zh-CN.json';
import enUS from '../locale/en-US.json';

const NAMESPACE = 'plugin-template-print';

export class PluginTemplatePrintClient extends Plugin {
  async load() {
    // Register locale resources
    this.app.i18n.addResources('zh-CN', NAMESPACE, zhCN);
    this.app.i18n.addResources('en-US', NAMESPACE, enUS);
    // Also register under 'client' namespace for schema {{t(...)}} resolution
    this.app.i18n.addResources('zh-CN', 'client', zhCN);
    this.app.i18n.addResources('en-US', 'client', enUS);

    // Register components
    this.app.addComponents({
      TemplateListPage,
      TemplatePrintActionInitializer,
    });

    // Register scope (hooks available in schema)
    this.app.addScopes({
      useTemplatePrintActionProps,
    });

    // Register settings page
    this.app.pluginSettingsManager.add('print-templates', {
      icon: 'PrinterOutlined',
      title: '{{t("Template Print")}}',
      aclSnippet: 'pm.print-templates',
    });

    this.app.pluginSettingsManager.add('print-templates.list', {
      title: '{{t("Templates")}}',
      Component: TemplateListPage,
    });

    // Register action initializer in details and table pages
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

    // Register the model with the flow engine so V2-configured pages work in V1
    // when sharing the same flow engine instance.
    this.app.flowEngine.registerModelLoaders({
      PrintTemplateActionModel: {
        extends: 'ActionModel',
        loader: () => import('../client-v2/PrintTemplateActionModel'),
      },
    });
    await this.app.flowEngine.preloadModelLoaders();
  }
}

export default PluginTemplatePrintClient;
