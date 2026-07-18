/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Blob / Buffer Polyfill for Node.js。
 *
 * html-docx-js 内部模块 65 的 IIFE 会解析 `global` 为：
 *   typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {}
 *
 * 在 Node 18+ 中，`self` 存在但缺少 `Buffer`/`Blob`。
 * 在 Node < 18 中，`self` 为 undefined，IIFE 会创建一个临时 `{}`，
 * 这个临时对象我们无法 patch —— 因此需要在 globalThis 上主动创建 `self`。
 */
import { Blob, Buffer } from 'buffer';

const g = globalThis as any;

if (typeof g.self === 'undefined') {
  // Node < 18：主动创建 global self 对象并注入必要的 polyfill
  g.self = { Buffer, Blob };
} else {
  // Node 18+：修补已存在的 self 对象
  if (typeof g.self.Buffer === 'undefined') {
    g.self.Buffer = Buffer;
  }
  if (typeof g.self.Blob === 'undefined') {
    g.self.Blob = Blob;
  }
}
