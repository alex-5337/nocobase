/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import mysql from 'mysql2';
import { DatabaseOptions } from '../database';
import { MysqlDialect } from '../dialects/mysql-dialect';

describe('mysql dialect', () => {
  const dialect = new MysqlDialect();

  const getDialectOptions = (options: DatabaseOptions) =>
    dialect.getSequelizeOptions(options).dialectOptions as mysql.ConnectionOptions;

  describe('getSequelizeOptions()', () => {
    it('does not set ssl when ssl is not configured', () => {
      const options = dialect.getSequelizeOptions({ dialect: 'mysql' });
      expect(options.dialectOptions).toEqual({ multipleStatements: true });
      expect(options.ssl).toBeUndefined();
    });

    it('does not set ssl when sslMode is disable', () => {
      const options = dialect.getSequelizeOptions({ dialect: 'mysql', ssl: { sslMode: 'disable' } });
      expect(options.dialectOptions).toEqual({ multipleStatements: true });
      expect(options.ssl).toBeUndefined();
    });

    it('maps sslMode=require to rejectUnauthorized=false and removes the ssl option', () => {
      const options = dialect.getSequelizeOptions({ dialect: 'mysql', ssl: { sslMode: 'require' } });
      expect(getDialectOptions(options).ssl).toEqual({ rejectUnauthorized: false });
      expect(options.ssl).toBeUndefined();
    });

    it('keeps an explicit rejectUnauthorized for require mode', () => {
      const options = dialect.getSequelizeOptions({
        dialect: 'mysql',
        ssl: { sslMode: 'require', rejectUnauthorized: true },
      });
      expect(getDialectOptions(options).ssl).toEqual({ rejectUnauthorized: true });
    });

    it('maps sslMode=verify-ca to rejectUnauthorized=true and forwards ca', () => {
      const options = dialect.getSequelizeOptions({ dialect: 'mysql', ssl: { sslMode: 'verify-ca', ca: 'CA-CERT' } });
      expect(getDialectOptions(options).ssl).toEqual({ rejectUnauthorized: true, ca: 'CA-CERT' });
    });

    it('maps sslMode=verify-full to rejectUnauthorized=true and forwards ca/key/cert', () => {
      const options = dialect.getSequelizeOptions({
        dialect: 'mysql',
        ssl: { sslMode: 'verify-full', ca: 'CA-CERT', key: 'CLIENT-KEY', cert: 'CLIENT-CERT' },
      });
      expect(getDialectOptions(options).ssl).toEqual({
        rejectUnauthorized: true,
        ca: 'CA-CERT',
        key: 'CLIENT-KEY',
        cert: 'CLIENT-CERT',
      });
    });

    it('preserves existing dialectOptions and merges an existing ssl object', () => {
      const options = dialect.getSequelizeOptions({
        dialect: 'mysql',
        dialectOptions: { charset: 'utf8mb4' },
        ssl: { sslMode: 'require', ca: 'CA-CERT' },
      });
      expect(getDialectOptions(options)).toMatchObject({
        charset: 'utf8mb4',
        multipleStatements: true,
        ssl: { ca: 'CA-CERT', rejectUnauthorized: false },
      });
    });
  });

  describe('getVersionGuard()', () => {
    it('extracts the version from a MySQL version string', () => {
      expect(dialect.getVersionGuard().get('8.0.17')).toBe('8.0.17');
      expect(dialect.getVersionGuard().get('10.5.3-MariaDB')).toBe('10.5.3');
    });

    it('falls back to the raw value when the version string does not match', () => {
      expect(dialect.getVersionGuard().get('unknown')).toBe('unknown');
    });
  });
});
