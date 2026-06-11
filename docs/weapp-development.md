# 微信小程序开发文档

## 项目概览

基于 uni-app (Vue 3) 的微信小程序，面向管理员（派工员）和检验员两种角色，覆盖检验全流程：任务派发 → 检验录入 → 结果查看。

小程序目录：`apps/weapp/`

## 技术栈

| 层面     | 技术                                                              |
| -------- | ----------------------------------------------------------------- |
| 框架     | uni-app 3.x (Vue 3 Composition API)                               |
| 构建     | Vite + @dcloudio/vite-plugin-uni                                  |
| 状态管理 | Pinia                                                             |
| 类型     | TypeScript（vue-tsc 跳过，uni-app-types 与 Vue 3.5 全局类型冲突） |
| 共享包   | @qgs/shared (枚举、DTO 类型)                                      |
| UI       | 原生小程序组件 + SCSS 样式                                        |
| 图标     | tabBar PNG 81x81                                                  |

## 目录结构

```
apps/weapp/
├── .env                    # 本地开发环境（不提交）
├── .env.production         # 生产环境（不提交）
├── .stylelintrc.json       # rpx 单位兼容配置
├── package.json            # @qgs/weapp
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── manifest.json       # 小程序 appid、网络配置
│   ├── pages.json          # 路由 + tabBar（首页/任务/记录）
│   ├── App.vue             # 应用入口，onLaunch 检查登录态
│   ├── main.ts             # createSSRApp + Pinia
│   ├── uni.scss            # 全局样式变量
│   ├── env.d.ts            # 类型声明
│   ├── pages/
│   │   ├── home/index.vue      # 首页（角色自适应）
│   │   ├── login/index.vue     # 微信登录 + 账号绑定
│   │   ├── tasks/index.vue     # 任务列表（角色自适应）
│   │   ├── tasks/dispatch.vue  # 派单（管理员）
│   │   ├── inspect/result.vue  # 检验录入（分步表单）
│   │   ├── records/index.vue   # 检验记录
│   │   └── request/create.vue  # 报检申请（未注册路由，保留备用）
│   ├── api/
│   │   ├── request.ts          # uni.request 封装（token 注入、401 自动刷新）
│   │   ├── auth.ts             # wxLogin / wxBind
│   │   └── inspection.ts       # 检验业务 API
│   ├── stores/
│   │   └── user.ts             # 用户状态（login、bind、logout/unbind）
│   ├── components/             # 共享组件
│   └── static/tab/            # tabBar 图标（81x81 PNG）
└── dist/
    ├── dev/mp-weixin/          # dev 模式产物
    └── build/mp-weixin/        # build 模式产物
```

## 角色与页面权限

| 页面                  |   管理员/派工员   |        检验员        |
| --------------------- | :---------------: | :------------------: |
| 首页（待派单/待检验） |   ✅ 显示待派单   |    ✅ 显示待检验     |
| 任务列表              | ✅ SUBMITTED 状态 | ✅ DISPATCHED + mine |
| 派单                  |        ✅         |      ❌ 不可见       |
| 检验录入              |     ❌ 不可见     |          ✅          |
| 检验记录              |        ✅         |          ✅          |

**角色判断**：`userInfo.roles` 数组中包含 `super`/`admin`/`dispatch`/`manager`/`schedule` 之一即为管理员/派工员，否则为检验员。

## 认证体系

### 流程

```
App 启动 → checkAuth()
  ├─ 有 token + userInfo → 进入首页
  └─ 无 token → reLaunch 到登录页

登录页 → 点击"微信一键登录"
  → wx.login() 获取 code
  → POST /api/auth/wx-login { code }
    ├─ 已绑定用户 → 返回 tokens + userPayload → 存储 → 进入首页
    └─ 未绑定 → 返回 needBind: true + sessionToken
      → 显示绑定表单 → 输入账号密码
      → POST /api/auth/wx-bind { sessionToken, username, password }
      → 返回 tokens + userPayload → 存储 → 进入首页

切换账号 → POST /api/auth/wx-unbind（解绑当前微信）
  → 清除本地 token → reLaunch 登录页 → 可绑定其他账号
```

### Token 存储

- `uni.setStorageSync('accessToken', ...)` — JWT access token（7 天）
- `uni.setStorageSync('refreshToken', ...)` — JWT refresh token（30 天）
- `uni.setStorageSync('userInfo', JSON.stringify(...))` — 用户信息缓存

### 401 处理

请求返回 401 时自动尝试 `POST /api/auth/wx-refresh`（body 传 refreshToken）刷新 token。刷新成功则重试原请求；失败则清除存储并跳转登录页。

## 后端 API 端点

### 微信认证（`/api/auth/`）

| 端点 | 鉴权 | 说明 |
| --- | :-: | --- |
| POST /api/auth/wx-login | 公开 | code → openid → tokens 或 needBind |
| POST /api/auth/wx-bind | 公开 | sessionToken + 账号密码 → 绑定 → tokens |
| POST /api/auth/wx-refresh | 需 token | body 传 refreshToken → 新 accessToken |
| POST /api/auth/wx-unbind | 需 token | 解除当前用户的微信绑定 |

### 检验业务（需要 token）

| 端点 | 小程序调用函数 | 说明 |
| --- | --- | --- |
| GET /api/qms/workspace | `getInspectionStats()` | 首页统计数据 |
| GET /api/qms/inspection/requests | `getInspectionRequests()` | 任务列表（支持 status/mine/page 过滤） |
| GET /api/qms/inspection/requests/:id | `getInspectionRequest(id)` | 任务详情 |
| POST /api/qms/inspection/requests/:id/dispatch | `dispatchInspectionRequest()` | 派单 |
| POST /api/qms/inspection/requests/:id/close | `closeInspectionRequest()` | 关闭检验 |
| GET /api/system/user/list | `getUserList()` | 用户列表（含 activeTaskCount） |
| GET /api/auth/departments | `getDepartments()` | 部门列表 |

### 公开 API（无鉴权，`/api/qms/public/`）

| 端点 | 函数 | 说明 |
| --- | --- | --- |
| GET /work-orders?keyword= | `searchWorkOrders()` | 搜索工单 |
| GET /processes?workOrderNumber= | `getProcesses()` | 工单的工序列表 |
| GET /bom-parts?workOrderNumber= | `getBomParts()` | 工单的 BOM 零件 |
| GET /teams?keyword= | `getTeams()` | 班组列表 |
| POST / | `submitInspectionRequest()` | 提交报检（当前路由未注册） |

> 注意：公开 API 当前在小程序中未启用（报检入口已移除），保留代码供后续安全方案确定后使用。

## 检验录入（关闭检验）

### 提交 payload

```typescript
{
  result: 'PASS' | 'FAIL',
  attachments: Array<{ url: string; name: string }>,  // 必填，至少 1 张
  quantity: number,
  qualifiedQuantity: number,   // PASS 时 = quantity, FAIL 时 = 0
  unqualifiedQuantity: number, // PASS 时 = 0, FAIL 时 > 0
  hasDocuments: boolean,
  closeRemark?: string,
  // FAIL 时必填：
  linkedIssue?: {
    partName: string,              // 自动填充
    processName: string,           // 自动填充
    responsibleDepartment: string,
    defectType: string,            // 设计缺陷/制造缺陷/零部件缺陷/工艺缺陷/其他缺陷
    defectSubtype: string,         // 级联选项
    severity: 'Minor' | 'Major' | 'Critical',
    status: 'OPEN',
    description: string,
    rootCause: string,
    solution: string,
    quantity: number,
    lossAmount: number,
  }
}
```

### 分步表单设计

- **PASS 时**：单步完成（结果 + 数量 + 资料开关 + 上传 + 备注）
- **FAIL 时**：3 步向导
  - Step 1：基本信息（结果 + 数量 + 不合格数量 + 资料 + 上传 + 备注）
  - Step 2：不合格品分类（缺陷分类 → 二级分类级联 + 严重程度 + 责任部门）
  - Step 3：补充描述（不合格描述 + 原因分析 + 解决方案 + 损失金额）

## 派单页

- 显示任务信息（编号、工单号、零件、工序、报检人、附件预览）
- 检验员选择（带工作负载状态：空闲 / N条任务）
- 优先级 1-5（可视化按钮）
- 派单备注（选填，200 字）

## 网络架构（生产环境）

```
小程序 → https://api.tlqms.com (Cloudflare SSL) → 甲骨文 nginx:80 → 阿里云 8.141.123.254:5320
```

### 配置要点

- 域名 `api.tlqms.com`：Cloudflare 注册（境外域名，无需 ICP 备案）
- DNS：A 记录 → 甲骨文 IP，开启 Cloudflare 代理（橙色云）
- SSL：Cloudflare Configuration Rules 给 `api.tlqms.com` 设置 Flexible 模式
- nginx：`/etc/nginx/conf.d/api-tlqms.conf` 反代到 `http://8.141.123.254:5320`
- 阿里云安全组：TCP 5320 入站限定甲骨文 IP
- 小程序后台：服务器域名 → request 合法域名添加 `https://api.tlqms.com`

## 本地开发

### 环境变量

`apps/weapp/.env`（不提交）：

```
VITE_API_BASE_URL=http://<你的局域网IP>:5320
```

`apps/weapp/.env.production`（不提交）：

```
VITE_API_BASE_URL=https://api.tlqms.com
```

> 切换网络后需更新 `.env` 中的局域网 IP。

### 启动

```bash
pnpm dev:antd    # 同时启动 backend + web-antd + weapp

# 微信开发者工具 → 导入 apps/weapp/dist/dev/mp-weixin/
# 勾选「不校验合法域名」
```

### 后端监听

后端需要监听所有接口才能被手机/模拟器访问：

- `apps/backend/.env` 中需有 `HOST=0.0.0.0`

### 生产构建

```bash
pnpm --filter @qgs/weapp build
# 产物：apps/weapp/dist/build/mp-weixin/
```

## 发布与内部使用

### 体验版（部门内部 ≤100 人）

1. 微信公众平台 → 成员管理 → 添加体验成员
2. 微信开发者工具 → 上传代码 → 设为体验版
3. 配置 `api.tlqms.com` 到合法域名后，体验成员无需开启调试模式

### 正式发布

1. 微信开发者工具 → 上传代码
2. 微信公众平台 → 版本管理 → 提交审核

## 数据库

`users` 表新增字段：

```prisma
wxOpenId  String?  @unique  // 微信小程序 openid
```

与已有的 `wechatWorkId`（企业微信 ID）是不同字段。

## 单元测试

`apps/backend/modules/user/wx-auth.service.test.ts` — 14 个用例覆盖：

- wxLogin：已绑定/未绑定/API 失败/账号禁用/缺少环境变量
- wxBind：成功/token 无效/用户名错误/密码错误/已绑定其他微信/账号禁用
- wxRefresh：成功/token 无效/账号不可用

```bash
pnpm --dir apps/backend exec vitest run modules/user/wx-auth.service.test.ts
```

## 已知限制

1. **typecheck 跳过**：`@uni-helper/uni-app-types` 与 Vue 3.5 全局类型冲突，weapp 的 typecheck 配置为 echo 跳过
2. **报检入口未启用**：公开 API 有安全风险（任何人都能调用），报检功能待确定安全方案后再启用
3. **开发环境 mock**：`NODE_ENV=development` 时微信 code 无效会自动 mock openid，方便模拟器调试
4. **tabBar 图标**：当前为程序生成的像素图标，建议替换为设计师提供的图标
