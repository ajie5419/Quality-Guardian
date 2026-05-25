export function normalizePlanningWorkOrderNumber(
  value: unknown,
): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

export function normalizePlanningProjectName(
  value: unknown,
): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

export function buildPlanningProjectUpdateData(
  body: { projectName?: unknown; status?: unknown },
  normalizeStatus: (status: unknown) => string,
) {
  return {
    projectName: normalizePlanningProjectName(body.projectName),
    status:
      body.status === undefined ? undefined : normalizeStatus(body.status),
    updatedAt: new Date(),
  };
}
