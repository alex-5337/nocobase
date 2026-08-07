/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/* istanbul ignore file -- @preserve */

import { Database, IDatabaseOptions, SSLMode, SSLOptions } from './database';
import fs from 'fs';
import { MysqlDialect } from './dialects/mysql-dialect';
import { SqliteDialect } from './dialects/sqlite-dialect';
import { MariadbDialect } from './dialects/mariadb-dialect';
import { PostgresDialect } from './dialects/postgres-dialect';
import { PoolOptions } from 'sequelize';

function getEnvValue(key, defaultValue?) {
  return process.env[key] || defaultValue;
}

function isFilePath(value) {
  return fs.promises
    .stat(value)
    .then((stats) => stats.isFile())
    .catch((err) => {
      if (err.code === 'ENOENT') {
        return false;
      }

      throw err;
    });
}

function getValueOrFileContent(envVarName) {
  const value = getEnvValue(envVarName);

  if (!value) {
    return Promise.resolve(null);
  }

  return isFilePath(value)
    .then((isFile) => {
      if (isFile) {
        return fs.promises.readFile(value, 'utf8');
      }
      return value;
    })
    .catch((error) => {
      console.error(`Failed to read file content for environment variable ${envVarName}.`);
      throw error;
    });
}

function extractSSLOptionsFromEnv(): Promise<SSLOptions | undefined> {
  return Promise.all([
    getValueOrFileContent('DB_DIALECT_OPTIONS_SSL_MODE'),
    getValueOrFileContent('DB_DIALECT_OPTIONS_SSL_CA'),
    getValueOrFileContent('DB_DIALECT_OPTIONS_SSL_KEY'),
    getValueOrFileContent('DB_DIALECT_OPTIONS_SSL_CERT'),
    getValueOrFileContent('DB_DIALECT_OPTIONS_SSL_REJECT_UNAUTHORIZED'),
  ]).then(([mode, ca, key, cert, rejectUnauthorized]) => {
    if (!mode && !ca && !key && !cert && !rejectUnauthorized) {
      return undefined;
    }

    return {
      sslMode: (mode || 'require') as SSLMode,
      ...(ca ? { ca } : {}),
      ...(key ? { key } : {}),
      ...(cert ? { cert } : {}),
      ...(rejectUnauthorized ? { rejectUnauthorized: rejectUnauthorized === 'true' } : {}),
    };
  });
}

function getPoolOptions(): PoolOptions {
  const options: PoolOptions = {};
  if (process.env.DB_POOL_MAX) {
    options.max = Number.parseInt(process.env.DB_POOL_MAX, 10);
  }
  if (process.env.DB_POOL_MIN) {
    options.min = Number.parseInt(process.env.DB_POOL_MIN, 10);
  }
  if (process.env.DB_POOL_IDLE) {
    options.idle = Number.parseInt(process.env.DB_POOL_IDLE, 10);
  }
  if (process.env.DB_POOL_ACQUIRE) {
    options.acquire = Number.parseInt(process.env.DB_POOL_ACQUIRE, 10);
  }
  if (process.env.DB_POOL_EVICT) {
    options.evict = Number.parseInt(process.env.DB_POOL_EVICT, 10);
  }
  if (process.env.DB_POOL_MAX_USES) {
    options.maxUses = Number.parseInt(process.env.DB_POOL_MAX_USES, 10) || Number.POSITIVE_INFINITY;
  }
  return options;
}

function extractReplicationOptionsFromEnv() {
  // Prefer full JSON config via DB_REPLICATION
  const replicationJson = getEnvValue('DB_REPLICATION');
  if (replicationJson) {
    try {
      return JSON.parse(replicationJson);
    } catch (e) {
      console.error('Failed to parse DB_REPLICATION as JSON:', e);
      return null;
    }
  }

  // Build from individual DB_REPLICA_READ_* env vars
  const readHosts = getEnvValue('DB_REPLICA_READ_HOST');
  if (!readHosts) {
    return null;
  }

  const hosts = readHosts
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  if (hosts.length === 0) {
    return null;
  }

  const portsStr = getEnvValue('DB_REPLICA_READ_PORT', '');
  const ports = portsStr
    ? portsStr
        .split(',')
        .map((p) => parseInt(p.trim(), 10))
        .filter((n) => !isNaN(n))
    : [];

  const usersStr = getEnvValue('DB_REPLICA_READ_USER', '');
  const users = usersStr
    ? usersStr
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean)
    : [];

  const passwordsStr = getEnvValue('DB_REPLICA_READ_PASSWORD', '');
  const passwords = passwordsStr
    ? passwordsStr
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  const databasesStr = getEnvValue('DB_REPLICA_READ_DATABASE', '');
  const databases = databasesStr
    ? databasesStr
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)
    : [];

  const defaultPort = getEnvValue('DB_PORT');
  const defaultUser = getEnvValue('DB_USER');
  const defaultPassword = getEnvValue('DB_PASSWORD');
  const defaultDatabase = getEnvValue('DB_DATABASE');

  const read = hosts.map((host, index) => {
    const config: Record<string, any> = { host };

    if (ports[index]) {
      config.port = ports[index];
    } else if (defaultPort) {
      config.port = parseInt(defaultPort, 10);
    }

    if (users[index]) {
      config.username = users[index];
    } else if (defaultUser) {
      config.username = defaultUser;
    }

    if (passwords[index]) {
      config.password = passwords[index];
    } else if (defaultPassword) {
      config.password = defaultPassword;
    }

    if (databases[index]) {
      config.database = databases[index];
    } else if (defaultDatabase) {
      config.database = defaultDatabase;
    }

    return config;
  });

  const write: Record<string, any> = {
    host: getEnvValue('DB_HOST') || 'localhost',
  };

  if (defaultPort) write.port = parseInt(defaultPort, 10);
  if (defaultUser) write.username = defaultUser;
  if (defaultPassword) write.password = defaultPassword;
  if (defaultDatabase) write.database = defaultDatabase;

  return { read, write };
}

export async function parseDatabaseOptionsFromEnv(): Promise<IDatabaseOptions> {
  const databaseOptions: IDatabaseOptions = {
    logging: process.env.DB_LOGGING == 'on' ? customLogger : false,
    dialect: process.env.DB_DIALECT as any,
    storage: process.env.DB_STORAGE,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT as any,
    timezone: process.env.DB_TIMEZONE,
    tablePrefix: process.env.DB_TABLE_PREFIX,
    schema: process.env.DB_SCHEMA,
    underscored: process.env.DB_UNDERSCORED === 'true',
    pool: getPoolOptions(),
  };

  const sslOptions = await extractSSLOptionsFromEnv();

  if (sslOptions) {
    databaseOptions.ssl = sslOptions;
  }

  const replicationOptions = extractReplicationOptionsFromEnv();
  if (replicationOptions) {
    databaseOptions.replication = replicationOptions;
  }

  return databaseOptions;
}

function customLogger(queryString, queryObject) {
  console.log(queryString);
  if (queryObject?.bind) {
    console.log(queryObject.bind);
  }
}

export async function checkDatabaseVersion(db: Database) {
  await db.dialect.checkDatabaseVersion(db);
}

export function registerDialects() {
  [SqliteDialect, MysqlDialect, MariadbDialect, PostgresDialect].forEach((dialect) => {
    Database.registerDialect(dialect);
  });
}
