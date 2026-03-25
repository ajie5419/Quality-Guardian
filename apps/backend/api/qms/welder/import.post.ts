import type { Prisma } from '@prisma/client';

import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/utils/import-report';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { parseNonEmptyArray } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { buildWelderCreateData, hasWelderCodeField } from '~/utils/welder';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const items = parseNonEmptyArray<Record<string, unknown>>(body.items);
    if (!items) {
      return badRequestResponse(event, '未发现可导入的数据');
    }

    let successCount = 0;
    const rowErrors = [];
    const supportsWelderCode = hasWelderCodeField();

    for (const [index, item] of items.entries()) {
      try {
        const createData = buildWelderCreateData(item);
        if (!createData) {
          rowErrors.push(
            buildImportRowError({
              field: 'name',
              item,
              keyField: 'name',
              reason: '缺少必填字段: name/team',
              row: index + 1,
            }),
          );
          continue;
        }

        const rowData = createData as Prisma.weldersCreateInput;
        const welderCode = String(rowData.welderCode || '').trim();

        if (supportsWelderCode && welderCode) {
          const {
            createdAt: _createdAt,
            id: _id,
            ...baseUpdateData
          } = rowData as Prisma.weldersCreateInput & {
            createdAt?: Date;
          };
          const updateData: Prisma.weldersUpdateInput = {
            ...baseUpdateData,
            isDeleted: false,
            updatedAt: new Date(),
          };

          await prisma.welders.upsert({
            where: { welderCode },
            update: updateData,
            create: rowData,
          });
        } else {
          await prisma.welders.create({
            data: rowData,
          });
        }
        successCount++;
      } catch (error: unknown) {
        logApiError('welder-import-item', error);
        const reason = toImportErrorMessage(error);
        rowErrors.push(
          buildImportRowError({
            field: inferImportErrorField(reason),
            item,
            keyField: 'name',
            reason,
            row: index + 1,
          }),
        );
      }
    }

    return useResponseSuccess(
      buildImportSummary({
        rowErrors,
        successCount,
        totalCount: items.length,
      }),
    );
  } catch (error: unknown) {
    logApiError('welder-import', error);
    return internalServerErrorResponse(event, '焊工导入失败');
  }
});
