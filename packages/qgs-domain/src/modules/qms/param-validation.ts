export function parseRequiredParamValue(value: unknown): null | string {
  const normalized =
    value === undefined || value === null ? '' : String(value);
  return normalized ? normalized : null;
}
