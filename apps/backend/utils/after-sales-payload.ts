import type { Prisma } from '@prisma/client';

import * as qgsDomain from '@qgs/shared';

import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from './master-data-governance-write';

const { buildAfterSalesCreateData, buildAfterSalesUpdateData } = qgsDomain;
export { buildAfterSalesCreateData, buildAfterSalesUpdateData };

function assertAfterSalesPayloadBuilders(): void {
  if (
    typeof buildAfterSalesCreateData !== 'function' ||
    typeof buildAfterSalesUpdateData !== 'function'
  ) {
    throw new TypeError(
      'After-sales payload builders are not available from @qgs/shared runtime exports.',
    );
  }
}

export async function buildGovernedAfterSalesCreateData(
  body: Record<string, unknown>,
  options: {
    defaultWorkOrderNumber: string;
    id: string;
    serialNumber: number;
  },
): Promise<Prisma.after_salesUncheckedCreateInput> {
  assertAfterSalesPayloadBuilders();
  const data = buildAfterSalesCreateData(
    body,
    options,
  ) as unknown as Prisma.after_salesUncheckedCreateInput;
  const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
    'after_sales',
    data as Record<string, unknown>,
  );
  return {
    ...data,
    ...buildGovernedWriteFieldsForTable(
      'after_sales',
      data as Record<string, unknown>,
    ),
    ...governedCanonicalIds,
  } as Prisma.after_salesUncheckedCreateInput;
}

export async function buildGovernedAfterSalesUpdateData(
  body: Record<string, unknown>,
): Promise<{
  costsChanged: boolean;
  data: Prisma.after_salesUncheckedUpdateInput;
}> {
  assertAfterSalesPayloadBuilders();
  const payload = buildAfterSalesUpdateData(body) as unknown as {
    costsChanged: boolean;
    data: Prisma.after_salesUncheckedUpdateInput;
  };
  const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
    'after_sales',
    payload.data as Record<string, unknown>,
  );
  return {
    ...payload,
    data: {
      ...payload.data,
      ...buildGovernedWriteFieldsForTable(
        'after_sales',
        payload.data as Record<string, unknown>,
      ),
      ...governedCanonicalIds,
    } as Prisma.after_salesUncheckedUpdateInput,
  };
}
