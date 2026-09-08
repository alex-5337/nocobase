/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { LoginOutlined } from '@ant-design/icons';
import { type Authenticator, useSignIn } from '@nocobase/plugin-auth/client-v2';
import { Button } from 'antd';
import React, { useState } from 'react';
import { useT } from './locale';

/**
 * v2 sign-in button for the `Anonymous` authenticator, rendered on `/signin`
 * by plugin-auth's SignInPage (`signInButtonLoader`). Signing in goes through
 * `useSignIn`, i.e. `auth:signIn` with an empty payload plus the standard
 * post-login redirect — the same contract the v1 `AnonymousButton` implements.
 */
export function AnonymousButton({ authenticator }: { authenticator: Authenticator }) {
  const compileT = useT();
  const signIn = useSignIn(authenticator.name);
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setLoading(true);
    try {
      await signIn.run({});
    } catch {
      // apiClient 的全局响应拦截器已经提示过错误，这里只需要收起 loading。
      setLoading(false);
    }
  };

  // `authenticator.title` 存的是 tval 原始模板（`{{t("…")}}`），用 useT 展开；
  // 普通字符串（含下面的默认文案）原样返回，并由 i18next 查 `auth-anonymous` 命名空间。
  return (
    <Button shape="round" block icon={<LoginOutlined />} loading={loading} onClick={login}>
      {compileT(authenticator.title || 'Sign in anonymously')}
    </Button>
  );
}

export default AnonymousButton;
