# 主备高可用部署运维方案

> 版本：v2.1（2026-07-22：入口高可用从"独立小机器 Nginx"改为"两台服务器各跑 Nginx + Keepalived VIP 漂移"；v2.0：去掉第三台见证节点，repmgr 改为手动模式，故障扶正由管理员人工执行）
> 适用客户：**只需要高可用（主挂了能快速接管），不需要多机扩容**
> 。

***

## 1. 方案概述

两台服务器，一主一备，**不需要第三台机器**：

- **平时**：两台服务器的 NocoBase 都**运行中**，主服务器的 Keepalived 持有 VIP（虚拟 IP），流量经主服务器 Nginx 转发到本机 NocoBase，备机零流量待命；
- **数据库**：主库 → 备库使用 PostgreSQL 异步流复制，由 repmgr 负责复制管理。**repmgr 运行手动模式（`failover=manual`）：绝不自动扶正备库，是否切换由管理员判断**；
- **数据库连接**：两台应用都连本机 PgBouncer（localhost:6432）。主服务器的 PgBouncer 转发到本机主库；备服务器的 PgBouncer 平时转发到远程主库；
- **主服务器崩溃时**：Keepalived 检测失败，VIP 约 3 秒自动飘到备机，备机 Nginx 接管流量（应用已在运行，请求立即由备机处理）；管理员 SSH 到备机执行 `repmgr standby promote` 扶正备库；repmgr 事件钩子自动把备机 PgBouncer 切到本机数据库——**应用全程零重启、零感知**；
- **RTO** = 管理员响应时间 + 约 1 分钟（promote + PgBouncer 切换）；
- **主服务器恢复后**：降级为新备，通过 repmgr 重新挂接回集群（见 7.4）。

### 1.1 成本与取舍

- **可能丢几秒数据**：采用异步复制，主挂瞬间最近几秒尚未同步到备库的数据会丢失（RPO≈秒级，见 4.2）；
- **切换需要人工介入**：扶正备库由管理员手动执行（VIP 漂移切流量、PgBouncer 切后端是自动的）。这是刻意的取舍：两台机器做自动扶正必须有第三台见证节点仲裁，否则网络分区时可能双主脑裂；**人工判断"主是不是真的死了"就是最可靠的仲裁**——省一台机器，也根除误扶正；
- **必须季度演练**：管理员必须照着第 7 章 Runbook 练熟，目标 1 分钟内完成 promote。不演练的主备等于没有主备。

***

## 2. 总体架构

```
                        用户
                          │
                   ┌──────▼──────┐
                   │  VIP (虚拟IP) │  192.168.1.10
                   │  Keepalived  │  主挂自动飘备
                   └──────┬──────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
      ┌─────▼──────┐            ┌──────▼─────┐
      │  主服务器    │            │  备服务器    │
      │  Nginx     │            │  Nginx     │
      │  (转发到本机)│            │  (转发到本机)│
      │  Keepalived│            │  Keepalived│
      │  MASTER    │            │  BACKUP    │
      │  持有VIP   │            │  待命       │
      │  NocoBase  │            │  NocoBase  │
      │  PgBouncer │            │  PgBouncer │
      │  PG 主库   │───────────▶│  PG 备库   │
      └────────────┘  异步复制    └────────────┘
                          │
                   ┌──────▼──────┐
                   │  云对象存储   │
                   └─────────────┘
```

> 部署形态说明：上图把应用和数据库画在同一台机器上（主服务器 = 应用主 + 数据库主，备服务器 = 应用备 + 数据库备），这是两台机器最省资源的摆法，应用连本机 PgBouncer（`DB_HOST=localhost, DB_PORT=6432`）；备机 PgBouncer 平时转发到远程主库，promote 后由 repmgr 事件钩子自动改指本机（见 4.7）。如果客户有独立的数据库服务器，同样适用——流复制配置不变，PgBouncer 跟着数据库服务器走。

***

## 3. 部署前准备

| 项          | 要求                                     | 验证命令                      |
| ---------- | -------------------------------------- | ------------------------- |
| 服务器        | 2 台，配置相同                               | -                         |
| 操作系统       | Ubuntu 20.04+                          | `lsb_release -a`          |
| NocoBase   | 两台安装**完全相同版本**（代码、插件版本一致）              | `yarn nocobase --version` |
| PostgreSQL | 两台**完全相同大版本**（如都是 16.x）                | `psql --version`          |
| repmgr     | 两台**相同版本**（与 PostgreSQL 大版本匹配）         | `repmgr --version`        |
| PgBouncer  | 两台**相同版本**                             | `pgbouncer --version`     |
| 文件存储       | 云对象存储（OSS/COS/S3），内网可用 MinIO           | 两台 NocoBase 界面检查默认存储一致    |
| Keepalived | 两台都安装，配置 VIP 漂移（两台 `virtual_router_id` 相同）    | `keepalived --version`    |
| Nginx      | 两台都安装，两台配置完全相同                            | `nginx -v`                |
| 网络         | 主备同机房、同一二层网段（VIP 漂移依赖 ARP 广播，云上需用 HAVIP）     | `ping 对端IP`               |

**文件存储必须提前配好**：在两台机器的 NocoBase 界面里把默认存储都配成同一个云对象存储。切换后文件立即可用，**这是主备方案能成立的前提**——如果文件存在主服务器本地硬盘，主一挂文件全丢。

> 下文示例地址：VIP `192.168.1.10`，主服务器 `192.168.1.11`，备服务器 `192.168.1.12`，执行时全部替换为实际地址。

***

## 4. 数据库配置：PostgreSQL 流复制 + repmgr（手动模式）

实施顺序：**4.3 → 4.4 → 4.5 → 4.7**，每步都可执行、可验证。

### 4.1 原理

主库每产生一条数据变更，都会生成一条 WAL 日志（类似"操作录像"）实时发给备库，备库照着录像重演一遍——数据就同步了。延迟通常在毫秒\~秒级。

### 4.2 复制模式：异步（本方案）

| 模式          | 数据丢失                   | 副作用                      |
| ----------- | ---------------------- | ------------------------ |
| **异步（本方案）** | 主挂瞬间可能丢最近几秒的数据（RPO≈秒级） | 备库挂了对主库无影响               |
| 同步          | 零丢失（RPO=0）             | 备库挂了/断了，主库写入会**卡住**，业务中断 |

**本方案选异步**：主库不受备库故障影响，架构简单、运行省心。代价是接受秒级数据丢失（见 1.1）。

### 4.3 主库配置（步骤 1，在主服务器执行）

```bash
# 1. 编辑 postgresql.conf，确认/添加以下配置
wal_level = replica
max_wal_senders = 4
max_replication_slots = 4
shared_preload_libraries = 'repmgr'   # repmgrd 守护进程需要

# 2. 编辑 pg_hba.conf，允许对端拉复制流、允许 repmgr 管理连接
#    （备服务器上也加同样的三行——备库克隆要从主库拉 repmgr 元数据；主备反转后反向复用）
host  replication  replica_user  192.168.1.12/32  scram-sha-256
host  repmgr       repmgr        192.168.1.12/32  scram-sha-256
host  repmgr       repmgr        127.0.0.1/32     scram-sha-256

# 3. 创建复制用户、repmgr 用户和元数据库，并设置密码（scram 认证必须有密码）
sudo -u postgres createuser --replication --login replica_user
sudo -u postgres createuser --superuser --login repmgr
sudo -u postgres createdb -O repmgr repmgr
sudo -u postgres psql -c "ALTER USER replica_user PASSWORD '改为强密码';"
sudo -u postgres psql -c "ALTER USER repmgr PASSWORD '改为强密码';"

# 4. 重启 PostgreSQL 使配置生效
systemctl restart postgresql

# 5. 验证：能创建复制槽说明复制配置已生效（验证完即删除，避免空槽位堆积 WAL）
sudo -u postgres psql -c "SELECT * FROM pg_create_physical_replication_slot('nb_verify_slot');"
sudo -u postgres psql -c "SELECT pg_drop_replication_slot('nb_verify_slot');"
```

> 备库通过 repmgr 克隆后使用 `primary_conninfo` 直连主库（不依赖复制槽）；备库掉队太多时按 4.6 重做克隆即可。

### 4.4 repmgr 配置（步骤 2，两台都执行）

两台都创建 `/etc/repmgr.conf`（差异已在注释中标注）：

```ini
node_id=1                # 主=1，备=2
node_name='node1'        # 主='node1'，备='node2'
conninfo='host=192.168.1.11 port=5432 user=repmgr dbname=repmgr'   # host 填本机 IP
data_directory='/var/lib/pgsql/data'
failover=manual          # 关键：手动模式，repmgrd 只监控记录，绝不自动扶正
monitoring_history=yes
```

为 postgres 系统用户配置密码文件（两台都执行，repmgr 命令免交互输密码）：

```bash
sudo -u postgres bash -c 'printf "*:5432:repmgr:repmgr:改为强密码\n*:5432:replication:replica_user:改为强密码\n" > ~/.pgpass && chmod 600 ~/.pgpass'
```

主库注册（仅在主服务器执行）：

```bash
sudo -u postgres repmgr -f /etc/repmgr.conf primary register

# 验证：应看到 node1 为 primary
sudo -u postgres repmgr -f /etc/repmgr.conf cluster show
```

### 4.5 备库初始化（步骤 3，在备服务器执行）

```bash
# 1. 停掉本地 PG 并清空数据目录（克隆要求空目录）
systemctl stop postgresql
rm -rf /var/lib/pgsql/data/*

# 2. 从主库完整克隆数据
sudo -u postgres repmgr -h 192.168.1.11 -U repmgr -d repmgr -D /var/lib/pgsql/data standby clone

# 3. 启动 PG（启动后自动开始流复制）
systemctl start postgresql

# 4. 注册为备节点（需在备库 PG 启动后执行）
sudo -u postgres repmgr -f /etc/repmgr.conf standby register

# 5. 启动 repmgrd 守护进程（两台都执行：负责监控和事件记录，不做自动切换）
systemctl enable --now repmgrd

# 6. 验证：应看到 2 个节点都 running，node2 的 upstream 是 node1
sudo -u postgres repmgr -f /etc/repmgr.conf cluster show
#  ID | Name  | Role    | Status    | Upstream
#  1  | node1 | primary | * running |
#  2  | node2 | standby |   running | node1
```

### 4.6 备库故障应急

异步复制下**主库完全不受影响**——备库挂了或网络断了，业务无感，发现靠第 8 章的"复制延迟 / 集群状态"告警。修复后重新执行 4.5 的克隆和注册即可挂回。

### 4.7 PgBouncer 配置（步骤 4，两台都执行）

PgBouncer 部署在两台服务器上，作为应用和 PostgreSQL 之间的连接池。两台应用都连本机 PgBouncer，PgBouncer 背后转发到真正的 PostgreSQL。

**主服务器** `/etc/pgbouncer/pgbouncer.ini`：

```ini
[databases]
nocobase = host=localhost port=5432 dbname=nocobase

[pgbouncer]
listen_addr = localhost
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 100
default_pool_size = 20
```

**备服务器** `/etc/pgbouncer/pgbouncer.ini`（平时转发到远程主库）：

```ini
[databases]
nocobase = host=192.168.1.11 port=5432 dbname=nocobase

[pgbouncer]
listen_addr = localhost
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 100
default_pool_size = 20
```

**用户认证** `/etc/pgbouncer/userlist.txt`（两台内容相同）：

```bash
# 在主库查询 scram 密码串，输出直接就是 userlist.txt 需要的格式
sudo -u postgres psql -tA -c "SELECT '\"' || usename || '\" \"' || passwd || '\"' FROM pg_shadow WHERE usename='nocobase_user';"
# 把输出写入两台机器的 /etc/pgbouncer/userlist.txt
```

**切换脚本** `/usr/local/bin/pgbouncer-switch.sh`（两台都放，并 `chmod +x`）：

```bash
#!/bin/bash
# 参数：新主库地址（localhost 或 远程IP）
NEW_HOST=$1

sed -i "s|^nocobase = host=.*|nocobase = host=${NEW_HOST} port=5432 dbname=nocobase|" /etc/pgbouncer/pgbouncer.ini
pgbouncer -d -R /etc/pgbouncer/pgbouncer.ini  # 在线重载，不断现有连接
logger -t pgbouncer "Switched to ${NEW_HOST}"
```

**repmgr 钩子**——`/etc/repmgr.conf` 两台都加：

```ini
# 关键：手动执行 promote/follow 时 repmgr 会产生事件，
# 由事件钩子自动触发 PgBouncer 切换（应用零重启的关键）
event_notifications='standby_promote,standby_follow'
event_notification_command='/usr/local/bin/pgbouncer-follow.sh %e %s "%c"'

# 以下两行仅 repmgrd 自动切换模式生效；本方案 failover=manual 不会触发，
# 保留作为标准语义，实际切换由上面的 event_notification_command 调用同一脚本完成
promote_command='repmgr standby promote -f /etc/repmgr.conf && /usr/local/bin/pgbouncer-switch.sh localhost'
follow_command='repmgr standby follow -f /etc/repmgr.conf && /usr/local/bin/pgbouncer-switch.sh 新主IP'
```

**事件钩子脚本** `/usr/local/bin/pgbouncer-follow.sh`（两台都放，并 `chmod +x`）：

```bash
#!/bin/bash
# repmgr 事件钩子：$1=事件类型 $2=成功(1)/失败(0) $3=新主库 conninfo（仅 follow 事件提供）
EVENT=$1
SUCCESS=$2
CONNINFO=$3

[ "${SUCCESS}" != "1" ] && exit 0

case "${EVENT}" in
  standby_promote)
    # 本机被扶正为新主 → PgBouncer 切到本机
    /usr/local/bin/pgbouncer-switch.sh localhost
    ;;
  standby_follow)
    # 本机跟随新主 → 从 conninfo 解析新主地址，PgBouncer 切过去
    NEW_HOST=$(echo "${CONNINFO}" | sed -n 's/.*host=\([^ ]*\).*/\1/p')
    [ -n "${NEW_HOST}" ] && /usr/local/bin/pgbouncer-switch.sh "${NEW_HOST}"
    ;;
esac
```

> 权限注意：repmgr 钩子以 postgres 系统用户执行，需保证 postgres 用户可写 `/etc/pgbouncer/pgbouncer.ini`（Ubuntu 上 PgBouncer 默认即以 postgres 用户运行），且两个脚本对其可执行。PgBouncer 拒绝以 root 运行，不要以 root 调用重载。

**启动**（两台都执行）：

```bash
systemctl enable --now pgbouncer
```

**验证**：

```bash
# 主服务器：经本机 PgBouncer → 本机主库，应返回 1
psql -h localhost -p 6432 -U nocobase_user -d nocobase -c "SELECT 1;"

# 备服务器：经本机 PgBouncer → 远程主库，同样应返回 1（说明转发链通）
psql -h localhost -p 6432 -U nocobase_user -d nocobase -c "SELECT 1;"
```

***

## 5. 应用层配置

### 5.1 NocoBase 环境变量（步骤 5，两台都配置）

两台都编辑 `.env`：

```bash
# 数据库连接：两台都连本机 PgBouncer（切换时不用改应用配置）
DB_HOST=localhost
DB_PORT=6432
DB_DATABASE=nocobase
DB_USER=nocobase_user
DB_PASSWORD=xxx

# 实例 ID：NocoBase 用雪花 ID 生成全局唯一 ID，其中 5 位是机器编号（0~31），
# 两台都运行就必须手动设成不同值，否则可能生成重复 ID
NOCOBASE_INSTANCE_ID=0   # 主=0，备=1
```

### 5.2 启动应用（步骤 6，两台都执行）

```bash
systemctl enable --now nocobase
```

验证（两台都执行）：

```bash
curl http://localhost:13000/__health_check
# 返回正常即就绪；备机应用此时已在运行，只是 VIP 不在备机，没有入口流量
```

> 备机虽不接流量，后台仍会运行 cron 定时任务和工作流 checker：工作流有 DB 行锁兜底不会重复执行，cron 全仓库仅一个幂等清理任务，无害。

***

## 6. Nginx + Keepalived 配置（步骤 7）

两台服务器都跑 Nginx（各自只转发到本机 NocoBase）和 Keepalived（共同维护一个 VIP）。平时 VIP 在主服务器，主 Nginx 处理全部流量；主 Nginx 或主服务器整机挂了，VIP 自动飘到备机，备机 Nginx 接管。

### 6.1 Nginx 配置（两台相同）

两台都创建 `/etc/nginx/conf.d/nocobase.conf`：

```nginx
upstream nocobase_local {
    server 127.0.0.1:13000;  # 只转发到本机 NocoBase
}

server {
    listen 80;
    server_name _;

    # WebSocket 支持（NocoBase 实时消息推送需要）
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;

    # 健康检查端点（给 Keepalived 检测用，由 Nginx 自身应答，不探后端）
    location /nginx-health {
        access_log off;
        return 200 "OK";
    }

    location / {
        proxy_pass http://nocobase_local;
        proxy_connect_timeout 5s;
        proxy_next_upstream error timeout http_502 http_503 http_504;
    }
}
```

两台都启动：

```bash
systemctl enable --now nginx
```

### 6.2 Keepalived 配置

**主服务器** `/etc/keepalived/keepalived.conf`：

```conf
vrrp_script chk_nginx {
    script "/usr/bin/curl -sf http://127.0.0.1/nginx-health"
    interval 2
    weight -20
}

vrrp_instance VI_1 {
    state MASTER
    interface eth0            # 根据实际网卡修改
    virtual_router_id 51      # 两台必须相同
    priority 100
    advert_int 1

    authentication {
        auth_type PASS
        auth_pass 1111
    }

    virtual_ipaddress {
        192.168.1.10/24       # VIP，根据实际网段修改
    }

    track_script {
        chk_nginx
    }
}
```

**备服务器** `/etc/keepalived/keepalived.conf`（仅 `state` 和 `priority` 不同）：

```conf
vrrp_script chk_nginx {
    script "/usr/bin/curl -sf http://127.0.0.1/nginx-health"
    interval 2
    weight -20
}

vrrp_instance VI_1 {
    state BACKUP
    interface eth0
    virtual_router_id 51
    priority 90               # 比主低
    advert_int 1

    authentication {
        auth_type PASS
        auth_pass 1111
    }

    virtual_ipaddress {
        192.168.1.10/24
    }

    track_script {
        chk_nginx
    }
}
```

启动（两台都执行）：

```bash
systemctl enable --now keepalived
```

验证：

```bash
# 主服务器上应该看到 VIP
ip addr show | grep 192.168.1.10

# 备服务器上不应该看到 VIP
ip addr show | grep 192.168.1.10
```

> 前提：两台服务器必须在同一二层网段、能 ARP 通信（VRRP 漂移依赖二层广播）。云主机不支持二层广播时，改用云厂商的高可用虚拟 IP（HAVIP）或云负载均衡。

### 6.3 工作原理

```
平时：
  用户 → VIP(192.168.1.10) → 主服务器 Keepalived → 主服务器 Nginx → 主服务器 NocoBase

主服务器 Nginx 挂：
  Keepalived 检测 chk_nginx 失败 → priority 降低 → VIP 飘到备服务器
  用户 → VIP → 备服务器 Keepalived → 备服务器 Nginx → 备服务器 NocoBase
  （此时主库还活着，备服务器 NocoBase 经本机 PgBouncer 连远程主库，读写都正常）

主服务器整机宕机：
  Keepalived 检测主死 → VIP 飘到备服务器
  流量路径同上；但备库仍只读，写入报错，需管理员 promote 才恢复写入（见 7.1）
```

> 注意：主服务器 Nginx 平时也处理流量（转发到本机 NocoBase），不是闲着的；备机 Nginx 平时空转待命。

***

## 7. 切换操作（Runbook）

> 当前谁是主，永远以 `repmgr cluster show` 的输出为准，不记机器名字。

### 7.1 主服务器整机宕机（完整流程）

```
检测：
  - Keepalived 检测主死，VIP 自动飘到备服务器（约 3 秒）
  - 用户流量已到备服务器 Nginx → 备服务器 NocoBase
  - 但备库只读，写入报错，应用部分功能受限
      ↓
管理员 SSH 到备机（192.168.1.12）
      ↓
执行：sudo -u postgres repmgr -f /etc/repmgr.conf standby promote
      ↓
repmgr 自动完成（无需人工再操作）：
  1. pg_ctl promote（备库变主库，可写）
  2. repmgr 产生 standby_promote 事件 → 事件钩子执行 pgbouncer-switch.sh localhost
  3. 备机 PgBouncer 改指本机并在线重载，应用连接无感知
      ↓
验证（在备机逐条执行）：
  sudo -u postgres repmgr -f /etc/repmgr.conf cluster show      # node2 显示 primary
  psql -h localhost -p 6432 -U nocobase_user -d nocobase -c "SELECT 1;"   # 能查（主库即可写）
  curl http://192.168.1.10/__health_check                       # 经 VIP 访问应用正常
      ↓
完成：流量在备机，读写正常。RTO = 管理员响应时间 + 约 1 分钟
```

> 兜底：若事件钩子未生效（备机 PgBouncer 仍指向已挂的远程旧主，应用报数据库错误），手动执行一次
> `/usr/local/bin/pgbouncer-switch.sh localhost`，并用 `grep pgbouncer /var/log/syslog` 确认出现 "Switched to localhost"。

### 7.2 主服务器 Nginx 挂，但服务器活着

```
Keepalived 检测 chk_nginx 失败 → VIP 飘到备服务器（约 3 秒）
流量自动切到备服务器 Nginx → 备服务器 NocoBase
（此时主库还活着，备服务器 NocoBase 经本机 PgBouncer 连远程主库，读写都正常，无需人工介入）
      ↓
修复主服务器 Nginx：systemctl start nginx
健康检查通过后 Keepalived 自动把 VIP 抢回主服务器（priority 100 > 90），流量切回
```

### 7.3 备服务器宕机

```
主服务器 Keepalived 继续持有 VIP，读写路径不变，用户无感知
（第 8 章的集群状态/复制延迟告警会提示备机异常）
      ↓
备服务器修复后重新加入：
  - PG：按 7.4 重新 clone + register
  - Nginx：systemctl start nginx
  - Keepalived：systemctl start keepalived（自动回到 BACKUP 待命状态）
```

### 7.4 主恢复后：重新加入为备（角色反转）

旧主修好后**不能直接开机就对外服务**，按下面步骤降级为新备（在旧主上执行）：

```bash
# 1. 停掉本地 PG 并清空数据目录，从新主完整克隆
systemctl stop postgresql
rm -rf /var/lib/pgsql/data/*
sudo -u postgres repmgr -h 192.168.1.12 -U repmgr -d repmgr -D /var/lib/pgsql/data standby clone

# 2. 启动 PG，注册为新备，启动 repmgrd
systemctl start postgresql
sudo -u postgres repmgr -f /etc/repmgr.conf standby register
systemctl enable --now repmgrd

# 3. 本机已变只读备库，把本机 PgBouncer 改指新主库
/usr/local/bin/pgbouncer-switch.sh 192.168.1.12

# 4. 启动应用，恢复"双机运行"状态
systemctl start nocobase

# 5. 启动 Nginx 和 Keepalived（本机原配置为 MASTER/priority 100，
#    健康检查通过后 VIP 会自动抢回本机，流量切回本机应用——属预期行为，见下方说明）
systemctl start nginx
systemctl start keepalived

# 6. 验证
sudo -u postgres repmgr -f /etc/repmgr.conf cluster show   # 旧主显示 standby，upstream 是新主
psql -h localhost -p 6432 -U nocobase_user -d nocobase -c "SELECT 1;"
curl http://localhost:13000/__health_check
curl http://localhost/nginx-health
```

> 角色稳定后**就这样跑着，不主动回切**——多一次切换多一次风险，两台机器配置相同，没有谁"更配"当主。
> 注意：旧主的 Keepalived 配置是 MASTER（priority 100），健康检查通过后会把 VIP 抢回旧主——流量回到旧主服务器，此时旧主应用经本机 PgBouncer 访问远程新主库，读写都正常。若希望流量和主库重新同机，在维护窗口按 7.5 做一次计划内切换即可。

### 7.5 主库进程挂了，但主服务器还活着

主库进程挂了但服务器还活着：Nginx 健康检查仍通过（`/nginx-health` 由 Nginx 自身应答，不探后端），VIP 不会漂移，应用持续报数据库错误，repmgr 手动模式也不会自动扶正。处置（计划内切换也照此操作）：

```
1. 在主服务器上停掉 Nginx：systemctl stop nginx
2. Keepalived 健康检查失败，VIP 约 3 秒飘到备服务器，流量切到备机
3. 备机执行：sudo -u postgres repmgr -f /etc/repmgr.conf standby promote
4. 后续验证同 7.1
5. 修好主库后，按 7.4 把旧主重新挂接为备
```

***

## 8. 监控告警

| 监控项       | 命令                                                              | 告警条件                   |
| --------- | --------------------------------------------------------------- | ---------------------- |
| 复制延迟      | `repmgr node status`                                            | lag > 64MB 或持续增长       |
| 集群状态      | `repmgr cluster show`                                           | 不是 2 nodes running     |
| VIP 位置      | `ip addr show \| grep 192.168.1.10`                             | VIP 应在主服务器；漂移到备机 = 发生 7.1/7.2 场景 |
| Keepalived | `systemctl status keepalived`                                   | 两台都应为 active               |
| Nginx      | `curl http://localhost/nginx-health`                            | 两台都应返回 200                 |
| 备机应用      | `curl localhost:13000/__health_check`                           | 不响应立即告警（备机应用应始终在运行）    |
| PgBouncer | `systemctl status pgbouncer` + `grep pgbouncer /var/log/syslog` | 服务异常，或出现非预期的 Switch 记录 |

**最关键的一条**：VIP 漂移到备机（主服务器失联）告警 = 需要人工执行 7.1。告警必须能叫醒管理员（电话/短信，不只是邮件）——RTO 的大头是管理员响应时间。

***

## 9. 升级流程

利用主备把停机压到最短：

```
1. 维护窗口开始
2. 主服务器停 Nginx：systemctl stop nginx
   （chk_nginx 失败，VIP 约 3 秒飘到备机，流量自动切到备机应用，网站仅秒级抖动）
3. 备机执行：sudo -u postgres repmgr -f /etc/repmgr.conf standby promote
   （PgBouncer 由事件钩子自动切到本机，同 7.1）
4. 备机升级代码，重启应用，执行 yarn nocobase upgrade（数据库迁移，应用重启期间网站短暂不可用）
5. 验证功能正常 → 网站恢复（总停机 ≈ 应用重启 + 升级耗时）
6. 旧主机升级代码到同版本，按 7.4 重新加入为备
```

> 严禁两台同时启动应用执行 upgrade（数据库迁移没有多机保护，会冲突）。

***

## 10. 方案对比速查表

| <br /> | 方案甲（多机集群）  | 方案乙（主备，本方案）                 |
| ------ | ---------- | --------------------------- |
| 机器数    | 多台         | 2 台                         |
| 同时运行应用 | 多台         | 2 台（备机零流量）                  |
| 数据库    | 单库或自行主从    | PG 流复制 + repmgr 管理          |
| 切换方式   | 自动         | **人工 promote（repmgr 手动模式）** |
| 应用重启   | 不需要        | **不需要（PgBouncer 自动切）**      |
| 额外组件   | Redis      | repmgr + PgBouncer + Keepalived |
| 入口高可用  | 单 LB 或云 LB | 双 Nginx + Keepalived VIP      |
| RTO    | 秒级         | 管理员响应 + 1 分钟                |
| RPO    | 0          | 秒级（异步复制）                    |
| 适合     | 访问量大、要求不中断 | 中小规模、可接受人工切换                |

***

## 11. 评审确认清单

- [ ] 异步复制可接受（RPO≈秒级，主挂瞬间可能丢最近几秒数据）
- [ ] 人工切换可接受（RTO = 管理员响应时间 + 约 1 分钟，告警能叫醒人）
- [ ] 季度演练可执行（管理员能照着第 7 章 Runbook 独立完成 promote 和旧主回挂）

