/**
 * PROCESS internal responsibility is the production team users recognize.
 * TEAM identity remains a separate legacy/execution field and is never derived
 * from a department ID.
 */
export function resolveInspectionTeamDisplay(input: {
  category?: null | string;
  responsibilityType?: null | string;
  responsibleDepartment?: null | string;
  supplierName?: null | string;
  team?: null | string;
}): null | string {
  const responsibleDepartment = String(
    input.responsibleDepartment || '',
  ).trim();
  if (
    input.category === 'PROCESS' &&
    input.responsibilityType === 'INTERNAL_DEPARTMENT' &&
    responsibleDepartment
  ) {
    return responsibleDepartment;
  }
  if (
    input.category === 'PROCESS' &&
    input.responsibilityType === 'OUTSOURCING_UNIT'
  ) {
    return String(input.supplierName || '').trim() || null;
  }

  return String(input.team || '').trim() || null;
}
