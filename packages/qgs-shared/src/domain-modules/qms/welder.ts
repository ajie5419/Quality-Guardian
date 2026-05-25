const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SCORE = 12;
const MAX_PAGE_SIZE = 200;

const WELDER_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const WELDER_ID_SUFFIX_SIZE = 6;

function createWelderIdSuffix(size = WELDER_ID_SUFFIX_SIZE) {
  let output = '';
  for (let index = 0; index < size; index += 1) {
    const randomIndex = Math.floor(Math.random() * WELDER_ID_ALPHABET.length);
    output += WELDER_ID_ALPHABET[randomIndex];
  }
  return output;
}

function parsePositiveInt(value: unknown, defaultValue: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return parsed;
}

export function normalizeWelderString(value: unknown): string | undefined {
  const normalized = String(Array.isArray(value) ? value[0] : (value ?? ''))
    .trim()
    .replaceAll(/\s+/g, ' ');

  if (
    !normalized ||
    normalized === 'undefined' ||
    normalized === 'null' ||
    normalized === '[object Object]'
  ) {
    return undefined;
  }

  return normalized;
}

export function normalizeWelderScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SCORE;
  }
  return Math.max(0, Math.min(DEFAULT_SCORE, Math.round(parsed)));
}

export function normalizeWelderDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  const text = normalizeWelderString(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function normalizeWelderEmploymentStatus(
  value: unknown,
): 'ON_DUTY' | 'RESIGNED' | undefined {
  const text = normalizeWelderString(value)?.toLowerCase();
  if (!text) return undefined;
  if (
    text === 'on_duty' ||
    text === 'onduty' ||
    text === '在岗' ||
    text === '在职'
  ) {
    return 'ON_DUTY';
  }
  if (
    text === 'resigned' ||
    text === 'left' ||
    text === '离职' ||
    text === '已离职'
  ) {
    return 'RESIGNED';
  }
  return undefined;
}

export function createWelderId() {
  return `WEL-${new Date().getFullYear()}-${createWelderIdSuffix()}`;
}

export function parseWelderListQuery(query: Record<string, unknown>) {
  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSize = Math.min(
    parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  const sortOrderRaw = normalizeWelderString(query.sortOrder)?.toLowerCase();
  const sortOrder: 'asc' | 'desc' | undefined =
    sortOrderRaw === 'asc' || sortOrderRaw === 'desc'
      ? sortOrderRaw
      : undefined;

  return {
    employmentStatus: normalizeWelderEmploymentStatus(query.employmentStatus),
    keyword: normalizeWelderString(query.keyword),
    page,
    pageSize,
    sortBy: normalizeWelderString(query.sortBy),
    sortOrder,
    team: normalizeWelderString(query.team),
    welderCode: normalizeWelderString(query.welderCode),
  };
}

export function buildWelderCreateDataCore(input: Record<string, unknown>) {
  const name = normalizeWelderString(input.name);
  const team = normalizeWelderString(input.team);
  if (!name || !team) return null;

  return {
    certificationNo: normalizeWelderString(input.certificationNo) ?? null,
    employmentStatus:
      normalizeWelderEmploymentStatus(input.employmentStatus) ?? 'ON_DUTY',
    examDate: normalizeWelderDate(input.examDate) ?? null,
    examPassed: input.examPassed === true || input.examPassed === 'true',
    id: createWelderId(),
    isDeleted: false,
    name,
    score: normalizeWelderScore(input.score),
    team,
    welderCode: normalizeWelderString(input.welderCode) ?? null,
  };
}

export function buildWelderUpdateDataCore(input: Record<string, unknown>) {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    updateData.name = normalizeWelderString(input.name) ?? null;
  }
  if (input.welderCode !== undefined) {
    updateData.welderCode = normalizeWelderString(input.welderCode) ?? null;
  }
  if (input.team !== undefined) {
    updateData.team = normalizeWelderString(input.team) ?? null;
  }
  if (input.examDate !== undefined) {
    updateData.examDate = normalizeWelderDate(input.examDate) ?? null;
  }
  if (input.examPassed !== undefined) {
    updateData.examPassed =
      input.examPassed === true || input.examPassed === 'true';
  }
  if (input.employmentStatus !== undefined) {
    updateData.employmentStatus =
      normalizeWelderEmploymentStatus(input.employmentStatus) ?? 'ON_DUTY';
  }
  if (input.certificationNo !== undefined) {
    updateData.certificationNo =
      normalizeWelderString(input.certificationNo) ?? null;
  }
  if (input.score !== undefined) {
    updateData.score = normalizeWelderScore(input.score);
  }

  return updateData;
}
