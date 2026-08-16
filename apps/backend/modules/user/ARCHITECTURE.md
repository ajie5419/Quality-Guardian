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
- 微信绑定走 `api/auth/wx-login`、`wx-bind`、`wx-refresh`
- 密码安全：`user-security.ts` 处理，禁止明文存储
