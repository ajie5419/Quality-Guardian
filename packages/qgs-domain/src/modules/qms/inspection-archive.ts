export function parseDailySummaryContent(summary?: null | string) {
  if (!summary) {
    return { summary: '' };
  }
  try {
    const parsed = JSON.parse(summary) as { summary?: string };
    if (parsed && typeof parsed === 'object') {
      return {
        summary: String(parsed.summary || ''),
      };
    }
  } catch {
    return { summary: String(summary || '') };
  }
  return { summary: String(summary || '') };
}

export function mapInspectionArchiveStatusLabel(status?: string) {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  if (normalized === 'TEMPLATE_MISSING') return '检验表未编制';
  if (normalized === 'ARCHIVED') return '已归档';
  if (normalized === 'IN_PROGRESS') return '整理中';
  if (normalized === 'REJECTED') return '已退回';
  return '待整理';
}
