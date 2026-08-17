import type { Prisma } from '@prisma/client';

import type {
  InspectionRequestProcessCategory,
  InspectionRequestProcessSelectionInput,
  ProcessMasterCreateInput,
  ProcessMasterUpdateInput,
} from './process-master.schema';

import { createId } from '@paralleldrive/cuid2';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

const INSPECTION_REQUEST_CATEGORIES = ['INCOMING', 'PROCESS'] as const;
const INCOMING_TYPE_DICT_TYPE = 'incoming_type';

type ProcessReadClient = Pick<Prisma.TransactionClient, 'processes'>;

function normalizeOptionalText(value: null | string | undefined) {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

async function assertNameAvailable(name: string, excludedId?: string) {
  const existing = await prisma.processes.findFirst({
    where: {
      ...(excludedId ? { id: { not: excludedId } } : {}),
      name: name.trim(),
    },
    select: { id: true },
  });
  if (existing) {
    throw new BusinessError(
      'PROCESS_NAME_CONFLICT',
      'A process with this name already exists',
      409,
    );
  }
}

/**
 * Keep the incoming-type dictionary in sync when a process is renamed.
 * Incoming inspection records resolve their display name through the
 * dictionaries(incoming_type) entry id, so a dictionary entry whose value
 * matches the previous process name must follow the rename; otherwise legacy
 * records keep showing the old name while new records write the new one.
 * Both dictKey and dictValue follow the rename because the governance layer
 * resolves the canonical name from dictKey (master-data-fields.ts), and the
 * rename is skipped when the target name is already taken by another active
 * dictionary entry so the update never creates duplicate names.
 */
async function syncIncomingTypeDictionaryName(
  tx: Prisma.TransactionClient,
  previousName: string,
  nextName: string,
) {
  const normalizedPrevious = previousName.trim();
  const normalizedNext = nextName.trim();
  if (
    !normalizedPrevious ||
    !normalizedNext ||
    normalizedPrevious === normalizedNext
  ) {
    return;
  }
  const matched = await tx.dictionaries.findMany({
    where: {
      dictType: INCOMING_TYPE_DICT_TYPE,
      isDeleted: false,
      OR: [{ dictKey: normalizedPrevious }, { dictValue: normalizedPrevious }],
    },
    select: { id: true },
  });
  if (matched.length === 0) {
    return;
  }
  const matchedIds = matched.map((item) => item.id);
  const conflicting = await tx.dictionaries.findFirst({
    where: {
      dictType: INCOMING_TYPE_DICT_TYPE,
      isDeleted: false,
      NOT: { id: { in: matchedIds } },
      OR: [{ dictKey: normalizedNext }, { dictValue: normalizedNext }],
    },
    select: { id: true },
  });
  if (conflicting) {
    return;
  }
  await tx.dictionaries.updateMany({
    where: { id: { in: matchedIds } },
    data: { dictKey: normalizedNext, dictValue: normalizedNext },
  });
}

async function configureProcessOptions(
  tx: Prisma.TransactionClient,
  processId: string,
  categories: InspectionRequestProcessCategory[],
  sort: number,
) {
  const selectedCategories = new Set(categories);
  for (const category of INSPECTION_REQUEST_CATEGORIES) {
    await tx.inspection_request_process_options.upsert({
      where: { category_processId: { category, processId } },
      update: { isEnabled: selectedCategories.has(category), sort },
      create: {
        id: createId(),
        category,
        isEnabled: selectedCategories.has(category),
        processId,
        sort,
      },
    });
  }
}

async function replaceCategorySelection(
  tx: Prisma.TransactionClient,
  category: InspectionRequestProcessCategory,
  processIds: string[],
) {
  await tx.inspection_request_process_options.updateMany({
    where: { category },
    data: { isEnabled: false },
  });

  for (const [sort, processId] of [...new Set(processIds)].entries()) {
    await tx.inspection_request_process_options.upsert({
      where: { category_processId: { category, processId } },
      update: { isEnabled: true, sort },
      create: {
        id: createId(),
        category,
        isEnabled: true,
        processId,
        sort,
      },
    });
  }
}

export const ProcessMasterService = {
  async findActiveById(id: string, client: ProcessReadClient = prisma) {
    return client.processes.findFirst({
      where: { id: id.trim(), isDeleted: false, status: 1 },
      select: { id: true, name: true },
    });
  },

  async listActiveOptions() {
    return prisma.processes.findMany({
      where: { isDeleted: false, status: 1 },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        inspectionRequestCategory: true,
        name: true,
        sort: true,
        supplierSource: true,
      },
    });
  },

  async listForManagement() {
    const rows = await prisma.processes.findMany({
      where: { isDeleted: false },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      select: {
        code: true,
        id: true,
        inspectionRequestOptions: {
          where: {
            category: { in: [...INSPECTION_REQUEST_CATEGORIES] },
            isEnabled: true,
          },
          select: { category: true },
        },
        name: true,
        sort: true,
        status: true,
        supplierSource: true,
      },
    });

    return rows.map(({ inspectionRequestOptions, ...process }) => ({
      ...process,
      categories: inspectionRequestOptions.map((item) => item.category),
    }));
  },

  async listInspectionRequestOptions(
    category?: InspectionRequestProcessCategory,
  ) {
    const rows = await prisma.inspection_request_process_options.findMany({
      where: {
        category: category ?? { in: [...INSPECTION_REQUEST_CATEGORIES] },
        isEnabled: true,
        process: { is: { isDeleted: false, status: 1 } },
      },
      orderBy: [{ sort: 'asc' }, { process: { name: 'asc' } }],
      select: {
        category: true,
        process: { select: { id: true, name: true, supplierSource: true } },
      },
    });

    return rows.map((item) => ({
      category: item.category as InspectionRequestProcessCategory,
      processId: item.process.id,
      processName: item.process.name,
      supplierSource: item.process.supplierSource,
    }));
  },

  async assertInspectionRequestOption(
    processId: string,
    category: InspectionRequestProcessCategory,
  ) {
    const option = await prisma.inspection_request_process_options.findFirst({
      where: {
        category,
        isEnabled: true,
        processId,
        process: { is: { isDeleted: false, status: 1 } },
      },
      select: { process: { select: { id: true, name: true } } },
    });
    if (!option) {
      throw new BusinessError(
        'INSPECTION_PROCESS_NOT_AVAILABLE',
        'The selected process is not enabled for this inspection category',
        400,
      );
    }
    return option.process;
  },

  async create(input: ProcessMasterCreateInput) {
    const name = input.name.trim();
    const existing = await prisma.processes.findUnique({
      where: { name },
      select: { id: true, isDeleted: true },
    });
    if (existing && !existing.isDeleted) {
      throw new BusinessError(
        'PROCESS_NAME_CONFLICT',
        'A process with this name already exists',
        409,
      );
    }
    return prisma.$transaction(async (tx) => {
      const data = {
        code: normalizeOptionalText(input.code),
        isDeleted: false,
        name,
        sort: input.sort ?? 0,
        status: 1,
        supplierSource: input.supplierSource,
      };
      const process = existing
        ? await tx.processes.update({
            where: { id: existing.id },
            data,
            select: {
              code: true,
              id: true,
              name: true,
              sort: true,
              status: true,
              supplierSource: true,
            },
          })
        : await tx.processes.create({
            data,
            select: {
              code: true,
              id: true,
              name: true,
              sort: true,
              status: true,
              supplierSource: true,
            },
          });
      await configureProcessOptions(
        tx,
        process.id,
        input.categories,
        process.sort,
      );
      return { ...process, categories: [...new Set(input.categories)] };
    });
  },

  async update(id: string, input: ProcessMasterUpdateInput) {
    const existing = await prisma.processes.findFirst({
      where: { id, isDeleted: false },
      select: { id: true, name: true },
    });
    if (!existing) {
      throw new BusinessError('PROCESS_NOT_FOUND', 'Process not found', 404);
    }
    const name = input.name?.trim();
    if (name) await assertNameAvailable(name, id);
    return prisma.$transaction(async (tx) => {
      const process = await tx.processes.update({
        where: { id },
        data: {
          ...(input.code === undefined
            ? {}
            : { code: normalizeOptionalText(input.code) }),
          ...(name ? { name } : {}),
          ...(input.sort === undefined ? {} : { sort: input.sort }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.supplierSource === undefined
            ? {}
            : { supplierSource: input.supplierSource }),
        },
        select: {
          code: true,
          id: true,
          name: true,
          sort: true,
          status: true,
          supplierSource: true,
        },
      });
      if (name && existing.name && name !== existing.name) {
        await syncIncomingTypeDictionaryName(tx, existing.name, name);
      }
      if (input.sort !== undefined) {
        await tx.inspection_request_process_options.updateMany({
          where: { processId: id },
          data: { sort: input.sort },
        });
      }
      return process;
    });
  },

  async replaceInspectionRequestSelections(
    input: InspectionRequestProcessSelectionInput,
  ) {
    const processProcessIds = [...new Set(input.processProcessIds)];
    const incomingProcessIds = [...new Set(input.incomingProcessIds)];
    const selectedIds = [
      ...new Set([...incomingProcessIds, ...processProcessIds]),
    ];
    const validCount = await prisma.processes.count({
      where: { id: { in: selectedIds }, isDeleted: false },
    });
    if (validCount !== selectedIds.length) {
      throw new BusinessError(
        'INVALID_PROCESS_SELECTION',
        'Every selected process must exist',
        400,
      );
    }

    await prisma.$transaction(async (tx) => {
      await replaceCategorySelection(tx, 'PROCESS', processProcessIds);
      await replaceCategorySelection(tx, 'INCOMING', incomingProcessIds);
    });
  },

  async remove(id: string) {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.processes.updateMany({
        where: { id, isDeleted: false },
        data: { isDeleted: true, status: 0 },
      });
      if (updated.count === 0) return false;
      await tx.inspection_request_process_options.updateMany({
        where: { processId: id },
        data: { isEnabled: false },
      });
      return true;
    });
    if (!result) {
      throw new BusinessError('PROCESS_NOT_FOUND', 'Process not found', 404);
    }
  },
};
