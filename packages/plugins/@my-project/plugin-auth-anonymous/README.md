# @my-project/plugin-auth-anonymous

Auth: Anonymous login —— 允许以管理端指定的用户身份匿名登录（登录页无需账号密码）。

## 来源

Fork 自 [typekcz/nocobase-plugins](https://github.com/typekcz/nocobase-plugins)（`plugin-auth-anonymous`，v1.0.4，AGPL-3.0），
本地化到本仓库 `packages/plugins/@my-project/`，依赖声明由 `1.x` 调整为 `2.x` 以匹配 NocoBase 2.2.6。

## 认证类型

注册的 authenticator 类型为 `Anonymous`（见 [constants.ts](file:///d:/diy/nocobase/nocobase-new/packages/plugins/@my-project/plugin-auth-anonymous/src/constants.ts)），
配置项为 `options.public.anonymousUser`（用户 id），校验逻辑见 [anonymous-auth.ts](file:///d:/diy/nocobase/nocobase-new/packages/plugins/@my-project/plugin-auth-anonymous/src/server/anonymous-auth.ts)。

## 使用

1. `yarn install`（将新包链接进 workspace）
2. `yarn nocobase build @my-project/plugin-auth-anonymous`
3. 管理端「插件管理」中启用，然后在「认证管理」里新建 authType 为 `Anonymous` 的 authenticator，选择匿名用户

> 客户端目前只提供 v1 入口（`src/client/`），未实现 `src/client-v2/`。
