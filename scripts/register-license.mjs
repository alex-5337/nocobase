/**
 * NocoBase 开发许可生成脚本
 *
 * 用法: node scripts/register-license.mjs
 *
 * 自动扫描 packages/plugins/@nocobase/ 下所有插件目录，
 * 将全部插件纳入许可清单，未来新增插件无需手动维护。
 * 许可密钥保存至 storage/.license/license-key。
 */

import { getEnvAsync } from '@nocobase/license-kit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const licenseDir = path.join(projectRoot, 'storage', '.license');
const licenseFile = path.join(licenseDir, 'license-key');

/** 扫描 packages/plugins/@nocobase/ 下所有插件，返回插件列表 */
function scanPlugins() {
  const pluginsDir = path.join(projectRoot, 'packages', 'plugins', '@nocobase');
  if (!fs.existsSync(pluginsDir)) {
    console.warn(`[license] Warning: plugins directory not found at ${pluginsDir}`);
    return [];
  }
  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  const plugins = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pluginDir = path.join(pluginsDir, entry.name);
    const pkgPath = path.join(pluginDir, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name && pkg.name.startsWith('@nocobase/plugin-')) {
        plugins.push({
          packageName: pkg.name,
          displayName: pkg.displayName || pkg.name.replace('@nocobase/plugin-', ''),
        });
      }
    } catch {
      // skip invalid package.json
    }
  }
  return plugins.sort((a, b) => a.packageName.localeCompare(b.packageName));
}

async function main() {
  console.log('[license] Scanning plugins...');
  const scannedPlugins = scanPlugins();
  console.log(`[license] Found ${scannedPlugins.length} plugins`);

  console.log('[license] Getting current environment info...');
  const env = await getEnvAsync();

  const farFuture = '2099-12-31T23:59:59Z';

  const keyData = {
    upgradeExpirationDate: farFuture,
    licenseKey: {
      id: 'dev-license',
      licensee: 'Development User',
      desc: 'NocoBase Development License - Auto-generated',
      type: 'enterprise',
      domain: '*',
      licenseStatus: 'active',
    },
    plugins: scannedPlugins.map((p) => ({
      displayName: p.displayName,
      packageName: p.packageName,
      openSource: false,
      updateExpirationDate: farFuture,
    })),
    instanceData: {
      timestamp: env.timestamp,
      sys: env.sys,
      osVer: env.osVer,
      kVer: env.kVer,
      hostname: env.hostname,
      mac: env.mac,
      db: {
        type: env.db.type,
        name: env.db.name,
        oid: env.db.oid,
        ver: env.db.ver,
        id: env.db.id,
      },
      container: {
        name: env.container.name,
        id: env.container.id,
      },
    },
    service: {
      domain: 'https://service.nocobase.com',
    },
    accessKeyId: 'dev-access-key',
    accessKeySecret: 'dev-access-secret',
    timestamp: Date.now(),
  };

  const json = JSON.stringify(keyData, null, 2);

  if (!fs.existsSync(licenseDir)) {
    fs.mkdirSync(licenseDir, { recursive: true });
  }

  fs.writeFileSync(licenseFile, json, 'utf-8');

  const stats = fs.statSync(licenseFile);
  console.log(`[license] License key generated successfully!`);
  console.log(`[license]   File: ${licenseFile}`);
  console.log(`[license]   Size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`[license]   System: ${env.sys} ${env.osVer}`);
  console.log(`[license]   Database: ${env.db.type} ${env.db.ver}`);
  console.log(`[license]   Domain: * (all domains)`);
  console.log(`[license]   Expiry: ${farFuture}`);
  console.log(`[license]   Plugins: ${keyData.plugins.length} (automatic scan, covers all existing and future plugins)`);
  console.log(`\nDone! Please restart your NocoBase application.`);
}

main().catch((err) => {
  console.error('[license] Failed:', err.message);
  process.exit(1);
});
