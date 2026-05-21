import type { Prisma } from '@prisma/client';

import { resolveInspectionFormProcessCandidates } from '@qgs/domain';
import { resolveProcessIdForWrite } from '~/utils/process-resolver';

export {
  parseInspectionFormFields,
  resolveInspectionFormProcess,
  resolveInspectionFormProcessCandidates,
} from '@qgs/domain';

export async function buildInspectionFormProcessFilter(params: {
  category?: string;
  incomingType?: string;
  processId?: null | string;
  processName: string;
}): Promise<Prisma.inspection_form_templatesWhereInput> {
  const processName = String(params.processName || '').trim();
  const fallbackProcessId = String(params.processId || '').trim() || null;
  if (!processName) {
    if (fallbackProcessId) {
      return { processId: fallbackProcessId };
    }
    return {};
  }

  const processCandidates = resolveInspectionFormProcessCandidates({
    category: String(params.category || '').trim(),
    incomingType: String(params.incomingType || '').trim(),
    processName,
  });
  const resolvedProcessId = await resolveProcessIdForWrite({ processName });
  const processId = resolvedProcessId || fallbackProcessId;
  const candidateNames =
    processCandidates.length > 0 ? processCandidates : [processName];

  if (processId) {
    return {
      OR: [
        { processId },
        {
          processName: {
            in: candidateNames,
          },
        },
      ],
    };
  }

  return {
    processName: {
      in: candidateNames,
    },
  };
}
