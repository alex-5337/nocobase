/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';
import { NAMESPACE } from './locale';
import { PasswordPolicyPage } from './PasswordPolicyPage';
import zhCN from '../locale/zh-CN.json';
import enUS from '../locale/en-US.json';

export class PluginPasswordPolicyClient extends Plugin {
  async load() {
    this.app.i18n.addResources('zh-CN', NAMESPACE, zhCN);
    this.app.i18n.addResources('en-US', NAMESPACE, enUS);
    // Also register into the `client` namespace so `{{t(...)}}` schema templates resolve.
    this.app.i18n.addResources('zh-CN', 'client', zhCN);
    this.app.i18n.addResources('en-US', 'client', enUS);

    // The tab lives under the shared `security` menu registered by the v1 buildin plugin.
    this.app.pluginSettingsManager.add('security.password-policy', {
      title: '{{t("Password policy")}}',
      Component: PasswordPolicyPage,
      aclSnippet: 'pm.security.password-policy',
      icon: 'SafetyOutlined',
      sort: 1,
    });
  }
}

export default PluginPasswordPolicyClient;
