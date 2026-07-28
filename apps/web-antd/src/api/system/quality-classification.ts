import { requestClient } from '#/api/request';

export namespace QualityClassificationApi {
  export type Scope =
    | 'AFTER_SALES_DEFECT'
    | 'AFTER_SALES_PRODUCT'
    | 'INSPECTION_ISSUE_DEFECT';

  export interface Subcategory {
    code: string;
    id: string;
    name: string;
    sort: number;
    status: 0 | 1;
  }

  export interface Category {
    code: string;
    id: string;
    name: string;
    scope: Scope;
    sort: number;
    status: 0 | 1;
    subcategories: Subcategory[];
  }

  export type CategoryMutationResult = Omit<Category, 'subcategories'>;

  export interface CreatePayload {
    code?: null | string;
    name: string;
    sort?: number;
    status?: 0 | 1;
  }

  export interface UpdatePayload {
    name?: string;
    sort?: number;
    status?: 0 | 1;
  }
}

const BASE_URL = '/system/quality-classifications';

export function getQualityClassificationsApi(
  scope: QualityClassificationApi.Scope,
) {
  return requestClient.get<QualityClassificationApi.Category[]>(BASE_URL, {
    params: { scope },
  });
}

export function createQualityCategoryApi(
  data: QualityClassificationApi.CreatePayload & {
    scope: QualityClassificationApi.Scope;
  },
) {
  return requestClient.post<QualityClassificationApi.CategoryMutationResult>(
    `${BASE_URL}/categories`,
    data,
  );
}

export function updateQualityCategoryApi(
  id: string,
  data: QualityClassificationApi.UpdatePayload,
) {
  return requestClient.put<QualityClassificationApi.CategoryMutationResult>(
    `${BASE_URL}/categories/${id}`,
    data,
  );
}

export function deleteQualityCategoryApi(id: string) {
  return requestClient.delete(`${BASE_URL}/categories/${id}`);
}

export function createQualitySubcategoryApi(
  data: QualityClassificationApi.CreatePayload & {
    categoryId: string;
  },
) {
  return requestClient.post<QualityClassificationApi.Subcategory>(
    `${BASE_URL}/subcategories`,
    data,
  );
}

export function updateQualitySubcategoryApi(
  id: string,
  data: QualityClassificationApi.UpdatePayload,
) {
  return requestClient.put<QualityClassificationApi.Subcategory>(
    `${BASE_URL}/subcategories/${id}`,
    data,
  );
}

export function deleteQualitySubcategoryApi(id: string) {
  return requestClient.delete(`${BASE_URL}/subcategories/${id}`);
}
