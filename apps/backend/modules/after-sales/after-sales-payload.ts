import type { Prisma } from '@prisma/client';

import * as qgsDomain from '@qgs/shared';

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
  return buildAfterSalesCreateData(
    body,
    options,
  ) as unknown as Prisma.after_salesUncheckedCreateInput;
}

export async function buildGovernedAfterSalesUpdateData(
  body: Record<string, unknown>,
): Promise<{
  costsChanged: boolean;
  data: Prisma.after_salesUncheckedUpdateInput;
}> {
  assertAfterSalesPayloadBuilders();
  return buildAfterSalesUpdateData(body) as unknown as {
    costsChanged: boolean;
    data: Prisma.after_salesUncheckedUpdateInput;
  };
}
