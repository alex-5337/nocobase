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
import { getMineruTokenAction, setMineruTokenAction } from './actions/token';
import { multipartMiddleware } from './utils/file-utils';
import { loadToken } from './utils/token-store';

export class PluginOfficeOxideServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {
    const token = loadToken();
    if (token) {
      process.env.MINERU_TOKEN = token;
    }
  }

  async load() {
    this.app.resourceManager.define({
      name: 'officeOxide',
      actions: {
        toMarkdown: toMarkdownAction,
        toHtml: toHtmlAction,
        getMineruToken: getMineruTokenAction,
        setMineruToken: setMineruTokenAction,
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
