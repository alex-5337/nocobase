/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';
import { tval } from '@nocobase/utils/client';
import models from './models';
import { PublicPagesPage } from './PublicPagesPage';
// @ts-ignore
import pkg from '../../package.json';
// @ts-ignore
import zhCN from '../locale/zh-CN.json';
// @ts-ignore
import enUS from '../locale/en-US.json';

const namespace = pkg.name;

export class PluginPublicPagesClient extends Plugin {
  async load() {
    this.flowEngine.registerModels(models);

    this.app.i18n.addResources('zh-CN', namespace, zhCN);
    this.app.i18n.addResources('en-US', namespace, enUS);

    this.app.pluginSettingsManager.add('public-pages', {
      icon: 'FileTextOutlined',
      title: tval('Public Pages', { ns: namespace }),
      Component: PublicPagesPage,
    });
  }
}

export default PluginPublicPagesClient;
