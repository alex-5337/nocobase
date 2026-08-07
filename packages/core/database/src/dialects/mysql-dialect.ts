/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import mysql from 'mysql2';
import { BaseDialect } from './base-dialect';
import { DatabaseOptions } from '../database';

export class MysqlDialect extends BaseDialect {
  static dialectName = 'mysql';

  getVersionGuard() {
    return {
      sql: 'select version() as version',
      get: (v: string) => {
        const m = /([\d+.]+)/.exec(v);
        return m?.[0] ?? v;
      },
      version: '>=8.0.17',
    };
  }

  getSequelizeOptions(options: DatabaseOptions) {
    // Map NocoBase SSL config (options.ssl.sslMode) to Sequelize dialectOptions.ssl
    const ssl = options.ssl;
    if (ssl?.sslMode && ssl.sslMode !== 'disable') {
      const dialectOptions: mysql.ConnectionOptions = (options.dialectOptions || {}) as mysql.ConnectionOptions;
      const sslConfig: mysql.SslOptions = {
        ...(typeof dialectOptions.ssl === 'object' && dialectOptions.ssl ? dialectOptions.ssl : {}),
      };
      // 'require' enables TLS without server certificate verification;
      // 'verify-ca' / 'verify-full' verify the server certificate.
      // An explicit rejectUnauthorized always wins over the mode default.
      sslConfig.rejectUnauthorized = ssl.rejectUnauthorized ?? ssl.sslMode !== 'require';
      if (ssl.ca) sslConfig.ca = ssl.ca;
      if (ssl.key) sslConfig.key = ssl.key;
      if (ssl.cert) sslConfig.cert = ssl.cert;
      dialectOptions.ssl = sslConfig;
      options.dialectOptions = dialectOptions;
    }

    delete options.ssl;

    const dialectOptions: mysql.ConnectionOptions = {
      ...(options.dialectOptions || {}),
      multipleStatements: true,
    };

    options.dialectOptions = dialectOptions;
    return options;
  }
}
