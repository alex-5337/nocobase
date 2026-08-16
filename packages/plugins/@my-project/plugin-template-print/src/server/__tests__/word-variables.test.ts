/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import {
  buildRelationTableHtml,
  buildTableColumns,
  collectTemplateFieldPaths,
  expandRepeatTables,
  extractFieldValue,
  findRelationAppend,
  formatDisplayValue,
  getToManyRelationTableColumns,
  replaceVariables,
  stripTemporaryTags,
  PrintFieldOptions,
} from '../word-variables';

/** 模拟数据表结构：orders 1-N orderItems，orders N-1 users，users 1-1 profiles */
const collections: Record<string, PrintFieldOptions[]> = {
  orders: [
    { name: 'id', type: 'integer', sort: 1 },
    { name: 'title', type: 'string', interface: 'input', uiSchema: { title: '订单标题' }, sort: 2 },
    { name: 'user', type: 'belongsTo', target: 'users', interface: 'belongsTo', sort: 3 },
    { name: 'items', type: 'hasMany', target: 'orderItems', interface: 'subTable', sort: 4 },
  ],
  users: [
    { name: 'nickname', type: 'string', interface: 'input', uiSchema: { title: '昵称' }, sort: 1 },
    { name: 'profile', type: 'hasOne', target: 'profiles', interface: 'hasOne', sort: 2 },
  ],
  profiles: [{ name: 'bio', type: 'string', interface: 'textarea', uiSchema: { title: '简介' }, sort: 1 }],
  orderItems: [
    { name: 'id', type: 'integer', sort: 1 },
    { name: 'productName', type: 'string', interface: 'input', uiSchema: { title: '商品名称' }, sort: 2 },
    { name: 'qty', type: 'integer', interface: 'integer', uiSchema: { title: '数量' }, sort: 3 },
    { name: 'secret', type: 'string', interface: 'input', hidden: true, sort: 4 },
    { name: 'noInterface', type: 'string', sort: 5 },
    { name: 'tags', type: 'belongsToMany', target: 'tags', interface: 'm2m', sort: 6 },
    { name: 'createdAt', type: 'date', interface: 'datetime', sort: 7 },
  ],
  tags: [{ name: 'name', type: 'string', interface: 'input', uiSchema: { title: '标签名' }, sort: 1 }],
};

const getFields = (name: string) => collections[name];

/** 模拟一条订单记录（items 为已 append 的一对多数据） */
const orderRecord = {
  title: '测试订单',
  items: [
    { name: '苹果', productName: '苹果', qty: 3 },
    { name: '香蕉', productName: '香蕉', qty: 5 },
  ],
};

const itemsTableColumns = [
  { name: 'productName', title: '商品名称' },
  { name: 'qty', title: '数量' },
];

describe('extractFieldValue', () => {
  it('支持点分隔路径提取嵌套值', () => {
    expect(extractFieldValue({ user: { profile: { name: 'a' } } }, 'user.profile.name')).toBe('a');
    expect(extractFieldValue({}, 'user.name')).toBeUndefined();
  });

  it('路径中途为数组时逐元素映射', () => {
    expect(extractFieldValue(orderRecord, 'items.productName')).toEqual(['苹果', '香蕉']);
  });
});

describe('formatDisplayValue', () => {
  it('null/undefined 返回空字符串', () => {
    expect(formatDisplayValue(null)).toBe('');
    expect(formatDisplayValue(undefined)).toBe('');
  });

  it('对象优先取常见标题字段', () => {
    expect(formatDisplayValue({ nickname: '张三' })).toBe('张三');
    expect(formatDisplayValue({ foo: 1 })).toBe('{"foo":1}');
  });

  it('数组逐项格式化后拼接', () => {
    expect(formatDisplayValue([{ name: 'a' }, { name: 'b' }])).toBe('a, b');
    expect(formatDisplayValue(['x', 'y'])).toBe('x, y');
  });
});

describe('buildTableColumns', () => {
  it('过滤系统/隐藏/无界面/关联字段，按 sort 排序，标题兜底字段名', () => {
    const columns = buildTableColumns(collections.orderItems);
    expect(columns).toEqual([
      { name: 'productName', title: '商品名称' },
      { name: 'qty', title: '数量' },
    ]);
  });

  it('去除标题中的 i18n 模板包装', () => {
    const columns = buildTableColumns([
      { name: 'x', type: 'string', interface: 'input', uiSchema: { title: '{{t("Name")}}' } },
    ]);
    expect(columns).toEqual([{ name: 'x', title: 'Name' }]);
  });
});

describe('replaceVariables', () => {
  it('替换普通字段并转义 HTML', () => {
    expect(replaceVariables('<p>{title}</p>', { title: '<b>1</b>' })).toBe('<p>&lt;b&gt;1&lt;/b&gt;</p>');
  });

  it('保留 {page}/{pages} 页码占位符', () => {
    expect(replaceVariables('<p>{page}/{pages}</p>', {})).toBe('<p>{page}/{pages}</p>');
  });

  it('单个块内多个占位符逐个替换', () => {
    expect(replaceVariables('<p>{title}({page})</p>', { title: 'A' })).toBe('<p>A({page})</p>');
  });

  it('数组值无表格列解析器时格式化为文本', () => {
    expect(replaceVariables('<p>{items}</p>', orderRecord)).toBe('<p>苹果, 香蕉</p>');
  });

  it('一对多字段占位符独占块级元素时整体替换为表格', () => {
    const html = '<p>清单如下</p><p>{items}</p><p>结束</p>';
    const result = replaceVariables(html, orderRecord, { getTableColumns: () => itemsTableColumns });
    expect(result).toContain('<p>清单如下</p>');
    expect(result).toContain('<p>结束</p>');
    expect(result).not.toContain('<p><table>');
    expect(result).toContain(
      '<table><thead><tr><th>商品名称</th><th>数量</th></tr></thead><tbody>' +
        '<tr><td>苹果</td><td>3</td></tr><tr><td>香蕉</td><td>5</td></tr></tbody></table>',
    );
  });

  it('一对多字段占位符行内出现时就地替换为表格', () => {
    const result = replaceVariables('清单：{items}', orderRecord, { getTableColumns: () => itemsTableColumns });
    expect(result).toContain('清单：<table>');
  });

  it('非一对多路径不渲染表格', () => {
    const result = replaceVariables('<p>{title}</p>', orderRecord, { getTableColumns: () => itemsTableColumns });
    expect(result).toBe('<p>测试订单</p>');
  });

  it('一对多数据为空数组时渲染只有表头的表格', () => {
    const result = replaceVariables('<p>{items}</p>', { items: [] }, { getTableColumns: () => itemsTableColumns });
    expect(result).toBe('<table><thead><tr><th>商品名称</th><th>数量</th></tr></thead><tbody></tbody></table>');
  });

  it('表格单元格值转义 HTML', () => {
    const html = buildRelationTableHtml([{ productName: '<script>', qty: 1 }], itemsTableColumns);
    expect(html).toContain('<td>&lt;script&gt;</td>');
  });
});

describe('findRelationAppend', () => {
  it('一对多字段本身 → 字段路径', () => {
    expect(findRelationAppend(getFields, 'orders', 'items')).toBe('items');
  });

  it('一对多子字段 → 关联前缀', () => {
    expect(findRelationAppend(getFields, 'orders', 'items.productName')).toBe('items');
  });

  it('多级关联路径 → 最深关联前缀', () => {
    expect(findRelationAppend(getFields, 'orders', 'user.profile.bio')).toBe('user.profile');
  });

  it('本表字段无需 append', () => {
    expect(findRelationAppend(getFields, 'orders', 'title')).toBeNull();
  });

  it('字段不存在时无需 append', () => {
    expect(findRelationAppend(getFields, 'orders', 'notExist')).toBeNull();
    expect(findRelationAppend(getFields, 'orders', 'items.notExist')).toBe('items');
  });
});

describe('getToManyRelationTableColumns', () => {
  it('一对多字段返回目标表展示列', () => {
    expect(getToManyRelationTableColumns(getFields, 'orders', 'items')).toEqual(itemsTableColumns);
  });

  it('多对一/一对一字段不渲染表格', () => {
    expect(getToManyRelationTableColumns(getFields, 'orders', 'user')).toEqual([]);
    expect(getToManyRelationTableColumns(getFields, 'users', 'profile')).toEqual([]);
  });

  it('一对多的子字段不渲染表格', () => {
    expect(getToManyRelationTableColumns(getFields, 'orders', 'items.productName')).toEqual([]);
  });

  it('本表字段不渲染表格', () => {
    expect(getToManyRelationTableColumns(getFields, 'orders', 'title')).toEqual([]);
  });
});

describe('collectTemplateFieldPaths', () => {
  it('收集正文/页眉页脚/二维码中的字段路径，排除页码占位符', () => {
    const qrcodeImg = `<img src="data:image/svg+xml,${encodeURIComponent(
      '<svg><desc>qrcode:field:user.nickname:100:100</desc></svg>',
    )}" />`;
    const content = `<p>{title}</p><p>{items}</p>${qrcodeImg}`;
    const paths = collectTemplateFieldPaths(content, {
      header: { items: [{ type: 'text', text: '第{page}页 单号：{title}' }] },
      footer: { text: '共{pages}页' },
    });
    expect(paths).toEqual(['title', 'items', 'user.nickname']);
  });
});

// ============================================================
// 一对多可编辑表格展开
// ============================================================

/** 向下浮动模板：表头行 + 数据行（含 {items.xxx} 变量） */
const repeatDownwardHtml =
  '<p>明细：</p>' +
  '<table class="ql-print-repeat" style="width:100%">' +
  '<thead><tr><th><p>商品名称</p></th><th><p>数量</p></th></tr></thead>' +
  '<tbody><tr><td><p>{items.productName}</p></td><td><p>{items.qty}</p></td></tr></tbody>' +
  '</table>' +
  '<p>结束</p>';

/** 向右浮动模板：每行首列为 td 模拟表头（灰底 + 居中加粗），第二列为数据单元格 */
const repeatRightwardHtml =
  '<table class="ql-print-repeat ql-print-repeat-rightward" style="width:100%">' +
  '<tbody>' +
  '<tr><td class="ql-print-repeat-header-cell" style="background-color: #f0f0f0; text-align: center;"><p><strong>商品名称</strong></p></td><td><p>{items.productName}</p></td></tr>' +
  '<tr><td class="ql-print-repeat-header-cell" style="background-color: #f0f0f0; text-align: center;"><p><strong>数量</strong></p></td><td><p>{items.qty}</p></td></tr>' +
  '</tbody>' +
  '</table>';

describe('expandRepeatTables', () => {
  it('向下浮动：数据行按记录重复，表头保留，标记 class 移除，结构保留', () => {
    const result = expandRepeatTables(repeatDownwardHtml, orderRecord);
    expect(result).toBe(
      '<p>明细：</p>' +
        '<table style="width:100%">' +
        '<thead><tr><th><p>商品名称</p></th><th><p>数量</p></th></tr></thead>' +
        '<tbody>' +
        '<tr><td><p>苹果</p></td><td><p>3</p></td></tr>' +
        '<tr><td><p>香蕉</p></td><td><p>5</p></td></tr>' +
        '</tbody>' +
        '</table>' +
        '<p>结束</p>',
    );
  });

  it('向右浮动：数据单元格按记录重复一列，表头列样式保留', () => {
    const result = expandRepeatTables(repeatRightwardHtml, orderRecord);
    expect(result).toBe(
      '<table style="width:100%">' +
        '<tbody>' +
        '<tr><td class="ql-print-repeat-header-cell" style="background-color: #f0f0f0; text-align: center;"><p><strong>商品名称</strong></p></td><td><p>苹果</p></td><td><p>香蕉</p></td></tr>' +
        '<tr><td class="ql-print-repeat-header-cell" style="background-color: #f0f0f0; text-align: center;"><p><strong>数量</strong></p></td><td><p>3</p></td><td><p>5</p></td></tr>' +
        '</tbody>' +
        '</table>',
    );
  });

  it('向右浮动：无表头行的默认结构展开后字段标题保留、数据按记录扩展', () => {
    const html =
      '<table class="ql-print-repeat ql-print-repeat-rightward" style="width:100%">' +
      '<tbody>' +
      '<tr><td class="ql-print-repeat-header-cell" style="background-color: #f0f0f0; text-align: center;"><p><strong>商品名称</strong></p></td><td><p>{items.productName}</p></td></tr>' +
      '<tr><td class="ql-print-repeat-header-cell" style="background-color: #f0f0f0; text-align: center;"><p><strong>数量</strong></p></td><td><p>{items.qty}</p></td></tr>' +
      '</tbody>' +
      '</table>';
    const result = expandRepeatTables(html, orderRecord);
    expect(result).toBe(
      '<table style="width:100%">' +
        '<tbody>' +
        '<tr><td class="ql-print-repeat-header-cell" style="background-color: #f0f0f0; text-align: center;"><p><strong>商品名称</strong></p></td><td><p>苹果</p></td><td><p>香蕉</p></td></tr>' +
        '<tr><td class="ql-print-repeat-header-cell" style="background-color: #f0f0f0; text-align: center;"><p><strong>数量</strong></p></td><td><p>3</p></td><td><p>5</p></td></tr>' +
        '</tbody>' +
        '</table>',
    );
  });

  it('向下浮动：关联记录为空时只保留表头', () => {
    const result = expandRepeatTables(repeatDownwardHtml, { ...orderRecord, items: [] });
    expect(result).toBe(
      '<p>明细：</p>' +
        '<table style="width:100%">' +
        '<thead><tr><th><p>商品名称</p></th><th><p>数量</p></th></tr></thead>' +
        '<tbody></tbody>' +
        '</table>' +
        '<p>结束</p>',
    );
  });

  it('向右浮动：关联记录为空时只保留表头列', () => {
    const result = expandRepeatTables(repeatRightwardHtml, { ...orderRecord, items: [] });
    expect(result).toBe(
      '<table style="width:100%">' +
        '<tbody>' +
        '<tr><td class="ql-print-repeat-header-cell" style="background-color: #f0f0f0; text-align: center;"><p><strong>商品名称</strong></p></td></tr>' +
        '<tr><td class="ql-print-repeat-header-cell" style="background-color: #f0f0f0; text-align: center;"><p><strong>数量</strong></p></td></tr>' +
        '</tbody>' +
        '</table>',
    );
  });

  it('支持多级一对多路径（user.items）', () => {
    const html = '<table class="ql-print-repeat"><tbody><tr><td><p>{user.items.name}</p></td></tr></tbody></table>';
    const data = {
      user: {
        items: [{ name: 'a' }, { name: 'b' }],
      },
    };
    const result = expandRepeatTables(html, data);
    expect(result).toBe('<table><tbody><tr><td><p>a</p></td></tr><tr><td><p>b</p></td></tr></tbody></table>');
  });

  it('单元格值转义 HTML 与花括号（避免与后续变量替换混淆）', () => {
    const html = '<table class="ql-print-repeat"><tbody><tr><td><p>{items.name}</p></td></tr></tbody></table>';
    const data = { items: [{ name: 'A<b>{x}' }] };
    const result = expandRepeatTables(html, data);
    expect(result).toBe('<table><tbody><tr><td><p>A&lt;b&gt;&#123;x&#125;</p></td></tr></tbody></table>');
    // 展开后的花括号已转实体，后续 replaceVariables 不会误替换
    expect(replaceVariables(result, data)).toBe(result);
  });

  it('无标记的普通表格不展开', () => {
    const html = '<table style="width:100%"><tbody><tr><td><p>{items.productName}</p></td></tr></tbody></table>';
    expect(expandRepeatTables(html, orderRecord)).toBe(html);
  });

  it('一对多数据非数组时保留原表格（交由普通变量替换处理）', () => {
    const html = '<table class="ql-print-repeat"><tbody><tr><td><p>{items.productName}</p></td></tr></tbody></table>';
    const data = { items: { productName: 'x' } };
    expect(expandRepeatTables(html, data)).toBe(html);
  });
});

describe('stripTemporaryTags', () => {
  it('移除表格内残留的 <temporary> 及其内容（含二维码图片）', () => {
    const html =
      '<table style="width:100%">' +
      '<temporary class="ql-table-temporary" style="width:100%"><img src="data:image/svg+xml,qrcode"/></temporary>' +
      '<thead><tr><th><p>字段名</p></th></tr></thead>' +
      '</table>';
    expect(stripTemporaryTags(html)).toBe(
      '<table style="width:100%">' + '<thead><tr><th><p>字段名</p></th></tr></thead>' + '</table>',
    );
  });

  it('保留表格外正常的内容与图片', () => {
    const html = '<p><img src="data:image/svg+xml,qrcode"/></p><table><tbody><tr><td>x</td></tr></tbody></table>';
    expect(stripTemporaryTags(html)).toBe(html);
  });

  it('多个 <temporary> 全部移除', () => {
    const html = '<temporary class="ql-table-temporary">a</temporary><p>keep</p><temporary>c</temporary>';
    expect(stripTemporaryTags(html)).toBe('<p>keep</p>');
  });
});
