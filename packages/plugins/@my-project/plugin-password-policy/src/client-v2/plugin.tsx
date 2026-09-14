/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client-v2';
import PluginUsersClientV2 from '@nocobase/plugin-users/client-v2';
import enUS from '../locale/en-US.json';
import zhCN from '../locale/zh-CN.json';
import { checkPasswordComplexity } from '../shared/password-checker';
import { NAMESPACE } from './locale';
import { getPolicyConfig } from './policy-config';

export class PluginPasswordPolicyClientV2 extends Plugin {
  async load() {
    this.app.i18n.addResources('zh-CN', NAMESPACE, zhCN);
    this.app.i18n.addResources('en-US', NAMESPACE, enUS);
    this.registerSettingsPages();
    this.registerPasswordValidator();
  }

  private registerSettingsPages() {
    const t = (key: string) => this.app.i18n.t(key, { ns: NAMESPACE });
    // The tab lives under the shared `security` menu registered by the v2 buildin plugin.
    this.pluginSettingsManager.addPageTabItem({
      menuKey: 'security',
      key: 'password-policy',
      title: t('Password policy'),
      icon: 'SafetyOutlined',
      aclSnippet: 'pm.security.password-policy',
      sort: 1,
      componentLoader: () => import('./pages/PasswordPolicyPage'),
    });
  }

  private registerPasswordValidator() {
    // Contribute the complexity rules to the `plugin-users` validator registry so that all the
    // password fields in user forms (admin create/edit, change password) get instant feedback.
    const usersPlugin = this.app.pm.get(PluginUsersClientV2);
    if (!usersPlugin?.registerPasswordValidator) {
      return;
    }
    usersPlugin.registerPasswordValidator('password-policy', async (value, ctx) => {
      const config = await getPolicyConfig(this.app.apiClient);
      const error = checkPasswordComplexity(value, config, ctx?.username);
      if (!error) {
        return null;
      }
      return this.app.i18n.t(error.key, { ns: NAMESPACE, ...(error.params || {}) });
    });
  }
}

export default PluginPasswordPolicyClientV2;
