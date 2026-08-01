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

type RegistryEntry = { dictionaryType?: string; kind: CanonicalKind };

const INSPECTION_FIELDS: Record<string, RegistryEntry> = {
  incomingTypeId: { dictionaryType: 'incoming_type', kind: 'dictionary' },
  materialNameId: { dictionaryType: 'material_name', kind: 'dictionary' },
  partId: { kind: 'part' },
  processId: { kind: 'process' },
  projectId: { kind: 'project' },
  supplierId: { kind: 'supplier' },
  teamId: { dictionaryType: 'team', kind: 'dictionary' },
};

const IDENTITY_REGISTRY: Record<string, Record<string, RegistryEntry>> = {
  after_sales: {
    defectCategoryId: { kind: 'quality-category' },
    defectSubcategoryId: { kind: 'quality-subcategory' },
    feedbackDeptId: { kind: 'department' },
    partId: { kind: 'part' },
    productCategoryId: { kind: 'quality-category' },
    productSubcategoryId: { kind: 'quality-subcategory' },
    projectId: { kind: 'project' },
    respDeptId: { kind: 'department' },
    supplierBrandId: { kind: 'supplier' },
  },
  inspections: INSPECTION_FIELDS,
  project_boms: {
    partId: { kind: 'part' },
    requiredProcessIds: { kind: 'process' },
  },
  qms_inspection_requests: {
    partId: { kind: 'part' },
    processId: { kind: 'process' },
    supplierId: { kind: 'supplier' },
    teamId: { dictionaryType: 'team', kind: 'dictionary' },
  },
  quality_records: {
    defectCategoryId: { kind: 'quality-category' },
    defectClassification: { kind: 'quality-subcategory' },
    defectSubcategoryId: { kind: 'quality-subcategory' },
    partId: { kind: 'part' },
    processId: { kind: 'process' },
    projectId: { kind: 'project' },
    responsibleDepartmentId: { kind: 'department' },
    supplierId: { kind: 'supplier' },
  },
  supplier_identity_links: { supplierId: { kind: 'supplier' } },
  work_order_requirements: {
    partId: { kind: 'part' },
    processId: { kind: 'process' },
    requirementId: { dictionaryType: 'requirement_name', kind: 'dictionary' },
    responsibleTeamId: { dictionaryType: 'team', kind: 'dictionary' },
  },
  work_orders: {
    customerNameId: { dictionaryType: 'customer_name', kind: 'dictionary' },
    divisionId: { kind: 'department' },
    projectId: { kind: 'project' },
  },
};

export function getIdentityRegistryEntry(
  entityType: string,
  fieldName: string,
) {
  return IDENTITY_REGISTRY[entityType]?.[fieldName] || null;
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
