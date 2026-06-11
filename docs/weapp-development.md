# 微信小程序开发文档

## 项目概览

基于 uni-app (Vue 3) 的微信小程序，为一线质检人员提供移动端检验工作流。第一期覆盖检验全流程：报检提交 → 任务派发 → 检验录入 → 结果查看。

小程序目录：`apps/weapp/`

## 技术栈

| 层面     | 技术                                                       |
| -------- | ---------------------------------------------------------- |
| 框架     | uni-app 3.x (Vue 3 Composition API)                        |
| 构建     | Vite + @dcloudio/vite-plugin-uni                           |
| 状态管理 | Pinia                                                      |
| 类型     | TypeScript (vue-tsc 跳过，uni-app-types 与 Vue 3.5 有冲突) |
| 共享包   | @qgs/shared (枚举、DTO 类型)                               |
| UI       | 原生小程序组件 + 自定义样式 (SCSS)                         |

## 目录结构

```
apps/weapp/
├── .env                    # 本地开发 (不提交)
├── .env.production         # 生产环境 (不提交)
├── .stylelintrc.json       # rpx 单位兼容
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── manifest.json       # 小程序 appid、网络配置
│   ├── pages.json          # 路由 + tabBar
│   ├── App.vue             # 应用入口，onLaunch 检查登录态
│   ├── main.ts             # createSSRApp + Pinia
│   ├── uni.scss            # 全局样式变量
│   ├── pages/
│   │   ├── login/index.vue     # 微信登录 + 账号绑定
│   │   ├── home/index.vue      # 首页 (统计卡片 + 快捷入口)
│   │   ├── request/create.vue  # 报检申请表单
│   │   ├── tasks/index.vue     # 任务列表 (状态 tab 筛选)
│   │   ├── tasks/detail.vue    # 任务详情 + 派单
│   │   ├── inspect/result.vue  # 检验结果录入 + 拍照
│   │   └── records/index.vue   # 我的检验记录
│   ├── api/
│   │   ├── request.ts      # uni.request 封装 (token 注入、401 自动刷新)
│   │   ├── auth.ts         # wxLogin / wxBind
│   │   └── inspection.ts   # 检验业务 API
│   ├── stores/
│   │   └── user.ts         # 用户状态 (login、bind、logout)
│   ├── components/         # 共享组件
│   └── static/tab/         # tabBar 图标
└── dist/build/mp-weixin/   # 构建产物 (微信开发者工具加载此目录)
```

## 已实现功能

### 第一期（检验全流程）

| 页面 | 功能 | 调用的后端 API |
| --- | --- | --- |
| 登录 | 微信一键登录 + 首次绑定已有账号 | POST /api/auth/wx-login, POST /api/auth/wx-bind |
| 首页 | 今日检验/待处理/工单统计 + 快捷入口 + 最近任务 | GET /api/qms/workspace |
| 报检申请 | 表单提交 (工单号/工序/零件/数量/优先级/附件) | POST /api/qms/public/inspection/requests |
| 任务列表 | 4 tab 筛选 (全部/待检验/检验中/已完成) + 分页 | GET /api/qms/inspection/requests?mine=true |
| 任务详情 | 任务信息 + 状态时间线 + 派单/开始检验操作 | GET/POST /api/qms/inspection/requests/:id |
| 检验录入 | 检验项逐条填写 + 拍照上传 + 提交 | POST /api/qms/inspection/requests/:id/close |
| 我的记录 | 已完成检验记录列表 | GET /api/qms/inspection/records |

### 认证体系

采用**微信登录 + 绑定已有系统账号**模式：

1. 用户打开小程序 → `wx.login()` 获取 code
2. 后端调用微信 `jscode2session` 换取 openid
3. 查找已绑定用户 → 直接返回 JWT tokens
4. 未绑定 → 返回 `needBind: true` + 临时 sessionToken (5 分钟有效)
5. 用户输入系统账号密码 → 验证通过后绑定 openid → 返回 tokens
6. Token 存储在 `uni.setStorageSync`，请求自动注入 `Authorization: Bearer`
7. 401 时自动尝试 refreshToken，失败则跳转登录页

## 后端新增部分

### 数据库

`users` 表新增字段：

```prisma
wxOpenId  String?  @unique
```

### 新增 API 端点

| 端点 | 文件 | 说明 |
| --- | --- | --- |
| POST /api/auth/wx-login | api/auth/wx-login.post.ts | 微信 code 换 token 或 needBind |
| POST /api/auth/wx-bind | api/auth/wx-bind.post.ts | 绑定微信到已有账号 |
| POST /api/auth/wx-refresh | api/auth/wx-refresh.post.ts | body 传 refreshToken 刷新 |

### 业务逻辑

`modules/user/wx-auth.service.ts` — 三个方法：

- `wxLogin(code)` — 调微信 API → 查绑定 → 返回 tokens 或 needBind
- `wxBind(sessionToken, username, password)` — 验证凭据 → 绑定 openid → 返回 tokens
- `wxRefresh(refreshToken)` — 验证 refresh token → 委托 AuthService 生成新 access token

### 开发模式 Mock

`NODE_ENV=development` 时，如果微信返回 invalid code（模拟器环境），自动返回 mock openid 并走 needBind 流程，方便本地调试。

### Auth 中间件

`middleware/3.auth.ts` 的 `PUBLIC_PATH_PREFIXES` 已添加：

- `/api/auth/wx-login`
- `/api/auth/wx-bind`

### 环境变量

`apps/backend/.env` 新增：

```
WX_APPID=<微信公众平台获取>
WX_APP_SECRET=<微信公众平台获取>
WX_SESSION_SECRET=<随机生成的 32 字节 hex>
```

## 网络架构（生产环境）

```
┌─────────────┐     HTTPS      ┌─────────────────┐     HTTP:80      ┌──────────────────┐
│ 微信小程序   │ ──────────────→ │ Cloudflare CDN  │ ──────────────→  │ 甲骨文 nginx     │
│             │                 │ (SSL 终止)       │                  │ api.tlqms.com    │
└─────────────┘                 └─────────────────┘                  └────────┬─────────┘
                                                                              │ proxy_pass
                                                                              ▼
                                                                     ┌──────────────────┐
                                                                     │ 阿里云 ECS       │
                                                                     │ 8.141.123.254    │
                                                                     │ :5320 (Nitro)    │
                                                                     │ MySQL + OSS 内网  │
                                                                     └──────────────────┘
```

### 域名配置

- 域名：`api.tlqms.com`（Cloudflare 注册，境外域名，无需 ICP 备案）
- DNS：A 记录指向甲骨文服务器 IP，开启 Cloudflare 代理（橙色云）
- SSL：Cloudflare Configuration Rules 单独给 `api.tlqms.com` 设置 Flexible 模式
- 小程序后台：开发管理 → 服务器域名 → request 合法域名添加 `https://api.tlqms.com`

### nginx 反代配置（甲骨文服务器）

文件：`/etc/nginx/conf.d/api-tlqms.conf`

```nginx
server {
    listen 80;
    server_name api.tlqms.com;

    location / {
        proxy_pass http://8.141.123.254:5320;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 60s;
        client_max_body_size 20m;
    }
}
```

### 阿里云安全组

入站规则：TCP 端口 5320，来源 IP 限定为甲骨文服务器公网 IP。

## 本地开发

### 环境配置

`apps/weapp/.env`（不提交）：

```
VITE_API_BASE_URL=http://<你的局域网IP>:5320
```

`apps/weapp/.env.production`（不提交）：

```
VITE_API_BASE_URL=https://api.tlqms.com
```

注意：切换网络后需要更新 `.env` 中的局域网 IP。

### 启动开发

```bash
# 终端 1：启动后端
HOST=0.0.0.0 pnpm --dir apps/backend dev

# 终端 2：小程序编译 (watch 模式)
pnpm --filter @qgs/weapp dev

# 微信开发者工具 → 导入 apps/weapp/dist/dev/mp-weixin/
# 勾选「不校验合法域名」
```

### 生产构建

```bash
pnpm --filter @qgs/weapp build
# 产物：apps/weapp/dist/build/mp-weixin/
# 微信开发者工具 → 上传 → 发布为体验版
```

### 门禁检查

提交前必须通过：

```bash
pnpm lint && pnpm run check:type && pnpm run check:qms-arch
```

weapp 的 typecheck 已配置为跳过（uni-app-types 与 Vue 3.5 全局类型冲突）。

## 部署说明

小程序前端通过微信开发者工具上传到微信服务器，不需要额外部署。后端跟 web 端共用同一个 Nitro 进程（端口 5320），部署一次同时服务 web 和小程序。

### 部署流程

1. 代码推送到 main → release-please 创建 release PR
2. 合并 release PR → 自动打 tag (`qgs-vX.Y.Z`)
3. tag 推送触发 `deploy.yml` → 构建镜像 → 推送 ACR → SSH 部署到 ECS
4. ECS 上 `prisma db push` 同步数据库 → 启动新容器 → 健康检查

### 小程序发布

1. 微信开发者工具 → 上传代码（使用 build 产物）
2. 微信公众平台 → 版本管理 → 提交审核（正式上线）或 设为体验版（内部使用）

## 内部使用方案（无需审核上线）

1. 微信公众平台 → 管理 → 成员管理 → 添加体验成员（最多 100 人）
2. 上传代码后选择「设为体验版」
3. 每位体验成员需在小程序设置中开启「开发调试」模式（允许 HTTP 请求）
4. 或配置 `api.tlqms.com` 到小程序合法域名后，无需开启调试模式

## 单元测试

`apps/backend/modules/user/wx-auth.service.test.ts` — 14 个测试用例：

- wxLogin：已绑定返回 tokens / 未绑定返回 needBind / 微信 API 失败 / 账号禁用 / 缺少环境变量
- wxBind：成功绑定 / session token 无效 / 用户名错误 / 密码错误 / 已绑定其他微信 / 账号禁用
- wxRefresh：成功刷新 / refresh token 无效 / 账号不可用

运行：

```bash
pnpm --dir apps/backend exec vitest run modules/user/wx-auth.service.test.ts
```
