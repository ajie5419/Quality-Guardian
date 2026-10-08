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
import { defineEventHandler, getQuery } from 'h3';
import {
  inspectionRequestResponsibilityOptionsQuerySchema,
  InspectionRequestResponsibilityOptionsService,
} from '~/modules/inspection';
import { logApiError } from '~/utils/api-logger';
import { BusinessError, businessErrorResponse } from '~/utils/business-error';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);
  try {
    const parsed = inspectionRequestResponsibilityOptionsQuerySchema.safeParse(
      getQuery(event),
    );
    if (!parsed.success || !parsed.data.responsibilityType)
      return badRequestResponse(event, '责任类型不能为空或参数无效');
    return useResponseSuccess(
      await InspectionRequestResponsibilityOptionsService.list({
        ...parsed.data,
        responsibilityType: parsed.data.responsibilityType,
      }),
    );
  } catch (error) {
    logApiError(
      'inspection-request-responsibility-options',
      error,
      undefined,
      event,
    );
    if (error instanceof BusinessError)
      return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '获取责任归属选项失败');
  }
});
```

这是使用现有 schema 和模块公开入口的 GET 最小样板（50 行以内），不在路由访问 Prisma。写入口还必须声明权限，创建入口按所属业务接入幂等；完整报检创建、关闭、关联不合格项样板与定位见 [日常开发指引](development-workflow.md)。

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
