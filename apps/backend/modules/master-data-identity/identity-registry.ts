import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

type CanonicalKind =
  | 'department'
  | 'dictionary'
  | 'part'
  | 'process'
  | 'project'
  | 'quality-category'
  | 'quality-subcategory'
  | 'supplier';

type ClassificationScope =
  | 'AFTER_SALES_DEFECT'
  | 'AFTER_SALES_PRODUCT'
  | 'INSPECTION_ISSUE_DEFECT';

export type OnlineResolutionDescriptor =
  | {
      configKey: string;
      kind: 'IDENTITY';
      multiple: boolean;
    }
  | {
      kind: 'CLASSIFICATION';
      scope: ClassificationScope;
    };

type RegistryEntry = {
  classificationScope?: ClassificationScope;
  dictionaryType?: string;
  kind: CanonicalKind;
  onlineConfigKey?: string;
  onlineMultiple?: boolean;
};

const INSPECTION_FIELDS: Record<string, RegistryEntry> = {
  incomingTypeId: {
    dictionaryType: 'incoming_type',
    kind: 'dictionary',
    onlineConfigKey: 'incomingType',
  },
  materialNameId: {
    dictionaryType: 'material_name',
    kind: 'dictionary',
    onlineConfigKey: 'materialName',
  },
  partId: { kind: 'part', onlineConfigKey: 'partName' },
  processId: { kind: 'process', onlineConfigKey: 'processName' },
  projectId: { kind: 'project', onlineConfigKey: 'projectName' },
  supplierId: { kind: 'supplier', onlineConfigKey: 'supplierName' },
  teamId: {
    dictionaryType: 'team',
    kind: 'dictionary',
    onlineConfigKey: 'team',
  },
};

const IDENTITY_REGISTRY: Record<string, Record<string, RegistryEntry>> = {
  after_sales: {
    defectCategoryId: { kind: 'quality-category' },
    defectClassification: {
      classificationScope: 'AFTER_SALES_DEFECT',
      kind: 'quality-subcategory',
    },
    defectSubcategoryId: { kind: 'quality-subcategory' },
    divisionId: { kind: 'department', onlineConfigKey: 'division' },
    feedbackDeptId: {
      kind: 'department',
      onlineConfigKey: 'responsibleDepartment',
    },
    partId: { kind: 'part', onlineConfigKey: 'partName' },
    productCategoryId: { kind: 'quality-category' },
    productClassification: {
      classificationScope: 'AFTER_SALES_PRODUCT',
      kind: 'quality-subcategory',
    },
    productSubcategoryId: { kind: 'quality-subcategory' },
    projectId: { kind: 'project', onlineConfigKey: 'projectName' },
    respDeptId: {
      kind: 'department',
      onlineConfigKey: 'responsibleDepartment',
    },
    supplierBrandId: { kind: 'supplier', onlineConfigKey: 'supplierBrand' },
  },
  inspections: INSPECTION_FIELDS,
  project_boms: {
    partId: { kind: 'part', onlineConfigKey: 'partName' },
    // The source stores a collection rather than one canonical reference.
    // It remains observable, but needs a dedicated collection decision workflow.
    requiredProcessIds: { kind: 'process' },
  },
  qms_inspection_requests: {
    partId: { kind: 'part', onlineConfigKey: 'partName' },
    processId: { kind: 'process', onlineConfigKey: 'processName' },
    supplierId: { kind: 'supplier', onlineConfigKey: 'supplierName' },
    teamId: {
      dictionaryType: 'team',
      kind: 'dictionary',
      onlineConfigKey: 'team',
    },
  },
  quality_records: {
    defectCategoryId: { kind: 'quality-category' },
    // This is a legacy name mapping. It is resolvable, but never a raw ID scan column.
    defectClassification: {
      classificationScope: 'INSPECTION_ISSUE_DEFECT',
      kind: 'quality-subcategory',
    },
    defectSubcategoryId: { kind: 'quality-subcategory' },
    divisionId: { kind: 'department', onlineConfigKey: 'division' },
    partId: { kind: 'part', onlineConfigKey: 'partName' },
    processId: { kind: 'process', onlineConfigKey: 'processName' },
    projectId: { kind: 'project', onlineConfigKey: 'projectName' },
    responsibleDepartmentId: {
      kind: 'department',
      onlineConfigKey: 'responsibleDepartment',
    },
    supplierId: { kind: 'supplier', onlineConfigKey: 'supplierName' },
  },
  supplier_identity_links: {
    supplierId: { kind: 'supplier', onlineConfigKey: 'supplierName' },
  },
  work_order_requirements: {
    partId: { kind: 'part', onlineConfigKey: 'partName' },
    processId: { kind: 'process', onlineConfigKey: 'processName' },
    requirementId: {
      dictionaryType: 'requirement_name',
      kind: 'dictionary',
      onlineConfigKey: 'requirementName',
    },
    responsibleTeamId: {
      dictionaryType: 'team',
      kind: 'dictionary',
      onlineConfigKey: 'team',
    },
  },
  work_orders: {
    customerNameId: {
      dictionaryType: 'customer_name',
      kind: 'dictionary',
      onlineConfigKey: 'customerName',
    },
    divisionId: { kind: 'department', onlineConfigKey: 'division' },
    projectId: { kind: 'project', onlineConfigKey: 'projectName' },
  },
};

export function getIdentityRegistryEntry(
  entityType: string,
  fieldName: string,
) {
  return IDENTITY_REGISTRY[entityType]?.[fieldName] || null;
}

export function getOnlineResolutionDescriptor(
  entityType: string,
  fieldName: string,
): null | OnlineResolutionDescriptor {
  const entry = getIdentityRegistryEntry(entityType, fieldName);
  if (!entry) return null;
  if (entry.classificationScope) {
    return { kind: 'CLASSIFICATION', scope: entry.classificationScope };
  }
  if (!entry.onlineConfigKey) return null;
  return {
    configKey: entry.onlineConfigKey,
    kind: 'IDENTITY',
    multiple: entry.onlineMultiple === true,
  };
}

export async function getCanonicalIdentityState(
  entityType: string,
  fieldName: string,
  canonicalId: string,
) {
  const entry = getIdentityRegistryEntry(entityType, fieldName);
  if (!entry) {
    throw new BusinessError(
      'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
      'This reference is not registered for identity resolution',
      400,
    );
  }
  const id = canonicalId.trim();
  if (!id) {
    throw new BusinessError(
      'INVALID_CANONICAL_ID',
      'Canonical ID is required',
      400,
    );
  }
  const record = await (async () => {
    switch (entry.kind) {
      case 'department': {
        return prisma.departments.findFirst({
          where: { id },
          select: { isDeleted: true, status: true },
        });
      }
      case 'dictionary': {
        return prisma.dictionaries.findFirst({
          where: { id, dictType: entry.dictionaryType },
          select: { isDeleted: true, status: true },
        });
      }
      case 'part': {
        return prisma.master_parts.findFirst({
          where: { id },
          select: { isDeleted: true, status: true },
        });
      }
      case 'process': {
        return prisma.processes.findFirst({
          where: { id },
          select: { isDeleted: true, status: true },
        });
      }
      case 'project': {
        return prisma.master_projects.findFirst({
          where: { id },
          select: { isDeleted: true, status: true },
        });
      }
      case 'quality-category': {
        return prisma.quality_classification_categories.findFirst({
          where: { id },
          select: { isDeleted: true, status: true },
        });
      }
      case 'quality-subcategory': {
        return prisma.quality_classification_subcategories.findFirst({
          where: { id },
          select: { isDeleted: true, status: true },
        });
      }
      case 'supplier': {
        return prisma.suppliers.findFirst({
          where: { id },
          select: { isDeleted: true },
        });
      }
    }
  })();
  if (!record) {
    throw new BusinessError(
      'INVALID_CANONICAL_ID',
      'Canonical ID does not exist',
      400,
    );
  }
  if (record.isDeleted || ('status' in record && record.status !== 1)) {
    return 'RETIRED' as const;
  }
  return 'RESOLVED' as const;
}
