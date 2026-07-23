# 多服务器部署设计方案（plugin-distributed-redis）

> 版本：v1.0（评审稿）
> 目标读者：运维、后端开发、对分布式部署不熟悉的同学
> 状态：待评审
>
> ⚖️ **方案选择提示**：本文是"方案甲（多机集群）"，解决**高可用 + 扩容**两个需求。如果客户**只需要高可用**（主挂了能自动接管，不需要多机分摊流量），请改用 [方案乙：主备高可用部署运维方案](./plan-b-active-standby.md)——零开发、纯运维，本插件不需要开发。

---

## 1. 背景与目标

客户要求把 NocoBase 部署到**多台服务器**上，目的通常有两个：

- **高可用**：一台机器挂了，其他机器继续提供服务，网站不中断；
- **横向扩容**：一台机器扛不住访问量，加机器分摊压力。

### 1.1 当前代码的问题

这套代码默认按"一台服务器"设计。内存就像每个收银员自己的脑子——A 机器脑子里记的东西，B 机器不知道。直接多开几台会出现：

| 现象 | 后果 |
|---|---|
| 实时消息（WebSocket）只发给了本机连接 | 用户收不到通知，消息"丢了" |
| 防重复执行的锁只在单机内存里生效 | 同一件事可能被两台机器各做一遍 |
| 缓存各自为政 | 两台机器看到的数据不一致 |
| 后台任务队列在单机内存里 | 任务只能被产生它的那台机器执行 |

### 1.2 好消息：代码留好了"插座"

核心代码已经为每个单机部件定义了**适配器接口**（插座），只是开源仓库里没给"插头"（Redis 实现）：

| 部件 | 接口（插座） | 默认实现（单机） | 接口位置 |
|---|---|---|---|
| 消息广播 | `IPubSubAdapter` | 无（消息直接丢弃） | `packages/core/server/src/pub-sub-manager/types.ts` |
| 分布式锁 | `ILockAdapter` | `LocalLockAdapter`（进程内互斥锁） | `packages/core/lock-manager/src/lock-manager.ts` |
| 事件队列 | `IEventQueueAdapter` | `MemoryEventQueueAdapter`（进程内+落盘文件） | `packages/core/server/src/event-queue.ts` |
| 实例编号分配 | `WorkerIdAllocatorAdapter` | 随机数（多机会撞号） | `packages/core/server/src/worker-id-allocator.ts` |
| 缓存 | store 注册机制 | memory（LRU） | `packages/core/cache/src/cache-manager.ts` |

### 1.3 本方案的目标

开发一个**纯服务端插件** `@nocobase/plugin-distributed-redis`：启用后自动把上述部件切换为基于 Redis 的实现，让多台服务器通过 Redis 这块"公共黑板"协同工作。同时做到：

- **Redis 挂了不瘫痪**：自动降级回单机版行为，网站照常访问；
- **零业务代码改动**：工作流、异步任务等插件无需任何修改；
- **配置极简**：只需要一个 `REDIS_URL` 环境变量。

---

## 2. 名词解释（30 秒扫盲）

| 名词 | 通俗解释 |
|---|---|
| **Redis** | 一个超快的内存数据库，多用来当"公共黑板"：所有服务器都能读写同一份数据 |
| **Pub/Sub（发布/订阅）** | Redis 的广播功能：一台机器喊一嗓子（publish），所有在听的机器（subscribe）都能收到 |
| **分布式锁** | 跨机器的"厕所门锁"：谁先进去谁锁门，其他机器排队，防止同一件事被做多遍 |
| **事件队列** | 跨机器的"任务纸条箱"：把任务写成纸条扔进箱子，哪台机器空闲哪台拿走执行 |
| **Worker ID** | 每台机器的工号（0~31），生成雪花 ID（snowflake）时要用，撞号会生成重复 ID |
| **Sticky Session（会话保持）** | 负载均衡器让同一个用户始终连同一台机器 |
| **哨兵（Sentinel）** | Redis 的"自动替补机制"：主 Redis 挂了，哨兵自动把备用机扶正 |
| **对象存储（S3/OSS/COS）** | 云厂商的"网络 U 盘"：文件存到云上，任何机器都能访问，按量付费 |
| **NAS / NFS** | 机房里多台机器共同挂载的"共享网络硬盘" |

---

## 3. 总体架构

### 3.1 部署拓扑

```
                        用户浏览器
                            │
                     ┌──────▼──────┐
                     │  负载均衡器   │  (Nginx / SLB，开启 Sticky Session)
                     └──┬───┬───┬──┘
                        │   │   │
              ┌─────────▼┐ ▼┐  ┌▼─────────┐
              │ 应用服务器1 │ ...│ 应用服务器N │   ← 无状态，可随意加减
              └────┬────┘    └────┬────┘
                   │              │
          ┌────────┼──────────────┼────────┐
          │        │              │        │
   ┌──────▼─────┐  │       ┌──────▼─────┐  │
   │ PostgreSQL │◄─┘       │   Redis    │◄─┘
   │  (主数据库) │           │ (公共黑板)  │
   └────────────┘           └────────────┘
        所有业务数据              缓存/广播/锁/队列

        ┌──────────────────────────┐
        │    对象存储 / 共享 NAS      │  ← 上传的文件必须放这里，
        │  (S3/OSS/COS/MinIO/NFS)  │    所有机器都能访问（见第 5 章）
        └──────────────────────────┘
```

**关键认知**：

- 数据库本来就是所有机器共享的，它挂了全挂——这是任何方案都改变不了的；
- Redis 只是新增一个"协同工具"，它的角色是**加速器 + 通讯员**，不是数据的家；
- Redis 挂了，系统降级运行（见第 6 章），不会像数据库挂那样致命。

### 3.2 为什么需要 Sticky Session

WebSocket 是长连接，连接状态存在每台机器的内存里，这个设计无法改动（核心代码如此）。所以负载均衡器必须开启**会话保持**，让同一用户始终连同一台机器。跨机器的消息推送由本插件的 Pub/Sub 适配器负责接力。

---

## 4. 插件详细设计

### 4.1 插件基本信息

| 项 | 内容 |
|---|---|
| 包名 | `@nocobase/plugin-distributed-redis` |
| 位置 | `packages/plugins/@nocobase/plugin-distributed-redis/` |
| 类型 | **纯服务端插件**，无界面、无数据表、无权限配置 |
| 依赖 | `redis` v5（核心包已在用，工作区直接复用，**不新增第三方依赖**） |
| 开关 | 安装并启用即生效；禁用后自动回到单机模式 |

### 4.2 Redis 连接：复用核心内置的连接管理器

核心代码里已经有现成的 [RedisConnectionManager](file:///d:/diy/nocobase/nocobase-new/packages/core/server/src/redis-connection-manager.ts)，它会：

- 读取环境变量 `REDIS_URL`（`packages/core/app/src/config/index.ts` 已接线）；
- 管理多个命名连接（`getConnectionSync('名字')`），自动重连、打日志；
- 应用停止时统一关闭。

**插件不自己创建连接**，全部通过 `this.app.redisConnectionManager.getConnectionSync(key)` 获取。好处：连接复用、配置统一、行为可预期。

计划使用的命名连接：

| 连接 key | 用途 | 为什么单独一个 |
|---|---|---|
| `distributed:pub` | Pub/Sub 发消息 | node-redis 规定：进入订阅模式的连接不能再发命令，收发必须分开 |
| `distributed:sub` | Pub/Sub 收消息 | 同上 |
| `distributed:queue` | 队列的阻塞式拉取（BLMOVE 会挂住连接） | 阻塞命令会独占连接，不能和别人共用 |
| `distributed:lock` | 锁操作 + Worker ID 分配 | 普通短命令，可共用一个 |

> 📌 **适配器不持有连接、不负责关闭**：框架停机时只会统一关闭 `RedisConnectionManager`（以及 pub/sub、workerIdAllocator 的 release），`lockManager.close()` 并不会被框架调用（已核实全仓库无调用点）。因此各适配器的 `close()` 实现为空操作即可，连接生命周期完全交给核心管理，不会泄漏。

### 4.3 适配器一：消息广播（RedisPubSubAdapter）

**要实现的接口**（`packages/core/server/src/pub-sub-manager/types.ts`）：

```typescript
interface IPubSubAdapter {
  isConnected(): Promise<boolean> | boolean;
  connect(): Promise<any>;
  close(): Promise<any>;
  subscribe(channel: string, callback: PubSubCallback): Promise<any>;
  unsubscribe(channel: string, callback: PubSubCallback): Promise<any>;
  publish(channel: string, message: string): Promise<any>;
}
```

**工作原理**：应用启动时核心的 `PubSubManager` 会调用适配器的 `connect()`；之后谁调用 `pubSubManager.publish('ws:sendToUser', ...)`，消息就通过 Redis 广播到**所有**服务器，每台机器收到后检查这个用户是不是连在自己身上，是就推送。

**设计要点**：

- `connect()` 时拿到 `distributed:pub` / `distributed:sub` 两个连接；
- `subscribe` 维护一张"频道 → 回调"的本地映射表（node-redis 一个频道只接受一个监听器，多个回调由适配器自己分发）；
- 断线期间 `publish` 直接告警并丢弃（与现在开源版行为一致，属于预期降级）；
- 谁在用：WebSocket 跨机推送（`ws:sendToUser`）、各插件的配置变更同步（`SyncMessageManager`）。

### 4.4 适配器二：分布式锁（RedisLockAdapter）

**要实现的接口**（`packages/core/lock-manager/src/lock-manager.ts`）：

```typescript
interface ILockAdapter {
  connect(): Promise<void>;
  close(): Promise<void>;
  acquire(key: string, ttl: number): Promise<Releaser>;        // 阻塞式拿锁
  runExclusive<T>(key: string, fn, ttl: number): Promise<T>;   // 拿锁→执行→放锁
  tryAcquire(key: string, timeout?: number): Promise<ILock>;   // 限时拿锁
}
```

**实现方式**（不引入 redlock 等新依赖，用 Redis 原生命令，单实例下是行业标准做法）：

| 操作 | Redis 实现 | 说明 |
|---|---|---|
| 拿锁 | `SET key 随机token NX PX ttl` | `NX`=锁已被占用则失败；`PX`=到期自动释放（防进程崩了锁死）；token 用来标识"锁是谁的" |
| 放锁 | Lua 脚本：token 匹配才 `DEL` | 防止误删别人的锁（A 的锁到期后，B 拿到锁，A 不能删 B 的） |
| 续期 | Lua 脚本：token 匹配才 `PEXPIRE` | 执行前把 TTL 续满 |
| 限时等待 | 每隔 100~200ms 重试，直到 timeout | 对齐 `tryAcquire` 语义（工作流会等最多 60 秒） |

**语义对齐**：本地锁的 TTL 是"硬上限"——到点强制放锁，哪怕任务没跑完。Redis 锁 TTL 到期自然释放，行为一致。工作流真正的防重底线是**数据库行锁**（`FOR UPDATE SKIP LOCKED` + `eventKey` 唯一索引），Redis 锁只是减少无效抢跑的双保险，所以即使锁失效也不会重复执行。

**Key 命名空间**：所有锁 key 统一加前缀 `<应用名>:distributed:lock:`，避免同一套 Redis 上部署多个 NocoBase 应用时互相干扰（核心的 pub/sub 频道和事件队列频道已自带应用名前缀，同理）。

**默认适配器切换**：核心的 `LockManager` 启动时默认用 `local`。插件通过 `registerAdapter('redis', {...})` 注册后，把默认适配器名改为 `redis`（该字段是私有的，需要用类型收窄访问，代码里会写清楚注释）。因为锁适配器是**首次使用时才实例化**的，插件在 `load()` 阶段切换即可抢在所有调用方之前。

### 4.5 适配器三：事件队列（RedisEventQueueAdapter）

**要实现的接口**（`packages/core/server/src/event-queue.ts`）：

```typescript
interface IEventQueueAdapter {
  isConnected(): boolean;
  connect(): Promise<void> | void;
  close(): Promise<void> | void;
  subscribe(channel: string, event: QueueEventOptions): void;
  unsubscribe(channel: string): void;
  publish(channel: string, message: any, options: QueueMessageOptions): Promise<void> | void;
}
```

**数据结构**（每个频道两个 Redis list）：

```
队列键：<channel>                  ← 待处理的任务纸条
处理中键：<channel>:processing     ← 已被某台机器拿走、正在处理的纸条
```

**工作流程**：

```
发布：LPUSH <channel> {消息}
消费：BLMOVE <channel> → <channel>:processing   （原子操作，多台机器抢同一条也不会重复）
成功：LREM <channel>:processing 1 {消息}         （确认销账）
失败：若还有重试次数 → 从处理中列表移回队列末尾；否则记错误日志丢弃
```

**崩溃兜底（有意简化，重点说明）**：如果一台机器拿走消息后突然断电，消息会滞留在"处理中"列表。**本方案不做复杂的跨机器回收器**，理由：

- 队列的主要消费方是工作流，而工作流插件**自带数据库兜底扫描**（`plugin-workflow/src/server/Plugin.ts` 中的 `checker` 定时器）：派发前先落库，丢的消息会被定期从库里重新捡起；
- 异步任务插件同理（任务记录也在数据库里）；
- 换来的是实现简单、行为可预测。文档中会明确告知这一取舍。

**Redis 断线时**：`publish` 抛出异常 → 工作流捕获后走数据库兜底通道，任务不会丢，只是派发变慢（秒级变分钟级）。

### 4.6 适配器四：Worker ID 分配器（RedisWorkerIdAdapter）

**背景**：核心用雪花 ID（snowflake）生成全局唯一 ID，其中 5 位是机器编号（0~31）。开源默认实现是 `Math.floor(Math.random() * 32)` **随机取号**——两台机器撞号就会生成重复 ID，多机部署必须解决。

**要实现的接口**：

```typescript
interface WorkerIdAllocatorAdapter {
  getWorkerId(): Promise<number>;   // 启动时分配一个 0~31 的空闲号
  release(): Promise<void>;         // 停止时释放
}
```

**实现**：依次尝试 `SET worker-id:0 本机标识 NX PX 30秒`、`worker-id:1`…… 抢到第一个空号为止；之后每 10 秒续期一次（保活）；进程正常退出时释放。若 32 个号全被占（同应用超过 32 台机器），启动时报错并给出明确提示。

**清理钩子**：`release()` 必须做两件事——清掉续期定时器、删除占用的 key。框架停机时保证会调用 `workerIdAllocator.release()`（`application.ts` 的停机流程），这是本适配器唯一被保证调用的清理时机。进程被 `kill -9` 时靠 key 的 30 秒 TTL 自然过期释放。key 同样带应用名前缀（`<应用名>:distributed:worker-id:*`）。

### 4.7 缓存（不需要写代码，只给配置）

缓存层核心已内置 Redis 支持，**不在本插件范围内**，只需部署时配置：

```bash
CACHE_DEFAULT_STORE=redis
CACHE_REDIS_URL=redis://localhost:6379/0   # 不配则回退读 REDIS_URL
```

文档中会作为部署清单的一部分强调：不开这个，多机之间缓存不一致（例如角色权限改了，另一台机器要过一会儿才生效）。

### 4.8 插件加载时机

```typescript
// src/server/plugin.ts 的生命周期
async load() {
  // 1. 检查 REDIS_URL，没配 → 告警并跳过全部装配（保持单机模式）
  // 2. 注册并切换锁适配器（要在第一次用锁之前，所以放 load 尽早执行）
  // 3. pubSubManager.setAdapter(...)      —— 核心在 afterStart 时才 connect，来得及
  // 4. eventQueue.setAdapter(...)         —— 同上
  // 5. workerIdAllocator.setAdapter(...)  —— ⚠️ 必须在 app.load() 分配工号之前
}
```

⚠️ 第 5 步有时间竞争：应用在 `load()` 阶段就会调用 `getWorkerId()`（`application.ts`）。插件的 `beforeLoad()` 在所有插件 `load()` 之前执行，但**应用的实例 ID 分配发生在所有插件加载完成之后**（`Application.load()` 内部顺序是先加载插件再分配），所以插件 `load()` 里设置适配器是安全的。实现时会加注释并验证。

---

## 5. 文件服务与共享存储

> 本章不属于插件代码，属于**部署架构必须解决的问题**，但它和多机部署成败直接相关，单独成章讲透。

### 5.1 问题：上传的文件默认存在"本机硬盘"

文件管理插件（`plugin-file-manager`）内置 4 种存储引擎（`src/server/storages/` 目录）：

| 引擎 | 类型标识 | 文件存到哪里 | 多机可用？ |
|---|---|---|---|
| 本地存储（**默认**） | `local` | **本机磁盘** `storage/uploads/` | ❌ 需改造（见 5.2 方案 B） |
| 阿里云 OSS | `ali-oss` | 阿里云对象存储 | ✅ 开箱即用 |
| 腾讯云 COS | `tx-cos` | 腾讯云对象存储 | ✅ 开箱即用 |
| Amazon S3 | `s3` | AWS S3 或兼容服务（MinIO 等） | ✅ 开箱即用 |

单机部署时，用户上传的文件通过 multer 写入**本机磁盘**（默认 `<应用目录>/storage/uploads`，可用环境变量 `LOCAL_STORAGE_DEST` 或存储配置中的 `documentRoot` 改路径），下载时由收到请求的那台机器从自己硬盘读出来返回。

多机部署时问题就来了：用户在 A 机器上传的文件只存在 A 的硬盘里；下一次下载请求被负载均衡分到 B 机器，B 的硬盘上没有这个文件 → **404**。用户看到的现象是"文件时好时坏、刷新几次又能打开"，非常难排查。

### 5.2 三个解决方案（三选一）

> ✅ **决策记录（2026-07-22）：已选定方案 A（现成云对象存储）。** 部署时在"文件管理 → 存储设置"界面配置 OSS / COS / S3 存储并设为默认；纯内网环境用 MinIO 自建。历史文件新旧存储共存，不强制迁移。方案 B/C 仅作为备选资料保留。

**方案 A：换用云对象存储（强烈推荐，已选定 ✅）**

- 做法：在"文件管理 → 存储设置"界面新建一个 OSS / COS / S3 存储并设为默认即可；
- 优点：文件彻底脱离应用服务器，多机天然可用；下载流量不再占用应用服务器带宽；云厂商自带多副本可靠性；
- 代码改动：**零**，纯界面配置；
- 历史文件：附件记录里带有 `storageId`，**新旧存储可以共存**——旧文件继续走 local，新文件走云存储，不强制迁移；如需统一，用 ossutil / COSCMD / `aws s3 sync` 把旧文件传上云后批量更新附件表即可；
- 纯内网不能上云的客户：用 **MinIO** 自建 S3 兼容存储，选 `s3` 引擎对接。

**方案 B：保留本地存储 + 共享网盘**

- 做法：所有应用服务器挂载同一个网络文件系统（NFS / 云厂商 NAS / AWS EFS），每台机器把 `LOCAL_STORAGE_DEST` 指向挂载点（如 `/mnt/nas/uploads`）；
- 优点：应用零配置变更，历史文件不用迁移；
- 缺点：NFS 在高并发写入下有性能和文件锁的坑（需实测）；下载流量仍占应用服务器带宽；NAS 自身也要做高可用，否则成了新的单点；
- 适合：文件量小、纯内网、已有现成 NAS 的客户。

**方案 C：什么都不做（不可行）**

文件随机 404。仅"一主一备、备机平时不服务"的伪多机场景能凑合，不推荐。

> ⚠️ 附带发现：`storages` 表里的存储配置在各实例上是**内存缓存 + 变更广播同步**的（见 `plugin-file-manager` 的 `storagesCache` 与集群测试 `cluster.test.ts`）。这个广播走的正是本插件实现的 Pub/Sub 通道——**本插件启用后，"A 机器改了存储配置、B 机器立刻生效"才成立**；否则要等各机缓存自然过期，期间可能出现"用旧配置上传到错误位置"的情况。

### 5.3 顺带提醒：数据备份文件也在本机磁盘

备份插件（`plugin-backups`）生成的备份包默认也写在**本机** `storage/backups/` 目录。多机部署时备份任务可能由任意一台机器执行，而下载/恢复时可能连到另一台 → 同样建议二选一：

- 把备份目录放共享盘（同方案 B 的 NAS）；或
- 运维流程固定由指定机器执行备份（配合 `WORKER_MODE` 指定专门的后台任务机器）。

---

## 6. 降级策略（Redis 挂了怎么办）

设计原则：**Redis 断线时，系统自动退回"现在开源单机版"的行为，绝不比现在更糟**。

| 部件 | Redis 正常 | Redis 断线 |
|---|---|---|
| 网站访问 / API / 数据库 | 正常 | ✅ 正常（不经过 Redis） |
| 消息广播 | 跨机送达 | 告警日志 + 丢弃（= 现在开源版的行为） |
| 分布式锁 | 跨机互斥 | 退回本机锁（= 现在的行为），并打告警日志 |
| 事件队列 | 跨机派发 | 发布失败 → 业务层走数据库兜底，派发变慢不丢任务 |
| 工作流防重 | Redis 锁 + 数据库行锁双保险 | ✅ 数据库行锁独立兜底，**不会重复执行** |
| Worker ID | Redis 抢占 | 启动时连不上 → 启动失败并明确提示（宁可不启动，不冒撞号风险） |
| 缓存 | 多机共享 | 取决于 `CACHE_DEFAULT_STORE`；断线时查询变慢 |

恢复：node-redis 客户端**自动重连**，各适配器监听重连事件后自动恢复工作（重新订阅频道等），全程无需人工干预。

锁的降级实现细节：`RedisLockAdapter` 内部包一个 `LocalLockAdapter`，Redis 命令抛错时回退到本机锁，并在日志里明确记录"已降级为本机锁，多机互斥暂时失效"。

---

## 7. 配置项（环境变量）

| 变量 | 必填 | 说明 |
|---|---|---|
| `REDIS_URL` | ✅（启用本插件时） | 例：`redis://:password@redis-host:6379/0`。核心的连接管理器读取它 |
| `CACHE_DEFAULT_STORE` | ✅ 必须设 `redis` | 不设则缓存是各机内存：**登录注销黑名单会失效**（见表下说明），且多机数据不一致 |
| `CACHE_REDIS_URL` | 否 | 缓存专用 Redis；不配则复用 `REDIS_URL` |
| `WORKER_MODE` | 否 | 角色拆分：空=全功能；`!`=只接 HTTP 请求；`*`=只跑后台任务。大流量场景可把 Web 和 Worker 分开部署 |
| （预留）哨兵配置 | 否 | 本版预留扩展位，暂不支持哨兵；如需哨兵/集群模式，见第 9 章 |

> 注意：核心 `.env.example` 里已有的 `CLUSTER_MODE`（PM2 单机多进程）**不要**用于本次多机部署——那是单机多进程方案，与多机部署是两回事，且官方注释明确要求配合商业分布式插件。

> ⚠️ **为什么缓存必须切 Redis（排查发现的安全问题）**：登录注销黑名单（`plugin-auth/src/server/token-blacklist.ts`）用布隆过滤器做快速预判——过滤器说"不在黑名单"就**直接放行、不再查数据库**。用各机内存缓存时，在 A 机注销的 token，B 机的过滤器里没有，会被直接放行，**注销形同虚设**。切到共享 Redis 后过滤器全局一致，问题解决。
>
> 补充：Redis 版布隆过滤器依赖 RedisBloom 模块，而多数云托管 Redis 不支持该模块——这种情况下过滤器创建会自动失败并**退化为每次请求直接查数据库表**（`tokenBlacklist` 表是共享的，行为依然正确，只是每个请求多一次 DB 查询），可接受，无需干预。

---

## 8. 部署清单（给客户运维的 checklist）

1. **负载均衡器**：① 开启 Sticky Session（Nginx 用 `ip_hash` 或 cookie 方案；云 SLB 在控制台勾选）；② 开启 WebSocket 支持（转发 Upgrade 头）并把空闲超时调大（WebSocket 是长连接）；③ 健康检查路径用内置的 `GET /__health_check`（`gateway/index.ts` 已提供，无需开发）。
2. **数据库**：所有应用服务器连同一个 PostgreSQL/MySQL。注意连接池容量：`服务器台数 × DB_POOL_MAX（默认 5）` 不能超过数据库的 `max_connections`，机器多了记得同步调大数据库上限。
3. **Redis**：所有应用服务器连同一个 Redis；生产环境建议云托管主备版（见第 9 章）。
4. **环境变量**：每台应用服务器配置 `REDIS_URL`、`CACHE_DEFAULT_STORE=redis`（必须为 redis，原因见第 7 章）。同一套 Redis 可供多个 NocoBase 应用共用——pub/sub 频道、队列频道、锁 key、工号 key 全部带应用名前缀，互不干扰。
5. **文件存储（已选定方案 A，详见第 5 章）**：在"文件管理 → 存储设置"界面新建云对象存储（OSS/COS/S3；纯内网用 MinIO）并设为默认，零代码改动。不要用各机本地磁盘。备份目录 `storage/backups/` 需共享盘或固定备份机器（见 5.3）。
6. **插件**：所有机器都启用 `@nocobase/plugin-distributed-redis`，版本保持一致。
7. **升级流程**（重要）：核心代码的升级/迁移**没有多机互斥保护**。每次发版：
   - 先只启动 **1 台**（或单独的 Job 容器）执行 `yarn nocobase upgrade`；
   - 成功后再滚动启动其余机器；
   - 严禁多台同时首次启动执行升级。
8. **日志**：关注降级告警日志（`已降级为本机锁`、`pubsub 消息丢弃`等关键字），出现即说明 Redis 链路有问题。

---

## 9. Redis 高可用选项（按省心程度排序）

| 方案 | 说明 | 适用 |
|---|---|---|
| **云托管 Redis（推荐）** | 阿里云/腾讯云/AWS 托管版，主备自动切换，挂了几十秒内自愈 | 绝大多数客户，首选 |
| **单实例 Redis** | 一台 Redis，挂了系统降级运行（网站不瘫） | 预算有限、能接受短时降级 |
| **自建哨兵** | 1 主 1 备 + 3 哨兵，自动故障转移；运维成本高 | 有专职运维、数据不出内网 |
| Redis Cluster | 分片集群，本场景用不上这么重的方案 | 不推荐 |

本插件 v1 基于单实例语义实现（SET NX PX + Lua），对托管主备版完全兼容。哨兵客户端支持（node-redis 的 `createSentinel`）作为后续扩展预留。

---

## 10. 风险与限制（如实告知）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 定时任务（cron）在每台机器都会运行（`CronJobManager` 无分布式保护） | 目前全仓库只有 plugin-ai 的凌晨 2 点清理任务，对共享库做幂等删除，多跑几遍无害 | 今后新增 cron 任务必须保证幂等，或用 `WORKER_MODE` 限定执行机器 |
| 队列消息滞留"处理中"列表（消费者断电） | 该任务延迟到数据库兜底扫描时才被重新执行（分钟级） | 工作流/异步任务均有 DB 记录兜底，不丢；后续版本可加回收器 |
| 锁 TTL 到期任务未跑完 | 与本地锁语义相同，另一台机器可能介入 | 工作流有数据库行锁兜底，不会重复执行 |
| Worker ID 只有 32 个号 | 单应用超过 32 台应用服务器时启动报错 | 超出规模需改造 ID 方案（极小概率） |
| 多机时钟漂移 | 影响锁 TTL 精度（毫秒~秒级漂移可忽略） | 所有机器配置 NTP 对时（运维常规操作） |
| 本插件与商业分布式插件互斥 | 同时启用行为未定义 | 文档注明二选一 |

---

## 11. 实施计划

| 阶段 | 内容 | 产出 |
|---|---|---|
| 1 | `yarn pm create` 脚手架 + 插件骨架 | 可启用的空插件 |
| 2 | Pub/Sub 适配器 + Worker ID 分配器（最简单，先打通链路） | 跨机消息可通、工号不撞 |
| 3 | 分布式锁适配器（含降级回本机锁） | 多机互斥 + Redis 断线降级 |
| 4 | 事件队列适配器 | 任务跨机派发 |
| 5 | 测试：锁适配器单测 + 双实例联调 | 测试报告 |
| 6 | 部署文档 + 降级演练（kill Redis 观察行为） | 运维手册 |

**代码注释约定**（应作者要求）：每个适配器文件顶部写"这个文件是干什么的、在整体架构里的位置"；关键逻辑（Lua 脚本、抢锁重试、队列搬移）逐段中文注释；所有降级分支必须注释"什么时候会走到这里"。

---

## 12. 验证方案

### 12.1 本地双实例验证

同一台开发机起两个应用进程（不同端口），共用一个本地 Redis 和一个数据库：

1. 实例 A 登录用户甲，实例 B 登录用户乙，互相触发通知 → 双方都能收到（验证 Pub/Sub）；
2. 配置一个每秒触发的工作流，观察 executions 表 → 无重复执行记录（验证锁 + DB 兜底）；
3. 触发异步任务 → 可被任一实例执行（验证队列）；
4. 检查两台实例的工号不同（验证 Worker ID）。

### 12.2 故障演练

- `kill` 掉 Redis 进程 → 网站照常访问，日志出现降级告警，工作流仍不重复；
- 重启 Redis → 日志显示重连成功，跨机推送恢复；
- `kill -9` 一台应用服务器 → 负载均衡把流量切到另一台，任务由幸存机器接管。

### 12.3 单元测试

锁适配器为核心逻辑（Lua 脚本、重试、降级）编写单元测试；多实例协同场景用 `@nocobase/test` 的 `createMockCluster()` 在单进程内模拟集群（`plugin-workflow`、`plugin-file-manager` 的 `cluster.test.ts` 就是这么测的，不用真起两台机器）。测试需要真实 Redis（通过环境变量 `REDIS_URL` 注入，无 Redis 时跳过）。

---

## 13. 评审确认清单

- [ ] 插件名 `@nocobase/plugin-distributed-redis` 是否合适
- [ ] 队列崩溃恢复"依赖业务层 DB 兜底、不做回收器"的取舍是否接受
- [ ] Redis 高可用走"云托管主备"还是"单实例 + 降级"
- [x] ~~文件存储走方案 A 还是方案 B~~ → **已选定方案 A（云对象存储/MinIO），历史文件共存不强制迁移**（2026-07-22）
- [ ] 是否需要哨兵客户端支持（本版预留、不实现）

---

## 附录 A：多机部署排查清单（已确认安全的点）

以下逐项在代码中核实过，**多机部署下天然安全、无需改造**，存档备查：

| 排查项 | 结论 | 依据 |
|---|---|---|
| 短信/邮箱验证码 | ✅ 安全 | 存在数据库表（`plugin-verification` 的 `verifications` collection），不经过单机内存 |
| 导出 Excel | ✅ 安全 | 流式响应直接返回文件内容，不写临时文件（`plugin-action-export` 的 `export-xlsx.ts`） |
| 登录注销黑名单 | ⚠️ 依赖共享缓存 | 布隆过滤器预判 + 数据库表兜底；**必须** `CACHE_DEFAULT_STORE=redis`，原因见第 7 章 |
| 工作流定时触发器 | ✅ 安全 | `executions.eventKey` 唯一索引去重 + 数据库行锁抢占 |
| 工作流执行抢占 | ✅ 安全 | `FOR UPDATE SKIP LOCKED`（`Dispatcher.ts`），天然多 worker 安全 |
| 负载均衡健康检查 | ✅ 已有 | `GET /__health_check`（`gateway/index.ts` L592），无需开发 |
| 停机清理 | ✅ 框架负责 | 停机流程统一关闭 Redis 连接、关闭 pub/sub、释放工号；锁适配器不持有连接无需清理 |
| 多应用共用一套 Redis | ✅ 安全 | 频道名与各类 key 均带应用名前缀 |
| 存储配置变更同步 | ✅ 本插件覆盖 | `plugin-file-manager` 的 `storagesCache` 经 Pub/Sub 广播同步（见 5.2 附带发现） |
| 定时任务（cron） | ⚠️ 有条件安全 | 全仓库仅 plugin-ai 一个幂等清理任务，多机同跑无害；新增任务须注意（见第 10 章） |
