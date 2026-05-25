# API 设计规范

## 路由文件命名（Nitro 文件路由）

```
api/qms/{domain}/{resource}/
├── index.get.ts          # 列表查询
├── index.post.ts         # 创建
├── [id].get.ts           # 详情
├── [id].put.ts           # 更新
├── [id].delete.ts        # 删除
└── {action}.post.ts      # 特殊操作（如 submit.post.ts）
```

## 端点结构模板

```typescript
import { defineEventHandler, getQuery, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';
import { logApiError } from '~/utils/api-logger';

export default defineEventHandler(async (event) => {
  // 1. 认证
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  // 2. 参数解析与校验
  const query = getQuery(event);

  try {
    // 3. 业务逻辑（调用 modules/ 下的 service）
    // 4. 返回统一格式
    return useResponseSuccess(result);
  } catch (error) {
    logApiError(event, error, 'endpoint-name');
    return internalServerErrorResponse(event);
  }
});
```

## 响应格式

```typescript
// 成功
{ code: 0, data: T, error: null, message: 'ok' }

// 分页
{ code: 0, data: { items: T[], total: number }, error: null, message: 'ok' }

// 失败
{ code: -1, data: null, error: string, message: string }
```

## 硬规则

1. 每个端点必须先调用 `verifyAccessToken` 做认证
2. 错误处理用 try/catch 包裹，调用 `logApiError` 记录
3. 响应必须用 `useResponseSuccess` / `badRequestResponse` / `internalServerErrorResponse`
4. 参数校验用 `getMissingRequiredFields` 或 zod schema
5. 业务逻辑不写在路由文件里，调用 `modules/` 下的 service
