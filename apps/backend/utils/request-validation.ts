export function getMissingRequiredFields(
  body: Record<string, unknown>,
  fields: string[],
): string[] {
  return fields.filter((field) => {
    const value = body[field];
    if (value === undefined || value === null) {
      return true;
    }

    if (typeof value === 'string') {
      return value.trim().length === 0;
    }

    return false;
  });
}
