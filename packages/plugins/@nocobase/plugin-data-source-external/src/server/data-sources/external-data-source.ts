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
    // factory.create 传入的 options 是扁平结构 { name, host, port, dialect, ... }
    // 而非 { collectionManager: { ... } }，直接传给 SequelizeCollectionManager
    // collectionsFilter 默认只返回 introspected:true 的 collection，
    // 但通过 UI 创建的表不带 introspected 标记，需要显示所有已定义的 collection
    return new SequelizeCollectionManager({
      ...(options?.collectionManager || options),
      collectionsFilter: () => true,
    });
  }

  async load(options: any = {}) {
    const { localData } = options;
    if (localData) {
      for (const [name, collectionOptions] of Object.entries(localData) as [string, any][]) {
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
  }

  async readTables() {
    const allTables = await this.introspector.getTableList();
    const viewList = await this.introspector.getViewList().catch(() => []);

    // 与 main 的 readTables 逻辑一致：已加载的表不再出现在可选列表中
    const loadedNames = new Set(this.collectionManager.getCollections().map((collection) => collection.name));

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
