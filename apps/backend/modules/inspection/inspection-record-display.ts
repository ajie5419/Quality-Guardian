import { resolveInspectionTeamDisplay } from './inspection-team-display';

export function resolveInspectionRecordTeamDisplay(input: {
  category?: null | string;
  linkedInternalResponsibilityUnresolved?: boolean;
  linkedInternalResponsibleDepartment?: null | string;
  responsibilityType?: null | string;
  responsibleDepartment?: null | string;
  supplierName?: null | string;
  team?: null | string;
}): null | string {
  const directDisplay = resolveInspectionTeamDisplay(input);
  if (
    input.category === 'PROCESS' &&
    input.responsibilityType === 'INTERNAL_DEPARTMENT' &&
    String(input.responsibleDepartment || '').trim()
  ) {
    return directDisplay;
  }

  const mayResolveLinkedInternalResponsibility =
    input.category === 'PROCESS' &&
    (!input.responsibilityType ||
      input.responsibilityType === 'INTERNAL_DEPARTMENT');
  if (mayResolveLinkedInternalResponsibility) {
    if (input.linkedInternalResponsibilityUnresolved) return null;
    const linkedDepartment = String(
      input.linkedInternalResponsibleDepartment || '',
    ).trim();
    if (linkedDepartment) return linkedDepartment;
  }

  return directDisplay;
}

export function requiresLinkedInternalResponsibility(input: {
  category?: null | string;
  responsibilityType?: null | string;
  responsibleDepartment?: null | string;
}) {
  return (
    input.category === 'PROCESS' &&
    !String(input.responsibleDepartment || '').trim() &&
    (!input.responsibilityType ||
      input.responsibilityType === 'INTERNAL_DEPARTMENT')
  );
}
