/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import fs from 'fs';
import path from 'path';

export function winPath(path: string) {
  const isExtendedLengthPath = /^\\\\\?\\/.test(path);
  if (isExtendedLengthPath) {
    return path;
  }
  return path.replace(/\\/g, '/');
}

function realpathSync(filePath: string) {
  return fs.realpathSync.native?.(filePath) ?? fs.realpathSync(filePath);
}

/**
 * get relative externals for specific pre-bundle pkg from other pre-bundle deps
 * @note  for example, "compiled/a" can be externalized in "compiled/b" as "../a"
 */
export function getRltExternalsFromDeps(
  depExternals: Record<string, string>,
  current: { name: string; outputDir: string },
) {
  return Object.entries(depExternals).reduce<Record<string, string>>(
    (r, [dep, target]) => {
      // skip self
      if (dep !== current.name) {
        // transform dep externals path to relative path
        r[dep] = winPath(
          path.relative(current.outputDir, path.dirname(target)),
        );
      }

      return r;
    },
    {},
  );
}

/**
 * get package.json path for specific NPM package
 */
export function getDepPkgPath(dep: string, cwd: string) {
  try {
    return realpathSync(require.resolve(`${dep}/package.json`, { paths: [cwd] }));
  } catch {
    const mainFile = require.resolve(`${dep}`, { paths: cwd ? [cwd] : undefined });
    const packageDir = mainFile.slice(0, mainFile.indexOf(dep.replace('/', path.sep)) + dep.length);
    return realpathSync(path.join(packageDir, 'package.json'));
  }
}

/**
 * 从 cwd 逐级向上查找 node_modules/<dep>/package.json。
 * 用于 ESM-only 包：它们的 exports 没有 require/default 条件，
 * require.resolve 会直接抛 ERR_PACKAGE_PATH_NOT_EXPORTED，无法靠常规方式定位。
 */
export function findDepDir(dep: string, cwd: string): string | null {
  let dir = cwd;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', ...dep.split('/'), 'package.json');
    if (fs.existsSync(candidate)) {
      return realpathSync(path.dirname(candidate));
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * 从 package.json 的 exports['.']（或 module/main）中取出 ESM 入口文件相对路径
 */
export function getEsmEntryRel(pkg: Record<string, any>): string {
  const pick = (cond: any): string | null => {
    if (typeof cond === 'string') return cond;
    if (!cond || typeof cond !== 'object') return null;
    for (const key of ['import', 'default', 'require', 'node']) {
      const value = pick(cond[key]);
      if (value) return value;
    }
    return null;
  };
  const dot = pkg.exports && typeof pkg.exports === 'object' && !Array.isArray(pkg.exports) ? pkg.exports['.'] : null;
  return pick(dot) || pkg.module || pkg.main || 'index.js';
}

interface IDepPkg {
  nccConfig: {
    minify: boolean;
    target: string;
    quiet: boolean;
    externals: Record<string, string>;
  };
  depDir: string;
  pkg: Record<string, any>;
  outputDir: string;
  mainFile: string;
  /**
   * ESM-only 依赖（exports 只有 import 条件）无法被 ncc 打包，
   * 构建时改为原样复制到 dist/node_modules，见 buildServerDeps。
   */
  esmOnly: boolean;
}

export function getDepsConfig(cwd: string, outDir: string, depsName: string[], external: string[]) {
  const pkgExternals: Record<string, string> = external.reduce((r, dep) => ({ ...r, [dep]: dep }), {});

  const depExternals = {};
  const deps = depsName.reduce<Record<string, IDepPkg>>((acc, packageName) => {
    let depEntryPath: string;
    let depDir: string;
    let depPkg: Record<string, any>;
    let esmOnly = false;
    try {
      depEntryPath = realpathSync(require.resolve(packageName, { paths: [cwd] }));
      const depPkgPath = getDepPkgPath(packageName, cwd);
      depPkg = require(depPkgPath);
      depDir = path.dirname(depPkgPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
        throw error;
      }
      // ESM-only 包：require.resolve 失败，改为手动定位包目录与 ESM 入口
      const found = findDepDir(packageName, cwd);
      if (!found) {
        throw error;
      }
      esmOnly = true;
      depDir = found;
      depPkg = require(path.join(depDir, 'package.json'));
      depEntryPath = realpathSync(path.join(depDir, getEsmEntryRel(depPkg)));
    }
    const outputDir = path.join(outDir, packageName);
    const mainFile = path.join(outputDir, path.relative(depDir, depEntryPath));
    acc[depEntryPath] = {
      nccConfig: {
        minify: true,
        target: 'es2020',
        quiet: true,
        externals: {},
      },
      depDir,
      pkg: depPkg,
      outputDir,
      mainFile,
      esmOnly,
    }

    return acc;
  }, {})

  // process externals for deps
  Object.values(deps).forEach((depConfig) => {
    const rltDepExternals = getRltExternalsFromDeps(depExternals, {
      name: depConfig.pkg.name!,
      outputDir: depConfig.outputDir,
    });

    depConfig.nccConfig.externals = {
      ...pkgExternals,
      ...rltDepExternals,
    };
  });

  return deps;
}
