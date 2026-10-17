# 身份登录桥

本模块只向受控履约系统确认身份，不授予 QMS 业务权限，不创建客户端管理表或管理页面。客户端 id、独立 secret、完整 HTTPS callback 由运维注入 `QMS_IDENTITY_CLIENT_ID`、`QMS_IDENTITY_CLIENT_SECRET`、`QMS_IDENTITY_CALLBACK`。

| 端点（均为 POST） | 认证与结果 |
| --- | --- |
| `/api/identity-bridge/authorize` | 既有业务 Bearer；服务内再次直查 ACTIVE 且未删除。严格验证 client、callback、S256 challenge、state，签发 60 秒一次性码 |
| `/api/identity-bridge/exchange` | `X-Identity-Client-Id`＋`X-Identity-Client-Secret`；code＋verifier＋完整 callback 换取 1 小时不透明身份凭证 |
| `/api/identity-bridge/identity` | 同一客户端认证＋`Authorization: Bearer <integration credential>`；每次查凭证及用户，只返回 `{id,name,active}` |
| `/api/identity-bridge/revoke` | 同一客户端认证＋对应集成凭证；幂等撤销该凭证，不退出 QMS 全局登录 |

旧 Bearer 中间件只对交换、核查、撤销三个完整 POST 路径例外；`/api/auth/` 从未整体公开。防重复中间件对同三个路径例外：不缓存交换输出，不将重放变为成功。授权码核销由 MySQL 事务内条件更新承担，credential 写入失败一并回滚。

`assertIdentityClientHeaders` 对外导出同一套客户端头认证（id 与 secret 均定长摘要恒时比较，仅需 id／secret 两个变量，未配置即 503），供 `fulfillment-sync` 只读同步接口复用。

码和凭证仅存 SHA256；state 由 GC 与浏览器绑定，本模块只校验形式并原样返回。客户端密钥使用固定长度摘要恒时比较，PKCE 另作逐字节比较，避免数据库排序规则扩大相等关系。无 Redis 或内存认证回退。

签发与交换分别按注册 client／直连 IP 限流，每桶每分钟 60 次，最多 2048 桶，满桶拒绝。身份核查及撤销不共用登录桶。此限流仅防单进程突发，多实例部署仍由入口承担总体容量控制；安全核销不依赖该限流。

handler 统一返回固定公开错误，存储／配置错误为 503；不记录请求 body、header、码、verifier 或凭证。logger 显式遮蔽专用 header 及协议敏感字段，新路径日志不保留 query。生产代理也不得记录敏感请求数据。

账号停用／软删除在下一次身份核查拒绝，不承诺中断已经开始的业务事务。过期与已消费记录不再有效；本切片不新增后台清理任务，运维按保留政策安排清理。轮换 client secret 或 GC 加密 key 需要协调发布，不提供无限刷新。

服务与真实 MySQL 集成由 GC 的 `scripts/identity-check.mjs` 覆盖；本模块定向单测验证配置、严格输入、专用认证、限流分离和日志脱敏。浏览器验收与模拟 HTTP 服务证据分别报告。
