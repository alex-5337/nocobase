/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import semver from 'semver';
import { ConnectionOptions as TLSConnectionOptions } from 'tls';
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
    const ssl = options.ssl;
    if (ssl?.sslMode && ssl.sslMode !== 'disable') {
      const sslConfig: TLSConnectionOptions = {};

      if (ssl.sslMode === 'verify-ca') {
        // Verify the CA chain but skip hostname verification.
        sslConfig.checkServerIdentity = () => undefined;
      } else if (ssl.sslMode === 'verify-full') {
        // Verify the CA chain and the hostname (pg always connects with the host as servername).
        sslConfig.servername = options.host;
      }
      // An explicit rejectUnauthorized always wins over the mode default.
      sslConfig.rejectUnauthorized = ssl.rejectUnauthorized ?? ssl.sslMode !== 'require';
      if (ssl.ca) sslConfig.ca = ssl.ca;
      if (ssl.key) sslConfig.key = ssl.key;
      if (ssl.cert) sslConfig.cert = ssl.cert;

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
        return m ? semver.minVersion(m[0])?.version ?? m[0] : v;
      },
      version: '>=10',
    };
  }
}
