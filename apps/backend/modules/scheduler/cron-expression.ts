/**
 * Lightweight 5-field cron expression parser and matcher.
 *
 * Supported syntax (covers the project's scheduling needs):
 *   - exact numbers       e.g. 0 8 * * *
 *   - wildcard *          any value
 *   - lists 1,15          multiple values
 *   - ranges 1-5          inclusive ranges (weekday 1-5 = Mon-Fri)
 *
 * Not supported (add if ever needed): step values (slash n), L, W, #, ?.
 *
 * Field order (standard cron): minute hour day-of-month month day-of-week
 *   0 8 * * *   → every day at 08:00
 *   0 2 1 * *   → first day of every month at 02:00
 */

export interface CronFieldSpec {
  values: Set<number>; // expanded allowed values
  wildcard: boolean;
}

const FIELD_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday)
];

export function parseCronField(
  field: string,
  min: number,
  max: number,
): CronFieldSpec {
  const trimmed = field.trim();
  if (trimmed === '*') return { values: new Set(), wildcard: true };
  if (trimmed === '?') return { values: new Set(), wildcard: true };

  const values = new Set<number>();
  for (const part of trimmed.split(',')) {
    const rangeMatch = part.match(/^(\d+)-(\d+)$/u);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const end = Number.parseInt(rangeMatch[2], 10);
      if (start > end) {
        throw new Error(`invalid cron range "${part}": start > end`);
      }
      for (let value = start; value <= end; value += 1) values.add(value);
      continue;
    }
    const value = Number.parseInt(part, 10);
    if (!Number.isFinite(value)) {
      throw new TypeError(`invalid cron value "${part}"`);
    }
    values.add(value);
  }
  for (const value of values) {
    if (value < min || value > max) {
      throw new Error(
        `cron value ${value} out of range [${min}, ${max}] in field "${field}"`,
      );
    }
  }
  return { values, wildcard: false };
}

export function parseCronExpression(expression: string) {
  const fields = expression.trim().split(/\s+/u);
  if (fields.length !== 5) {
    throw new Error(
      `invalid cron expression "${expression}": expected 5 fields (minute hour day month weekday)`,
    );
  }
  return fields.map((field, index) => {
    const [min, max] = FIELD_RANGES[index];
    return parseCronField(field, min, max);
  });
}

function fieldMatches(spec: CronFieldSpec, value: number): boolean {
  return spec.wildcard || spec.values.has(value);
}

/**
 * Whether the given date matches the expression (minute-level precision).
 */
export function matchesCronExpression(expression: string, date: Date): boolean {
  const specs = parseCronExpression(expression);
  return (
    fieldMatches(specs[0], date.getMinutes()) &&
    fieldMatches(specs[1], date.getHours()) &&
    fieldMatches(specs[2], date.getDate()) &&
    fieldMatches(specs[3], date.getMonth() + 1) &&
    fieldMatches(specs[4], date.getDay())
  );
}
