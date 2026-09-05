import { parseResponsibleDepartments } from '~/utils/department-multi';

export function getResponsibleDepartmentsForResponse(
  item: {
    respDept: null | string;
    responsibleDepartments: null | string;
  },
  currentResponsibleDepartmentName?: null | string,
): string[] {
  const responsibleDepartments = parseResponsibleDepartments(
    item.responsibleDepartments,
  );
  const snapshotResponsibleDepartment = String(item.respDept || '').trim();
  if (currentResponsibleDepartmentName) {
    const remainingDepartments = responsibleDepartments.includes(
      snapshotResponsibleDepartment,
    )
      ? responsibleDepartments.filter(
          (department) => department !== snapshotResponsibleDepartment,
        )
      : responsibleDepartments.slice(1);
    return [currentResponsibleDepartmentName, ...remainingDepartments];
  }
  if (responsibleDepartments.length > 0) {
    return responsibleDepartments;
  }
  return snapshotResponsibleDepartment ? [snapshotResponsibleDepartment] : [];
}

/**
 * After-sales list DTO (PERF-QMS-001 / PHASE-1A): the interactive list only
 * consumes the fields below. Long text columns that are not rendered by the
 * list/detail/edit flow (actualSolution, remarks, feedbackDept, failureCause,
 * ...) are intentionally not selected so the page never reads them into
 * memory. photos and solution stay: the grid renders the first photo
 * thumbnail and resolutionPlan respectively.
 */
export const AFTER_SALES_LIST_SELECT = {
  claimStatus: true,
  closeDate: true,
  createdAt: true,
  customerName: true,
  defectCategory: { select: { name: true } },
  defectCategoryId: true,
  defectSubcategory: { select: { name: true } },
  defectSubcategoryId: true,
  defectSubtype: true,
  defectSubtypeId: true,
  defectType: true,
  defectTypeId: true,
  division: true,
  factoryDate: true,
  handler: true,
  id: true,
  isClaim: true,
  issueDescription: true,
  laborTravelCost: true,
  location: true,
  materialCost: true,
  occurDate: true,
  partName: true,
  photos: true,
  productCategory: { select: { name: true } },
  productCategoryId: true,
  productSubcategory: { select: { name: true } },
  productSubcategoryId: true,
  productSubtype: true,
  productSubtypeId: true,
  productType: true,
  productTypeId: true,
  projectId: true,
  projectName: true,
  quantity: true,
  respDept: true,
  respDeptId: true,
  responsibleDepartments: true,
  runningHours: true,
  serialNumber: true,
  severity: true,
  shipDate: true,
  solution: true,
  supplierBrand: true,
  supplierBrandId: true,
  version: true,
  warrantyStatus: true,
  workOrderNumber: true,
} as const;
