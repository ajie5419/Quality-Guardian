export function getPrismaErrorCode(error: unknown): string | undefined {
  return (error as { code?: string })?.code;
}

export function isPrismaErrorCode(error: unknown, code: string): boolean {
  return getPrismaErrorCode(error) === code;
}

export function isPrismaNotFoundError(error: unknown): boolean {
  return isPrismaErrorCode(error, 'P2025');
}

export function isPrismaForeignKeyError(error: unknown): boolean {
  return isPrismaErrorCode(error, 'P2003');
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return isPrismaErrorCode(error, 'P2002');
}

export function isPrismaUniqueConflictError(error: unknown): boolean {
  if (isPrismaUniqueConstraintError(error)) {
    return true;
  }

  const message = String(error ?? '');
  return (
    message.includes('Unique constraint') ||
    message.includes('Unique constraint failed')
  );
}

export function isPrismaRequiredValueError(error: unknown): boolean {
  return isPrismaErrorCode(error, 'P2011') || isPrismaErrorCode(error, 'P2012');
}

export function isPrismaMissingColumnError(error: unknown): boolean {
  if (isPrismaErrorCode(error, 'P2022')) {
    return true;
  }

  const message = String(
    (error as { message?: string })?.message || error || '',
  );
  return (
    message.includes('does not exist in the current database') &&
    message.toLowerCase().includes('column')
  );
}

export function isPrismaSchemaMismatchError(error: unknown): boolean {
  if (isPrismaErrorCode(error, 'P2021') || isPrismaErrorCode(error, 'P2022')) {
    return true;
  }

  const message = String(
    (error as { message?: string })?.message || error || '',
  ).toLowerCase();
  return (
    message.includes('does not exist in the current database') &&
    (message.includes('column') || message.includes('table'))
  );
}
