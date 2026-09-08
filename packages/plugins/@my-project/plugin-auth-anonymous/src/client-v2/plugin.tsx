/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client-v2';
import PluginAuthClientV2 from '@nocobase/plugin-auth/client-v2';
import { authType } from '../constants';
import enUS from '../locale/en-US.json';
import zhCN from '../locale/zh-CN.json';
import { NAMESPACE } from './locale';

export class PluginAuthAnonymousClientV2 extends Plugin {
  async load() {
    this.app.i18n.addResources('zh-CN', NAMESPACE, zhCN);
    this.app.i18n.addResources('en-US', NAMESPACE, enUS);

    const auth = this.app.pm.get(PluginAuthClientV2);
    auth.registerType(authType, {
      signInButtonLoader: () => import('./AnonymousButton'),
      adminSettingsFormLoader: () => import('./Options'),
    });
  }
}

export default PluginAuthAnonymousClientV2;
