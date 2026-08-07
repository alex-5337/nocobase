/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { PostgresDialect } from '../dialects/postgres-dialect';

describe('postgres dialect', () => {
  const dialect = new PostgresDialect();

  describe('getSequelizeOptions()', () => {
    it('initializes hooks and does not set ssl when ssl is not configured', () => {
      const options = dialect.getSequelizeOptions({ dialect: 'postgres' });
      expect(options.hooks).toEqual({ afterConnect: [] });
      expect(options.dialectOptions).toBeUndefined();
      expect(options.ssl).toBeUndefined();
    });

    it('does not set ssl when sslMode is disable', () => {
      const options = dialect.getSequelizeOptions({ dialect: 'postgres', ssl: { sslMode: 'disable' } });
      expect(options.dialectOptions).toBeUndefined();
      expect(options.ssl).toBeUndefined();
    });

    it('maps sslMode=require to rejectUnauthorized=false and removes the ssl option', () => {
      const options = dialect.getSequelizeOptions({ dialect: 'postgres', ssl: { sslMode: 'require' } });
      expect(options.dialectOptions.ssl).toEqual({ rejectUnauthorized: false });
      expect(options.ssl).toBeUndefined();
    });

    it('keeps an explicit rejectUnauthorized for require mode', () => {
      const options = dialect.getSequelizeOptions({
        dialect: 'postgres',
        ssl: { sslMode: 'require', rejectUnauthorized: true },
      });
      expect(options.dialectOptions.ssl).toEqual({ rejectUnauthorized: true });
    });

    it('maps sslMode=verify-ca to rejectUnauthorized=true with hostname verification disabled', () => {
      const options = dialect.getSequelizeOptions({
        dialect: 'postgres',
        ssl: { sslMode: 'verify-ca', ca: 'CA-CERT' },
      });
      expect(options.dialectOptions.ssl).toMatchObject({ rejectUnauthorized: true, ca: 'CA-CERT' });
      expect(typeof options.dialectOptions.ssl.checkServerIdentity).toBe('function');
    });

    it('maps sslMode=verify-full to rejectUnauthorized=true with hostname verification enabled', () => {
      const options = dialect.getSequelizeOptions({
        dialect: 'postgres',
        host: 'db.example.com',
        ssl: { sslMode: 'verify-full', ca: 'CA-CERT', key: 'CLIENT-KEY', cert: 'CLIENT-CERT' },
      });
      expect(options.dialectOptions.ssl).toMatchObject({
        rejectUnauthorized: true,
        servername: 'db.example.com',
        ca: 'CA-CERT',
        key: 'CLIENT-KEY',
        cert: 'CLIENT-CERT',
      });
      expect(options.dialectOptions.ssl.checkServerIdentity).toBeUndefined();
    });

    it('preserves existing dialectOptions and existing hooks', () => {
      const options = dialect.getSequelizeOptions({
        dialect: 'postgres',
        dialectOptions: { statement_timeout: 5000 },
        hooks: { beforeConnect: [() => {}] },
        ssl: { sslMode: 'require' },
      });
      expect(options.dialectOptions).toMatchObject({
        statement_timeout: 5000,
        ssl: { rejectUnauthorized: false },
      });
      expect(options.hooks.afterConnect).toEqual([]);
      expect(options.hooks.beforeConnect).toHaveLength(1);
    });
  });

  describe('getVersionGuard()', () => {
    it('extracts a normalized version from a PostgreSQL version string', () => {
      expect(dialect.getVersionGuard().get('PostgreSQL 16.1 (Ubuntu 22.04.4 LTS)')).toBe('16.1.0');
    });

    it('falls back to the raw value when the version string does not match', () => {
      expect(dialect.getVersionGuard().get('unknown')).toBe('unknown');
    });
  });
});
