export const QUALITY_CLASSIFICATION_SCOPE = {
  AFTER_SALES_DEFECT: 'AFTER_SALES_DEFECT',
  AFTER_SALES_PRODUCT: 'AFTER_SALES_PRODUCT',
  INSPECTION_ISSUE_DEFECT: 'INSPECTION_ISSUE_DEFECT',
} as const;

export const QUALITY_CLASSIFICATION_SCOPES = [
  QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
  QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT,
  QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
] as const;

export type QualityClassificationScope =
  (typeof QUALITY_CLASSIFICATION_SCOPES)[number];

export interface QualityClassificationSubcategory {
  code: string;
  id: string;
  name: string;
  sort: number;
  status: 0 | 1;
}

export interface QualityClassificationCategory {
  code: string;
  id: string;
  name: string;
  scope: QualityClassificationScope;
  sort: number;
  status: 0 | 1;
  subcategories: QualityClassificationSubcategory[];
}

export interface QualityClassificationSelection {
  category: {
    code: string;
    id: string;
    name: string;
  };
  subcategory: {
    code: string;
    id: string;
    name: string;
  };
}
