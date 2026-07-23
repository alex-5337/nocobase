/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { parseDatabaseOptionsFromEnv } from '@nocobase/database';

describe('database helpers', () => {
  describe('parseDatabaseOptionsFromEnv()', () => {
    it('undefined pool options', async () => {
      const options1 = await parseDatabaseOptionsFromEnv();
      expect(options1).toMatchObject({
        pool: {},
      });
    });

    it('custom pool options', async () => {
      process.env.DB_POOL_MAX = '10';
      process.env.DB_POOL_MIN = '1';
      process.env.DB_POOL_IDLE = '5000';
      process.env.DB_POOL_ACQUIRE = '30000';
      process.env.DB_POOL_EVICT = '2000';
      process.env.DB_POOL_MAX_USES = '0'; // Set to 0 to test default behavior

      const options2 = await parseDatabaseOptionsFromEnv();
      expect(options2.pool).toMatchObject({
        max: 10,
        min: 1,
        idle: 5000,
        acquire: 30000,
        evict: 2000,
        maxUses: Number.POSITIVE_INFINITY, // Default value
      });
    });

    describe('replication options', () => {
      const replicationEnvKeys = [
        'DB_REPLICATION',
        'DB_REPLICA_READ_HOST',
        'DB_REPLICA_READ_PORT',
        'DB_REPLICA_READ_USER',
        'DB_REPLICA_READ_PASSWORD',
        'DB_REPLICA_READ_DATABASE',
      ];

      afterEach(() => {
        for (const key of replicationEnvKeys) {
          delete process.env[key];
        }
      });

      it('no replication env', async () => {
        const options = await parseDatabaseOptionsFromEnv();
        expect(options.replication).toBeUndefined();
      });

      it('full JSON config via DB_REPLICATION', async () => {
        process.env.DB_REPLICATION = JSON.stringify({
          read: [{ host: 'replica1', port: 5433 }],
          write: { host: 'primary', port: 5432 },
        });

        const options = await parseDatabaseOptionsFromEnv();
        expect(options.replication).toMatchObject({
          read: [{ host: 'replica1', port: 5433 }],
          write: { host: 'primary', port: 5432 },
        });
      });

      it('invalid JSON in DB_REPLICATION', async () => {
        process.env.DB_REPLICATION = '{invalid';

        const options = await parseDatabaseOptionsFromEnv();
        expect(options.replication).toBeUndefined();
      });

      it('read replicas with fallback to primary credentials', async () => {
        process.env.DB_HOST = 'primary';
        process.env.DB_PORT = '5432';
        process.env.DB_USER = 'app';
        process.env.DB_PASSWORD = 'secret';
        process.env.DB_DATABASE = 'nocobase';
        process.env.DB_REPLICA_READ_HOST = 'replica1,replica2';

        const options = await parseDatabaseOptionsFromEnv();
        expect(options.replication).toMatchObject({
          read: [
            { host: 'replica1', port: 5432, username: 'app', password: 'secret', database: 'nocobase' },
            { host: 'replica2', port: 5432, username: 'app', password: 'secret', database: 'nocobase' },
          ],
          write: { host: 'primary', port: 5432, username: 'app', password: 'secret', database: 'nocobase' },
        });
      });

      it('per-replica overrides by index', async () => {
        process.env.DB_HOST = 'primary';
        process.env.DB_REPLICA_READ_HOST = 'replica1,replica2';
        process.env.DB_REPLICA_READ_PORT = '5433,5434';
        process.env.DB_REPLICA_READ_USER = 'reader1,reader2';

        const options = await parseDatabaseOptionsFromEnv();
        expect(options.replication.read).toMatchObject([
          { host: 'replica1', port: 5433, username: 'reader1' },
          { host: 'replica2', port: 5434, username: 'reader2' },
        ]);
      });
    });
  });
});
