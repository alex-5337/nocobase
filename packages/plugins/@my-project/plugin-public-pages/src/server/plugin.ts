/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Gateway, Plugin } from '@nocobase/server';
import type { Context } from '@nocobase/actions';

const PLUGIN_PACKAGE_NAME = '@my-project/plugin-public-pages';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 防止页面内容中的 </script> 截断外壳脚本块 */
function escapeScriptContent(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script');
}

function getAssetsBaseUrl(): string {
  const staticsPath = process.env.PLUGIN_STATICS_PATH || '/static/plugins/';
  return `${staticsPath}${PLUGIN_PACKAGE_NAME}/assets`;
}

function buildReactShell(title: string, content: string): string {
  const assets = getAssetsBaseUrl();
  const safeTitle = escapeHtml(title || '');
  const safeContent = escapeScriptContent(content || '');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<script src="${assets}/react.production.min.js"></script>
<script src="${assets}/react-dom.production.min.js"></script>
<script src="${assets}/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react">
${safeContent}

/* ---- mount ---- */
(function () {
  if (typeof App === 'undefined') {
    document.getElementById('root').innerHTML =
      '<div style="font-family:sans-serif;padding:24px;color:#d4380d;">' +
      'React page error: please define an <code>App</code> component in the page content.</div>';
    return;
  }
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})();
</script>
</body>
</html>`;
}

export class PluginPublicPagesServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {}

  /** 渲染已发布页面（未发布或不存在时 404） */
  private async renderPage(ctx: Context, slug: string) {
    const repo = ctx.db.getRepository('publicPages');
    const page = await repo.findOne({ filter: { slug, published: true } });
    if (!page) {
      ctx.throw(404, 'page not found');
    }

    const format = page.get('format') as string;
    const content = (page.get('content') as string) || '';
    const title = (page.get('title') as string) || '';

    ctx.withoutDataWrapping = true;
    ctx.type = 'text/html; charset=utf-8';
    ctx.set('Cache-Control', 'no-cache');
    ctx.body = format === 'react' ? buildReactShell(title, content) : content;
  }

  async load() {
    this.app.resourceManager.registerActionHandlers({
      // GET /api/publicPages:render?slug=xxx （免鉴权，仅渲染已发布页面）
      'publicPages:render': async (ctx: Context, next) => {
        const slug = (ctx.action.params.slug as string) || (ctx.query.slug as string);
        if (!slug) {
          ctx.throw(400, 'slug is required');
        }
        await this.renderPage(ctx, slug);
        await next();
      },
    });

    // GET /public/<slug> 短链（免鉴权，仅渲染已发布页面）
    this.app.use(
      async (ctx: Context, next) => {
        if (ctx.method !== 'GET') {
          await next();
          return;
        }
        const match = /^\/public\/([a-z0-9][a-z0-9-_]*)\/?$/.exec(ctx.path);
        if (!match) {
          await next();
          return;
        }
        await this.renderPage(ctx, match[1]);
      },
      { tag: 'public-pages-render', before: 'dataWrapping' },
    );

    // 网关默认只把 /api 开头的请求转发给应用服务器，注册 /public/ 前缀使短链可达
    Gateway.getInstance().addAppRoutePrefix('/public/');

    // 渲染（预览）免鉴权，仅输出已发布页面
    this.app.acl.allow('publicPages', 'render', 'public');
    // list/get/create/update/destroy 不做 loggedIn 放行，仅管理员（root 角色）可操作
  }

  async install() {}

  async afterEnable() {}

  async afterDisable() {
    Gateway.getInstance().removeAppRoutePrefix('/public/');
  }

  async remove() {
    Gateway.getInstance().removeAppRoutePrefix('/public/');
  }
}

export default PluginPublicPagesServer;
