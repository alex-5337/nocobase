/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

const { resolve } = require('path');
const { Command } = require('commander');
const { run, nodeCheck, isPackageValid, buildIndexHtml } = require('../util');

/**
 *
 * @param {Command} cli
 */
module.exports = (cli) => {
  cli
    .command('build')
    .allowUnknownOption()
    .argument('[packages...]')
    .option('-v, --version', 'print version')
    .option('-c, --compile', 'compile the @nocobase/build package')
    .option('-r, --retry', 'retry the last failed package')
    .option('-w, --watch', 'watch compile the @nocobase/build package')
    .option('-s, --sourcemap', 'generate sourcemap')
    .option('--no-dts', 'not generate dts')
    .action(async (pkgs, options) => {
      nodeCheck();
      process.env['VITE_CJS_IGNORE_WARNING'] = 'true';
      process.env.APP_ENV = 'production';

      if (pkgs.length === 0) {
        await run('nocobase-v1', ['clean', '--dist']);
      }

      if (options.compile || options.watch || isPackageValid('@nocobase/build/src/index.ts')) {
        await run('yarn', ['build', options.watch ? '--watch' : ''], {
          cwd: resolve(process.cwd(), 'packages/core/build'),
        });
        if (options.watch) return;
      }

      await run('nocobase-build', [
        ...pkgs,
        options.version ? '--version' : '',
        !options.dts ? '--no-dts' : '',
        options.sourcemap ? '--sourcemap' : '',
        options.retry ? '--retry' : '',
      ]);
      buildIndexHtml(true);

      // 全量构建后自动提取客户端资源到 storage/dist-client，
      // 避免前端加载不到与当前版本匹配的资源而白屏
      if (pkgs.length === 0) {
        await run('nocobase-v1', ['client:extract']);
      }
    });
};
