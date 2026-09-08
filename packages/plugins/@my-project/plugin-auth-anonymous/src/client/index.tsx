/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';
import AuthPlugin from '@nocobase/plugin-auth/client';
import { authType } from '../constants';
import enUS from '../locale/en-US.json';
import zhCN from '../locale/zh-CN.json';
import { Options } from './Options';
import { AnonymousButton } from './AnonymousButton';
import { NAMESPACE } from './locale';

export class PluginAuthAnonymousClient extends Plugin {
  async load() {
    this.app.i18n.addResources('zh-CN', NAMESPACE, zhCN);
    this.app.i18n.addResources('en-US', NAMESPACE, enUS);

    const auth = this.app.pm.get(AuthPlugin);
    auth.registerType(authType, {
      components: {
        SignInButton: AnonymousButton,
        AdminSettingsForm: Options,
      },
    });
  }
}

export default PluginAuthAnonymousClient;
