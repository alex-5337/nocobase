/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context } from '@nocobase/actions';
import { CollectionOptions, SequelizeDataSource } from '@nocobase/data-source-manager';
import { SequelizeCollectionManager } from '@nocobase/data-source-manager';
import { Database } from '@nocobase/database';

export class ExternalDataSource extends SequelizeDataSource {
  static async testConnection(options: any): Promise<boolean> {
    const db = new Database(options);
    try {
      await db.sequelize.authenticate();
      return true;
    } finally {
      await db.close();
    }
  }

  createCollectionManager(options?: any) {
    const cm = new SequelizeCollectionManager({
      ...(options?.collectionManager || options),
      collectionsFilter: () => true,
    });
    // Database 构造函数会无条件定义 migrations collection 并创建 Umzug migrator，
    // 外部数据源不需要 NocoBase 的迁移追踪，移除该 collection 及其 Sequelize model，
    // 防止任何路径触发 model.sync() 在外部数据库中创建 migrations 表
    cm.db.removeCollection('migrations');
    return cm;
  }

  async load(options: any = {}) {
    const { localData } = options;
    if (localData) {
      for (const [name, collectionOptions] of Object.entries(localData) as [string, any][]) {
        if (name === 'migrations') continue;
        if (!collectionOptions.filterTargetKey && Array.isArray(collectionOptions.fields)) {
          const pkField = collectionOptions.fields.find((f: any) => f.primaryKey);
          if (pkField) {
            collectionOptions.filterTargetKey = pkField.name;
          }
        }
        try {
          this.collectionManager.defineCollection({
            ...collectionOptions,
            introspected: true,
          });
        } catch (e) {
          this.logger?.error?.(`Failed to load collection "${name}": ${e.message}`);
        }
      }
    }

    // 清理历史版本中 Database 实例自动创建的 migrations 系统表
    await this.dropMigrationsTable();
  }

  private async dropMigrationsTable() {
    try {
      const db = this.collectionManager.db;
      const tableName = `${db.options.tablePrefix || ''}migrations`;
      const qi = db.sequelize.getQueryInterface();
      const tables = await qi.showAllTables();
      if (tables.some((t: string) => t.toLowerCase() === tableName.toLowerCase())) {
        await qi.dropTable(tableName);
        this.logger?.info?.(`Dropped NocoBase system table "${tableName}" from external database`);
      }
    } catch (e) {
      this.logger?.warn?.(`Failed to drop migrations table: ${e.message}`);
    }
  }

  async readTables() {
    const allTables = await this.introspector.getTableList();
    const viewList = await this.introspector.getViewList().catch(() => []);

    const loadedNames = new Set(this.collectionManager.getCollections().map((collection) => collection.name));
    // migrations 是 NocoBase Database 实例自动创建的系统表，不应作为用户可选数据表
    loadedNames.add('migrations');

    const tables = allTables.filter((name: string) => !loadedNames.has(name)).map((name: string) => ({ name }));
    const views = viewList
      .filter((name: string) => !loadedNames.has(name))
      .map((name: string) => ({ name, isView: true }));

    return [...tables, ...views];
  }

  async loadTables(ctx: Context, tables: string[]) {
    const results = await Promise.all(
      tables.map(async (tableName) => {
        try {
          const tableInfo = { tableName };
          return await this.introspector.getCollection({ tableInfo });
        } catch (e) {
          this.logger?.error?.(`Failed to introspect table "${tableName}": ${e.message}`);
          return null;
        }
      }),
    );

    const collections = results.filter(Boolean) as CollectionOptions[];

    // 按 main 的逻辑：与已加载（已配置）的 collections 合并，
    // 保留用户在界面上的配置（标题、字段界面配置等），只同步数据库侧的变化
    const loadedCollections: { [name: string]: { name: string; fields: any[] } } = {};
    for (const name of tables) {
      const collection = this.collectionManager.getCollection(name);
      if (collection) {
        loadedCollections[name] = {
          ...collection.options,
          fields: collection.getFields().map((field) => field.options),
        };
      }
    }

    const mergedCollections = this.mergeWithLoadedCollections(collections, loadedCollections);

    for (const collection of mergedCollections) {
      try {
        // 先移除再重新定义，确保已从数据库删除的字段不会残留在内存中
        if (this.collectionManager.hasCollection(collection.name)) {
          this.collectionManager.removeCollection(collection.name);
        }
        this.collectionManager.defineCollection({
          ...collection,
          introspected: true,
        });
      } catch (e) {
        this.logger?.error?.(`Failed to define collection "${collection.name}": ${e.message}`);
      }
    }

    return mergedCollections;
  }

  async close() {
    const db = this.collectionManager?.db;
    if (db) {
      await db.close();
    }
  }

  async cleanCache() {
    // No-op for external data sources
  }
}
