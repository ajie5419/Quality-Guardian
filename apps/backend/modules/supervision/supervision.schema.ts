import { z } from 'zod';

export const createPlanTaskSchema = z.object({
  durationDays: z.number().int().min(0).optional(),
  parentId: z.string().optional(),
  plannedEndAt: z.string().optional(),
  plannedQuantity: z.number().positive().default(1),
  plannedStartAt: z.string().optional(),
  predecessorText: z.string().optional(),
  quantityUnit: z.string().default('项'),
  resourceName: z.string().optional(),
  taskName: z.string().min(1, '任务名称不能为空'),
  taskNo: z.string().min(1, '标识号不能为空'),
  weight: z.number().positive().default(1),
});

export const updatePlanTaskSchema = z.object({
  actualEndAt: z.string().nullable().optional(),
  actualStartAt: z.string().nullable().optional(),
  durationDays: z.number().int().min(0).nullable().optional(),
  parentId: z.string().nullable().optional(),
  plannedEndAt: z.string().nullable().optional(),
  plannedQuantity: z.number().positive().optional(),
  plannedStartAt: z.string().nullable().optional(),
  predecessorText: z.string().nullable().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  quantityUnit: z.string().optional(),
  resourceName: z.string().nullable().optional(),
  riskLevel: z.enum(['NORMAL', 'RISK']).optional(),
  riskReason: z.string().nullable().optional(),
  taskName: z.string().min(1).optional(),
  taskNo: z.string().min(1).optional(),
  weight: z.number().positive().optional(),
});

export const reorderPlanTasksSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        outlineLevel: z.number().int().min(1).optional(),
        parentId: z.string().nullable().optional(),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1, '至少需要一个任务'),
});

export const importPlanTasksSchema = z.object({
  fileName: z.string().optional(),
  fileUrl: z.string().min(1, '计划文件不能为空'),
  mode: z.enum(['merge', 'replace']).default('replace'),
  storedName: z.string().optional(),
});
