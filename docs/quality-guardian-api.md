# Quality Guardian API 文档

## 版本信息

- **文档版本：** v1.1
- **生成时间：** 2026-02-12 11:15
- **最后更新：** 2026-02-13 22:08

### 本次修订摘要（v1.1）

- 对齐后端统一响应结构（`code/data/error/message`）
- 补充 `400/404/500` 统一错误响应约定
- 修正业务错误码说明，避免与当前实现不一致
- 新增 `409 Conflict` 约定（唯一约束/业务冲突）
- 增补接口实现约定：`payload mapper`、`query parser`、统一错误响应工具

---

## 目录

1. [基础信息](#1-基础信息)
2. [API 基础规范](#2-api-基础规范)
3. [认证相关接口](#3-认证相关接口)
4. [检验管理接口](#4-检验管理接口)
5. [工单管理接口](#5-工单管理接口)
6. [质量报表接口](#6-质量报表接口)
7. [错误码说明](#7-错误码说明)

---

## 1. 基础信息

**项目名称：** Quality Guardian (质量管理系统)

**技术栈：**

- 前端：Vue 3 + Vite + TypeScript + Ant Design Vue
- 后端：Nitro + Prisma + MySQL
- 认证：JWT (JSON Web Token)

**基础 URL：** `http://localhost:31115/api`

**默认 Content-Type：** `application/json`

---

## 2. API 基础规范

### 请求格式

所有 API 请求必须包含以下标准 HTTP 头：

| Header 名称     | 值                 | 说明                       |
| --------------- | ------------------ | -------------------------- |
| `Content-Type`  | `application/json` | 请求体为 JSON 格式         |
| `Authorization` | `Bearer <token>`   | 认证 Token（除登录接口外） |

### 响应格式

后端统一响应包结构如下（`apps/backend/utils/response.ts`）：

**成功响应：**

```json
{
  "code": 0,
  "data": {},
  "error": null,
  "message": "ok"
}
```

**失败响应：**

```json
{
  "code": -1,
  "data": null,
  "error": null,
  "message": "错误信息"
}
```

**状态码约定：**

- 参数错误：HTTP `400` + 失败响应包
- 未授权：HTTP `401` + 失败响应包
- 禁止访问：HTTP `403` + 失败响应包
- 资源不存在：HTTP `404` + 失败响应包
- 资源冲突：HTTP `409` + 失败响应包
- 服务异常：HTTP `500` + 失败响应包

> 说明：下文中部分历史示例仍使用 `success/data/message` 风格。实际联调与验收应以统一响应包（`code/data/error/message`）为准。

### 实现约定（2026-02-13 起）

为降低重复逻辑与硬编码风险，QMS 接口按以下约定实现：

- API 层只做参数接收、鉴权、编排，不直接堆叠大量 `String/Number/Date` 转换
- 请求数据组装统一下沉到 `utils/*` 的 `build*CreateData/build*UpdateData`
- 查询参数解析统一下沉到 `utils/*` 的 `parse*Query`
- 冲突/不存在/参数错误统一使用响应工具函数（如 `conflictResponse/notFoundResponse/badRequestResponse/internalServerErrorResponse`）

当前已落地模块（摘要）：

- `planning`：错误分支标准化，项目与条目接口去重
- `knowledge`：分类/知识条目 create/update 映射统一
- `quality-loss`：列表查询与创建 payload 映射统一
- `task-dispatch`：创建 payload、父任务晋级判断、ITP 关联校验收敛
- `after-sales/supplier/work-order/inspection`：批量删除、查询解析、权限与错误分支去重

### 分页规范

所有列表接口（如获取检验问题列表、工单列表）遵循统一的分页格式：

| 参数       | 类型   | 必填 | 说明                        |
| ---------- | ------ | ---- | --------------------------- |
| `page`     | Number | 否   | 页码，从 1 开始             |
| `pageSize` | Number | 否   | 每页数量，默认 20，最大 100 |

**分页响应对象：**

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 150,
  "totalPages": 8
}
```

---

## 3. 认证相关接口

### 3.1 用户登录

**接口名称：** 用户登录

**请求方法：** `POST`

**请求路径：** `/auth/login`

**请求头：**

```
Content-Type: application/json
```

**请求体：**

```json
{
  "username": "admin",
  "password": "123456"
}
```

**成功响应：**

```json
{
  "code": 0,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVzZXJO",
    "user": {
      "id": "1",
      "username": "admin",
      "roles": ["super", "admin"],
      "name": "管理员",
      "deptId": "dept-001"
    }
  },
  "message": "登录成功"
}
```

**失败响应：**

```json
{
  "code": -1,
  "data": null,
  "error": "AUTH_FAILED",
  "message": "用户名或密码错误"
}
```

**使用说明：**

- 登录成功后，后续所有请求必须在 `Authorization` 头中携带返回的 `token`
- Token 有效期：7 天
- Token 过期后需要重新登录

---

### 3.2 刷新 Token

**接口名称：** 刷新访问令牌

**请求方法：** `POST`

**请求路径：** `/auth/refresh`

**请求头：**

```
Content-Type: application/json
Authorization: Bearer <旧_token>
```

**请求体：**

```json
{}
```

**成功响应：**

```json
{
  "code": 0,
  "data": {
    "token": "新_token"
  },
  "message": "Token刷新成功"
}
```

**使用说明：**

- 可以在 Token 过期前主动刷新
- 刷新后会获得新的 Token

---

### 3.3 获取当前用户信息

**接口名称：** 获取当前登录用户信息

**请求方法：** `GET`

**请求路径：** `/auth/me`

**请求头：**

```
Authorization: Bearer <token>
```

**成功响应：**

```json
{
  "code": 0,
  "data": {
    "id": "1",
    "username": "admin",
    "roles": ["super", "admin"],
    "name": "管理员",
    "deptId": "dept-001"
  },
  "message": "获取成功"
}
```

---

## 4. 检验管理接口

### 4.1 获取检验问题列表

**接口名称：** 获取检验问题列表（分页）

**请求方法：** `GET`

**请求路径：** `/qms/inspection/issues`

**请求头：**

```
Authorization: Bearer <token>
```

**查询参数：** | 参数 | 类型 | 必填 | 说明 | |------|------|------|------| | `page` | Number | 否 | 页码，默认 1 | | `pageSize` | Number | 否 | 每页数量，默认 20 | | `status` | String | 否 | 状态筛选：OPEN, IN_PROGRESS, CLOSED | | `startDate` | String | 否 | 开始日期，格式 YYYY-MM-DD | | `endDate` | String | 否 | 结束日期，格式 YYYY-MM-DD | | `ncNumber` | String | 否 | 不符合单号搜索 |

**请求示例：**

```bash
GET /api/qms/inspection/issues?page=1&pageSize=20&status=OPEN
```

**成功响应：**

```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": "1",
        "ncNumber": "NC-2024-001",
        "description": "产品表面划伤",
        "severity": "High",
        "status": "OPEN",
        "inspector": "admin",
        "responsibleDepartment": "生产部",
        "reportDate": "2024-01-15",
        "createdAt": "2024-01-15T08:00:00Z",
        "updatedAt": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "message": "查询成功"
}
```

---

### 4.2 创建检验问题

**接口名称：** 创建新的检验问题

**请求方法：** `POST`

**请求路径：** `/qms/inspection/issues`

**请求头：**

```
Content-Type: application/json
Authorization: Bearer <token>
```

**请求体：**

```json
{
  "ncNumber": "NC-2024-002",
  "description": "产品尺寸超差",
  "severity": "High",
  "responsibleDepartment": "生产部",
  "partName": "A部件",
  "processName": "加工工序",
  "inspector": "admin",
  "projectName": "项目A",
  "supplierName": "供应商B",
  "defectType": "尺寸问题",
  "defectSubtype": "长度超差",
  "rootCause": "设备精度不足",
  "solution": "调整设备参数",
  "photos": ["photo1.jpg", "photo2.jpg"],
  "lossAmount": 5000,
  "claim": "Yes",
  "status": "OPEN",
  "reportDate": "2024-01-15"
}
```

**成功响应：**

```json
{
  "code": 0,
  "data": {
    "id": "2",
    "ncNumber": "NC-2024-002"
  },
  "message": "创建成功"
}
```

**字段说明：**

- `ncNumber`: 不符合单号（唯一）
- `description`: 问题描述
- `severity`: 严重等级（High, Medium, Low）
- `status`: 状态（OPEN, IN_PROGRESS, CLOSED）
- `inspector`: 检验员（必须是 `users` 表中存在的用户名）
- `lossAmount`: 损失金额（可选）
- `claim`: 是否索赔（Yes/No）
- `photos`: 问题图片（可选）

---

### 4.3 更新检验问题

**接口名称：** 更新检验问题信息

**请求方法：** `PUT`

**请求路径：** `/qms/inspection/issues/:id`

**请求头：**

```
Content-Type: application/json
Authorization: Bearer <token>
```

**路径参数：**

- `id`: 检验问题 ID（必填）

**请求体：**

```json
{
  "ncNumber": "NC-2024-002-NEW",
  "description": "产品尺寸超差（已修正）",
  "severity": "Low",
  "status": "CLOSED",
  "solution": "已重新加工"
}
```

**成功响应：**

```json
{
  "code": 0,
  "data": {
    "id": "2",
    "updatedAt": "2024-01-15T14:00:00Z"
  },
  "message": "更新成功"
}
```

**权限说明：**

- 只有问题的创建者或具有 `super`、`admin` 角色的用户可以更新
- 其他用户更新会返回 `403 Forbidden`

---

### 4.4 删除检验问题

**接口名称：** 删除检验问题

**请求方法：** `DELETE`

**请求路径：** `/qms/inspection/issues/:id`

**请求头：**

```
Authorization: Bearer <token>
```

**路径参数：**

- `id`: 检验问题 ID（必填）

**成功响应：**

```json
{
  "code": 0,
  "data": null,
  "error": null,
  "message": "删除成功"
}
```

**权限说明：**

- 只有问题的创建者或具有 `super`、`admin` 角色的用户可以删除
- 普通用户只能删除自己创建的问题

---

## 5. 工单管理接口

### 5.1 创建工单

**接口名称：** 创建质量工单

**请求方法：** `POST`

**请求路径：** `/qms/work-order`

**请求头：**

```
Content-Type: application/json
Authorization: Bearer <token>
```

**请求体：**

```json
{
  "relatedIssueId": "2",
  "woNumber": "WO-2024-001",
  "title": "质量改进",
  "description": "针对检验问题 NC-2024-002 的改进措施",
  "priority": "High",
  "assignedTo": "张三",
  "targetDept": "生产部",
  "dueDate": "2024-01-20",
  "status": "OPEN"
}
```

**成功响应：**

```json
{
  "code": 0,
  "data": {
    "id": "WO-2024-001",
    "woNumber": "WO-2024-001"
  },
  "message": "工单创建成功"
}
```

**字段说明：**

- `woNumber`: 工单编号（唯一）
- `priority`: 优先级（High, Medium, Low）
- `assignedTo`: 委任人（必须是 `users` 表中存在的用户名）
- `dueDate`: 截止日期（格式 YYYY-MM-DD）
- `status`: 状态（OPEN, IN_PROGRESS, CLOSED）

---

### 5.2 更新工单状态

**接口名称：** 更新工单进度

**请求方法：** `PUT`

**请求路径：** `/qms/work-order/:id`

**请求头：**

```
Content-Type: application/json
Authorization: Bearer <token>
```

**路径参数：**

- `id`: 工单 ID（必填）

**请求体：**

```json
{
  "status": "IN_PROGRESS",
  "progress": 50,
  "remark": "已开始设备调整"
}
```

**成功响应：**

```json
{
  "code": 0,
  "data": {
    "id": "WO-2024-001",
    "status": "IN_PROGRESS",
    "updatedAt": "2024-01-15T14:00:00Z"
  },
  "message": "工单更新成功"
}
```

---

### 5.3 获取工单列表

**接口名称：** 获取工单列表（分页）

**请求方法：** `GET`

**请求路径：** `/qms/work-order`

**请求头：**

```
Authorization: Bearer <token>
```

**查询参数：** | 参数 | 类型 | 必填 | 说明 | |------|------|------|------| | `page` | Number | 否 | 页码，默认 1 | | `pageSize` | Number | 否 | 每页数量，默认 20 | | `status` | String | 否 | 状态筛选：OPEN, IN_PROGRESS, CLOSED | | `priority` | String | 否 | 优先级筛选：High, Medium, Low | | `assignedTo` | String | 否 | 委任人筛选 |

**成功响应：**

```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": "WO-2024-001",
        "woNumber": "WO-2024-001",
        "title": "质量改进",
        "priority": "High",
        "status": "IN_PROGRESS",
        "assignedTo": "张三",
        "targetDept": "生产部",
        "createdAt": "2024-01-15T09:00:00Z",
        "updatedAt": "2024-01-15T14:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "message": "查询成功"
}
```

---

## 6. 质量报表接口

### 6.1 获取周报数据

**接口名称：** 获取质量周报

**请求方法：** `GET`

**请求路径：** `/qms/reports/weekly`

**请求头：**

```
Authorization: Bearer <token>
```

**查询参数：** | 参数 | 类型 | 必填 | 说明 | |------|------|------|------| | `startDate` | String | 是 | 开始日期，格式 YYYY-MM-DD | | `endDate` | String | 是 | 结束日期，格式 YYYY-MM-DD |

**请求示例：**

```bash
GET /api/qms/reports/weekly?startDate=2024-01-08&endDate=2024-01-14
```

**成功响应：**

```json
{
  "code": 0,
  "data": {
    "title": "Weekly Quality Report",
    "period": "2024-01-08 ~ 2024-01-14",
    "author": {
      "name": "系统管理员",
      "dept": "质量部",
      "role": "经理",
      "leader": "刘盘"
    },
    "trackingIssues": [
      {
        "id": "1",
        "type": "质量问题",
        "description": "产品尺寸超差",
        "progress": "进行中",
        "completionTime": "2024-01-15",
        "respDept": "生产部",
        "remarks": ""
      }
    ],
    "internalIssues": [
      {
        "product": "项目A",
        "description": "加工工艺问题",
        "respDept": "生产部",
        "level": "严重",
        "cause": "设备精度不足",
        "measures": "调整设备参数"
      }
    ],
    "externalIssues": [
      {
        "product": "项目A",
        "description": "客户投诉尺寸超差",
        "respDept": "生产部",
        "level": "严重",
        "cause": "设备精度不足",
        "measures": "已更换设备"
      }
    ],
    "weeklyPlan": []
  },
  "message": "查询成功"
}
```

---

### 6.2 获取月度质量报告

**接口名称：** 获取质量月报

**请求方法：** `GET`

**请求路径：** `/qms/reports/monthly`

**请求头：**

```
Authorization: Bearer <token>
```

**查询参数：** | 参数 | 类型 | 必填 | 说明 | |------|------|------|------| | `year` | Number | 否 | 年份，默认当前年份 | | `month` | Number | 否 | 月份（1-12），默认当前月份 |

**请求示例：**

```bash
GET /api/qms/reports/monthly?year=2024&month=1
```

**成功响应：**

```json
{
  "code": 0,
  "data": {
    "title": "Monthly Quality Report",
    "period": "2024-01",
    "author": {
      "name": "系统管理员",
      "dept": "质量部",
      "role": "经理",
      "leader": "刘盘"
    },
    "metrics": [
      {
        "label": "总检验问题数",
        "value": 150,
        "unit": "个",
        "trend": -10,
        "history": [120, 130, 140, 150]
      },
      {
        "label": "已关闭问题数",
        "value": 120,
        "unit": "个",
        "trend": 5,
        "history": [110, 112, 115, 118, 120]
      }
    ],
    "defects": [
      {
        "name": "尺寸问题",
        "value": 45,
        "percentage": 30
      },
      {
        "name": "外观问题",
        "value": 30,
        "percentage": 20
      },
      {
        "name": "功能问题",
        "value": 20,
        "percentage": 13.3
      }
    ],
    "suppliers": {
      "best": [
        {
          "name": "供应商A",
          "issues": 2,
          "resolved": 2
        }
      ],
      "worst": [
        {
          "name": "供应商B",
          "issues": 5,
          "unresolved": 3
        }
      ]
    },
    "majorEvents": [
      {
        "id": "EVT-001",
        "title": "重大质量事故",
        "loss": 50000,
        "status": "CLOSED",
        "date": "2024-01-10",
        "desc": "设备故障导致批量报废"
      }
    ]
  },
  "message": "查询成功"
}
```

---

## 7. 错误码说明

### 7.1 HTTP 状态码

| 状态码 | 含义       | 说明                   |
| ------ | ---------- | ---------------------- |
| `200`  | 成功       | 请求成功处理           |
| `400`  | 请求错误   | 参数格式错误、参数缺失 |
| `401`  | 未授权     | Token 无效或已过期     |
| `403`  | 禁止访问   | 权限不足               |
| `404`  | 未找到     | 资源不存在             |
| `409`  | 资源冲突   | 唯一约束冲突/业务冲突  |
| `500`  | 服务器错误 | 服务器内部错误         |

---

### 7.2 业务错误码

| 字段      | 含义     | 说明                                      |
| --------- | -------- | ----------------------------------------- |
| `code=0`  | 业务成功 | 成功返回                                  |
| `code=-1` | 业务失败 | 失败返回，详细原因见 `message`            |
| `message` | 错误信息 | 面向前端/调用方提示                       |
| `error`   | 错误详情 | 默认可能为 `null`，按具体接口决定是否填充 |

---

## 8. 使用示例

### 8.1 Curl 示例

**登录：**

```bash
curl -X POST http://localhost:31115/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "123456"
  }'
```

**创建检验问题：**

```bash
curl -X POST http://localhost:31115/api/qms/inspection/issues \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "ncNumber": "NC-2024-003",
    "description": "产品划伤",
    "severity": "High",
    "responsibleDepartment": "生产部",
    "status": "OPEN"
  }'
```

**获取周报：**

```bash
curl -X GET "http://localhost:31115/api/qms/reports/weekly?startDate=2024-01-08&endDate=2024-01-14" \
  -H "Authorization: Bearer <token>"
```

---

## 9. 附录

### 9.1 数据字典

**检验问题状态：**

- `OPEN` - 未处理
- `IN_PROGRESS` - 进行中
- `CLOSED` - 已关闭

**缺陷严重等级：**

- `Low` - 一般
- `Medium` - 严重
- `High` - 高级

**工单优先级：**

- `Low` - 低
- `Medium` - 中
- `High` - 高

**部门代码：**

- `dept-001` - 生产部
- `dept-002` - 质量部
- `dept-003` - 技术部

---

## 文档总结

**包含接口总数：** 12 个主要接口

**功能模块：**

1. ✅ 认证系统（登录、刷新、获取用户信息）
2. ✅ 检验管理（列表、创建、更新、删除）
3. ✅ 工单管理（创建、更新、列表）
4. ✅ 质量报表（周报、月报）

**文档完整度：** 🟢 **完整**
