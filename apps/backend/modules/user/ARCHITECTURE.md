# user 模块

## 职责

用户账号与认证：登录/刷新/微信小程序登录绑定、个人偏好、微信订阅消息。

## 文件结构

```
user/
├── user.service.ts           # 用户账号主服务
├── auth.service.ts           # 认证（登录/刷新/绑定）
├── login.post.service.ts     # 登录端点服务
├── preference.service.ts     # 个人偏好
├── wx-subscribe-message.service.ts  # 微信订阅消息
├── system-auth.ts            # 系统认证工具
├── user-security.ts          # 用户安全
└── user.module.ts            # 模块声明
```

## 对外接口

- `UserService` / `AuthService` / `PreferenceService` / `WxSubscribeMessageService`

## 依赖

- `~/utils/prisma`
- `~/utils/jwt-utils` — token 签发/校验
- `~/utils/redis` — token 失效

## 特殊约束

- 认证中间件 `middleware/3.auth.ts` 统一校验，业务层不重复实现
- 登录和 token 刷新只接受未软删除且 ACTIVE 的账号；删除同时写入 `isDeleted=true` 和 `status=INACTIVE`。登录凭据失败与失效刷新统一返回 HTTP 401，不区分账号不存在、禁用或已删除。
- 不存在、软删除、禁用账号也执行固定非秘密哈希的 bcrypt 比较（cost 12），减少与正常账号错密请求的密码校验工作量差异；即使占位比较匹配也不得签发 token。
- 已签发 access token 仍由全局认证中间件检查账号状态；状态缓存最长 60 秒，多实例均按该 TTL 失效，不由登录/刷新入口另建撤销机制。
- 微信绑定走 `api/auth/wx-login`、`wx-bind`、`wx-refresh`
- 密码安全：`user-security.ts` 处理，禁止明文存储
