/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/server';
import { toMarkdownAction } from './actions/toMarkdown';
import { toHtmlAction } from './actions/toHtml';
import { multipartMiddleware } from './utils/file-utils';

export class PluginOfficeOxideServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {}

  async load() {
    this.app.resourceManager.define({
      name: 'officeOxide',
      actions: {
        toMarkdown: toMarkdownAction,
        toHtml: toHtmlAction,
      },
    });

    this.app.resourceManager.use(multipartMiddleware, { before: 'acl' });

    this.app.acl.allow('officeOxide', '*', 'loggedIn');
  }

  async install() {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginOfficeOxideServer;
