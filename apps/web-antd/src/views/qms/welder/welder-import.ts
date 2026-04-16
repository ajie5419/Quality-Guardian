import { readImportRowsFromFile } from '#/utils/import-sheet';

function toBoolean(value: unknown) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  return (
    text === '1' ||
    text === 'true' ||
    text === 'yes' ||
    text === 'y' ||
    text === '是' ||
    text === '通过'
  );
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeImportKey(value: unknown) {
  return String(value ?? '')
    .replaceAll(/\s+/g, '')
    .replaceAll('_', '')
    .toLowerCase();
}

function pickImportValue(
  row: Record<string, unknown>,
  aliases: string[],
): unknown {
  const normalizedAliases = new Set(
    aliases.map((alias) => normalizeImportKey(alias)),
  );
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeImportKey(key))) {
      return value;
    }
  }
  return undefined;
}

function isHeaderLikeWelderRecord(params: { code?: string; name?: string }) {
  const name = String(params.name || '')
    .trim()
    .toLowerCase();
  const code = String(params.code || '')
    .trim()
    .toLowerCase();
  const combined = `${name} ${code}`;
  return (
    combined.includes('焊工编号') ||
    combined.includes('焊工姓名') ||
    combined.includes('姓名') ||
    combined.includes('最新') ||
    combined.includes('(姓名)') ||
    combined.includes('（姓名）') ||
    combined.includes('weldercode') ||
    combined.includes('weldername')
  );
}

function mapWelderImportRow(row: Record<string, unknown>) {
  const welderCodeValue = pickImportValue(row, [
    'welderCode',
    '焊工编号',
    '编号',
    'code',
  ]);
  const nameValue = pickImportValue(row, [
    'name',
    '焊工姓名',
    '姓名',
    'welderName',
    'welder_name',
  ]);
  const teamValue = pickImportValue(row, [
    'team',
    '所属班组',
    '班组',
    'group',
    'teamName',
    '所属车间',
  ]);
  const weldingMethodValue = pickImportValue(row, [
    'welding_method',
    'weldingMethod',
    '焊接方法',
    '焊法',
  ]);
  const certificationNoValue = pickImportValue(row, [
    'certificationNo',
    '焊工证号',
    '证号',
    'certificateNo',
  ]);
  const examDateValue = pickImportValue(row, [
    'examDate',
    '入厂考试时间',
    '考试时间',
    '进厂考试时间',
  ]);
  const employmentStatusValue = pickImportValue(row, [
    'employmentStatus',
    '人员状态',
    '状态',
  ]);
  const examPassedValue = pickImportValue(row, [
    'examPassed',
    '进厂考试通过',
    '考试通过',
    'passed',
  ]);
  const scoreValue = pickImportValue(row, ['score', '积分', '评分']);

  const name = String(
    nameValue ??
      // 兜底：按列位置读取（A序号 B编号 C姓名 D班组）
      Object.values(row)[2] ??
      '',
  ).trim();
  const team = String(
    teamValue ??
      // 兜底：按列位置读取（A序号 B编号 C姓名 D班组）
      Object.values(row)[3] ??
      '',
  ).trim();
  const welderCode = String(
    welderCodeValue ?? Object.values(row)[1] ?? '',
  ).trim();
  const welding_method = String(weldingMethodValue ?? '').trim();
  if (isHeaderLikeWelderRecord({ code: welderCode, name })) return null;
  if (!name || !team) return null;

  return {
    certificationNo: String(certificationNoValue ?? '').trim(),
    employmentStatus:
      String(employmentStatusValue ?? '').trim() === '离职'
        ? 'RESIGNED'
        : 'ON_DUTY',
    examDate: String(examDateValue ?? '').trim(),
    examPassed: toBoolean(examPassedValue ?? ''),
    name,
    score: toNumber(scoreValue ?? 12, 12),
    team,
    welderCode,
    welding_method,
  };
}

async function readWelderRowsFromFile(file: File) {
  const rows = await readImportRowsFromFile(file);
  if (rows.length === 0) return rows;

  const firstRowKeys = Object.keys(rows[0] || {});
  const hasExpectedHeader = firstRowKeys.some((key) =>
    ['焊工编号', '姓名', '焊工姓名', '所属班组', '班组'].some((header) =>
      String(key || '').includes(header),
    ),
  );
  if (hasExpectedHeader) return rows;

  // 兜底：按列位置读取（B=焊工编号, C=姓名, D=所属班组）
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return rows;
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return rows;

  const aoa = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    header: 1,
    raw: false,
  }) as unknown[][];

  if (!Array.isArray(aoa) || aoa.length === 0) return rows;

  const normalized = (value: unknown) =>
    String(value ?? '').replaceAll(/\s+/g, '');
  let headerRowIndex = aoa.findIndex((line) => {
    const cells = new Set((line || []).map((cell) => normalized(cell)));
    return (
      cells.has('焊工编号') &&
      (cells.has('姓名') || cells.has('焊工姓名')) &&
      cells.has('所属班组')
    );
  });

  if (headerRowIndex < 0) {
    headerRowIndex = aoa.findIndex((line) => {
      const b = normalized(line?.[1]);
      const c = normalized(line?.[2]);
      const d = normalized(line?.[3]);
      return (
        b.includes('焊工编号') &&
        (c.includes('姓名') || c.includes('焊工姓名')) &&
        d.includes('所属班组')
      );
    });
  }

  if (headerRowIndex < 0) return rows;

  const fallbackRows: Record<string, unknown>[] = [];
  for (let index = headerRowIndex + 1; index < aoa.length; index++) {
    const line = aoa[index] || [];
    const welderCode = String(line[1] ?? '').trim();
    const name = String(line[2] ?? '').trim();
    const team = String(line[3] ?? '').trim();
    const welding_method = String(line[4] ?? '').trim();
    const examDate = String(line[5] ?? '').trim();
    const employmentStatus = String(line[6] ?? '').trim();
    const examPassed = String(line[7] ?? '').trim();
    const certificationNo = String(line[8] ?? '').trim();
    if (!welderCode && !name && !team) continue;

    fallbackRows.push({
      welderCode,
      name,
      team,
      welding_method,
      examDate,
      employmentStatus,
      examPassed,
      certificationNo,
    });
  }

  return fallbackRows.length > 0 ? fallbackRows : rows;
}

export async function buildWelderImportItems(file: File) {
  const rows = await readWelderRowsFromFile(file);
  return rows.map((row) => mapWelderImportRow(row)).filter(Boolean) as Array<
    Record<string, unknown>
  >;
}
