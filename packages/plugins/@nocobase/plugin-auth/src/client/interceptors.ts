/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Application } from '@nocobase/client';
import type { AxiosResponse } from 'axios';
import debounce from 'lodash/debounce';

const AuthErrorCode = {
  EMPTY_TOKEN: 'EMPTY_TOKEN' as const,
  EXPIRED_TOKEN: 'EXPIRED_TOKEN' as const,
  INVALID_TOKEN: 'INVALID_TOKEN' as const,
  TOKEN_RENEW_FAILED: 'TOKEN_RENEW_FAILED' as const,
  BLOCKED_TOKEN: 'BLOCKED_TOKEN' as const,
  EXPIRED_SESSION: 'EXPIRED_SESSION' as const,
  NOT_EXIST_USER: 'NOT_EXIST_USER' as const,
  SKIP_TOKEN_RENEW: 'SKIP_TOKEN_RENEW' as const,
  USER_HAS_NO_ROLES_ERR: 'USER_HAS_NO_ROLES_ERR' as const,
};

function removeBasename(pathname, basename) {
  // Escape special characters in basename for use in regex
  const escapedBasename = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Create a regex to match the basename at the start of pathname, followed by a slash or end of string
  const regex = new RegExp(`^${escapedBasename.replace(/\/?$/, '')}(\\/|$)`);
  // If it matches, remove the basename; otherwise, return the pathname unchanged
  return pathname.replace(regex, '/') || pathname;
}

const debouncedRedirect = debounce(
  (redirectFunc) => {
    redirectFunc();
  },
  3000,
  { leading: true, trailing: false },
);

export function authCheckMiddleware({ app }: { app: Application }) {
  const axios = app.apiClient.axios;
  const resHandler = (res: AxiosResponse) => {
    const newToken = res?.headers?.['x-new-token'];
    if (newToken) {
      app.apiClient.auth.setToken(newToken);
    }
    return res;
  };
  const errHandler = (error) => {
    const newToken = error?.response?.headers?.['x-new-token'];
    const errors = error?.response?.data?.errors;
    const firstError = Array.isArray(errors) ? errors[0] : null;

    // 应用启动阶段（路由初始化前）内部 router 实例可能尚未创建，
    // 此时访问 state/basename 会抛出 TypeError，需要先做就绪判断
    const routerReady = !!app.router?.router;
    const location = routerReady ? app.router.state.location : undefined;
    const pathname = location?.pathname;
    const search = location?.search || '';
    const basename = routerReady ? app.router.basename : '/';

    if (newToken) {
      app.apiClient.auth.setToken(newToken);
    }

    if (error.status === 401 && firstError?.code && AuthErrorCode[firstError.code]) {
      app.apiClient.auth.setToken('');
      // 未登录或已注销时管理端仍会请求 roles:check、desktopRoutes:listAccessible 等接口，服务端返回 EMPTY_TOKEN
      // 表示请求未携带任何凭据，属预期结果：应用随后会跳转登录页，不应再弹全局错误提示
      if (firstError.code === AuthErrorCode.EMPTY_TOKEN && error.config) {
        error.config.skipNotify = true;
      }
      if (pathname === app.getHref('signin') && firstError?.code !== AuthErrorCode.EMPTY_TOKEN && error.config) {
        error.config.skipNotify = false;
      }

      if (firstError?.code === 'USER_HAS_NO_ROLES_ERR') {
        // use app error to show error message
        error.config.skipNotify = true;
        app.error = firstError;
      }
    }

    if (error.status === 401 && !error.config?.skipAuth && firstError?.code && AuthErrorCode[firstError.code]) {
      if (!firstError || firstError?.code === AuthErrorCode.SKIP_TOKEN_RENEW) {
        throw error;
      }

      // 路由未就绪时无法获取当前路径，也无法跳转，跳过重定向逻辑
      if (routerReady) {
        const isSkippedAuthCheckRoute = app.router.isSkippedAuthCheckRoute(pathname);
        if (isSkippedAuthCheckRoute) {
          error.config.skipNotify = true;
        }

        if (pathname !== app.getHref('signin') && !isSkippedAuthCheckRoute) {
          const redirectPath = removeBasename(pathname, basename);

          debouncedRedirect(() => {
            app.apiClient.auth.setToken(null);
            app.router.navigate(`/signin?redirect=${redirectPath}${search}`, { replace: true });
          });
        }
      }
    }
    throw error;
  };
  return [resHandler, errHandler];
}
