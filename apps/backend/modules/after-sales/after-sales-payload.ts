import type { Prisma } from '@prisma/client';
import type { QualityClassificationSelection } from '@qgs/shared';
import type { GovernedCanonicalWriteMode } from '~/utils/governed-write';

import * as qgsDomain from '@qgs/shared';
import { QUALITY_CLASSIFICATION_SCOPE } from '@qgs/shared';
import { QualityClassificationService } from '~/modules/quality-classification';
import { BusinessError } from '~/utils/business-error';
import {
  parseResponsibleDepartments,
  serializeResponsibleDepartments,
} from '~/utils/department-multi';
import { buildGovernedCanonicalWritePairForTable } from '~/utils/governed-write';

const { buildAfterSalesCreateData, buildAfterSalesUpdateData } = qgsDomain;
export { buildAfterSalesCreateData, buildAfterSalesUpdateData };

type ClassificationInputMode = 'import' | 'online';

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

function normalizeResponsibleDepartments(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return parseResponsibleDepartments(value)
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  return [];
}

function requiredText(
  body: Record<string, unknown>,
  field: string,
): null | string {
  const value = String(body[field] ?? '').trim();
  return value || null;
}

function classificationRequired(): never {
  throw new BusinessError(
    'AFTER_SALES_CLASSIFICATION_REQUIRED',
    'Product and defect category/subcategory IDs are required',
    400,
  );
}

async function resolveSelection(
  body: Record<string, unknown>,
  input: {
    categoryIdField: string;
    categoryNameField: string;
    mode: ClassificationInputMode;
    scope:
      | typeof QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT
      | typeof QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT;
    subcategoryIdField: string;
    subcategoryNameField: string;
  },
) {
  const categoryId = requiredText(body, input.categoryIdField);
  const subcategoryId = requiredText(body, input.subcategoryIdField);
  if (categoryId && subcategoryId) {
    return QualityClassificationService.assertSelection(
      input.scope,
      categoryId,
      subcategoryId,
    );
  }
  if (input.mode === 'online' || categoryId || subcategoryId) {
    classificationRequired();
  }

  const categoryName = requiredText(body, input.categoryNameField);
  const subcategoryName = requiredText(body, input.subcategoryNameField);
  if (!categoryName || !subcategoryName) {
    classificationRequired();
  }
  return QualityClassificationService.resolveActiveSelectionByNames(
    input.scope,
    categoryName,
    subcategoryName,
  );
}

async function resolveAfterSalesClassifications(
  body: Record<string, unknown>,
  mode: ClassificationInputMode,
) {
  const [product, defect] = await Promise.all([
    resolveSelection(body, {
      categoryIdField: 'productCategoryId',
      categoryNameField: 'productType',
      mode,
      scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT,
      subcategoryIdField: 'productSubcategoryId',
      subcategoryNameField: 'productSubtype',
    }),
    resolveSelection(body, {
      categoryIdField: 'defectCategoryId',
      categoryNameField: 'defectType',
      mode,
      scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
      subcategoryIdField: 'defectSubcategoryId',
      subcategoryNameField: 'defectSubtype',
    }),
  ]);
  return { defect, product };
}

function buildClassificationData(input: {
  defect: QualityClassificationSelection;
  product: QualityClassificationSelection;
}) {
  return {
    defectCategoryId: input.defect.category.id,
    defectSubcategoryId: input.defect.subcategory.id,
    defectSubtype: input.defect.subcategory.name,
    defectType: input.defect.category.name,
    productCategoryId: input.product.category.id,
    productSubcategoryId: input.product.subcategory.id,
    productSubtype: input.product.subcategory.name,
    productType: input.product.category.name,
  };
}

function withoutLegacyClassificationNames<T extends Record<string, unknown>>(
  data: T,
) {
  const result: Record<string, unknown> = { ...data };
  delete result.defectSubtype;
  delete result.defectType;
  delete result.productSubtype;
  delete result.productType;
  return result;
}

function attachResponsibleDepartmentsToAfterSalesData<
  T extends {
    feedbackDept?: unknown;
    respDept?: unknown;
    responsibleDepartments?: unknown;
  },
>(body: Record<string, unknown>, data: T): T {
  const departments = normalizeResponsibleDepartments(
    body.responsibleDepartments,
  );
  if (departments.length === 0) {
    return data;
  }
  return {
    ...data,
    feedbackDept: departments[0],
    respDept: departments[0],
    responsibleDepartments: serializeResponsibleDepartments(departments),
  };
}

export async function buildGovernedAfterSalesCreateData(
  body: Record<string, unknown>,
  options: {
    classificationMode?: ClassificationInputMode;
    createdBy?: string;
    defaultWorkOrderNumber: string;
    id: string;
    identityMode?: GovernedCanonicalWriteMode;
    serialNumber: number;
  },
): Promise<Prisma.after_salesUncheckedCreateInput> {
  assertAfterSalesPayloadBuilders();
  const classifications = await resolveAfterSalesClassifications(
    body,
    options.classificationMode ?? 'online',
  );
  const createData = buildAfterSalesCreateData(
    body,
    options,
  ) as unknown as Prisma.after_salesUncheckedCreateInput;
  const data = attachResponsibleDepartmentsToAfterSalesData(body, createData);
  const canonicalFields = options.identityMode
    ? await buildGovernedCanonicalWritePairForTable(
        'after_sales',
        withoutLegacyClassificationNames(data),
        {
          mode: options.identityMode,
        },
      )
    : await buildGovernedCanonicalWritePairForTable(
        'after_sales',
        withoutLegacyClassificationNames(data),
      );
  return {
    ...data,
    ...canonicalFields,
    ...buildClassificationData(classifications),
  };
}

export async function buildGovernedAfterSalesUpdateData(
  body: Record<string, unknown>,
): Promise<{
  costsChanged: boolean;
  data: Prisma.after_salesUncheckedUpdateInput;
}> {
  assertAfterSalesPayloadBuilders();
  const classifications = await resolveAfterSalesClassifications(
    body,
    'online',
  );
  const result = buildAfterSalesUpdateData(body) as unknown as {
    costsChanged: boolean;
    data: Prisma.after_salesUncheckedUpdateInput;
  };
  const data = attachResponsibleDepartmentsToAfterSalesData(body, result.data);
  const canonicalFields = await buildGovernedCanonicalWritePairForTable(
    'after_sales',
    withoutLegacyClassificationNames(data),
  );
  if (Object.hasOwn(data, 'supplierBrand') && !data.supplierBrand) {
    canonicalFields.supplierBrandId = null;
  }
  return {
    ...result,
    data: {
      ...data,
      ...canonicalFields,
      ...buildClassificationData(classifications),
    },
  };
}
