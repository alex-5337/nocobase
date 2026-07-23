/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';

/**
 * 为外部数据源创建数据表时的 belongsTo 关联字段添加默认的 targetKey。
 * 预设字段（如 createdBy、updatedBy）缺少 targetKey 属性，
 * 但 data-source-manager 插件的验证要求 belongsTo 字段必须有 targetKey。
 * 此中间件在验证之前为这些字段添加默认的 targetKey: 'id'。
 */
export async function ensureFieldTargetKey(ctx: Context, next: Next) {
  const { resourceName, actionName } = ctx.action;
  if (resourceName !== 'dataSources.collections' || actionName !== 'create') {
    return next();
  }

  const dataSourceKey = ctx.action.params.associatedIndex;
  if (!dataSourceKey || dataSourceKey === 'main') {
    return next();
  }

  const values = ctx.action.params.values;
  if (!values?.fields || !Array.isArray(values.fields)) {
    return next();
  }

  // 为 belongsTo 类型的字段添加默认的 targetKey
  values.fields = values.fields.map((field: any) => {
    if (field.type === 'belongsTo' && !field.targetKey) {
      return {
        ...field,
        targetKey: 'id',
      };
    }
    return field;
  });

  await next();
}
