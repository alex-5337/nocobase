/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import semver from 'semver';
import { BaseDialect } from './base-dialect';

export class PostgresDialect extends BaseDialect {
  static dialectName = 'postgres';

  getSequelizeOptions(options: any) {
    if (!options.hooks) {
      options.hooks = {};
    }

    if (!options.hooks['afterConnect']) {
      options.hooks['afterConnect'] = [];
    }

    // Map NocoBase SSL config (options.ssl.sslMode) to Sequelize dialectOptions.ssl
    if (options.ssl?.sslMode && options.ssl.sslMode !== 'disable') {
      const sslConfig: Record<string, any> = {};

      if (options.ssl.sslMode === 'verify-ca' || options.ssl.sslMode === 'verify-full') {
        sslConfig.rejectUnauthorized = true;
        if (options.ssl.ca) sslConfig.ca = options.ssl.ca;
        if (options.ssl.key) sslConfig.key = options.ssl.key;
        if (options.ssl.cert) sslConfig.cert = options.ssl.cert;
      } else {
        // 'require' mode
        sslConfig.require = true;
        sslConfig.rejectUnauthorized = false;
      }

      options.dialectOptions = options.dialectOptions || {};
      options.dialectOptions.ssl = sslConfig;
    }

    delete options.ssl;

    return options;
  }

  getVersionGuard() {
    return {
      sql: 'select version() as version',
      get: (v: string) => {
        const m = /([\d+.]+)/.exec(v);
        return semver.minVersion(m[0]).version;
      },
      version: '>=10',
    };
  }
}
