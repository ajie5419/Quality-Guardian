# 测试标准

## 测试框架

Vitest 3.2.4，配置在 `apps/backend/vitest.config.ts`

## 运行命令

```bash
pnpm --dir apps/backend exec vitest run                    # 全量
pnpm --dir apps/backend exec vitest run path/to/file.test.ts  # 单文件
pnpm --dir apps/backend exec vitest --watch                # 监听模式
```

## 文件位置

测试文件放在被测代码同目录，命名 `{name}.test.ts`：

```
modules/supplier/
├── supplier.service.ts
└── supplier.service.test.ts
```

## 什么需要测试

1. **Service 层的业务逻辑** — 尤其是条件分支、计算、状态流转
2. **纯函数工具** — 数据转换、格式化、校验函数
3. **复杂查询构建** — where 条件拼装逻辑

## 什么不需要测试

1. 简单的 CRUD 透传（Prisma 本身已测过）
2. API 路由文件（通过集成测试或手动验证）
3. 类型定义和常量

## 测试编写模式

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    tableName: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('ServiceName', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should do something specific', async () => {
    vi.mocked(prisma.tableName.findMany).mockResolvedValue([]);
    const result = await ServiceName.method();
    expect(result).toEqual(expected);
  });
});
```

## 硬规则

1. mock 数据库，不连真实 DB
2. 每个 test case 只验证一个行为
3. 测试描述用英文，写清楚 input → output
4. 新增业务逻辑必须附带测试，纯重构不要求
