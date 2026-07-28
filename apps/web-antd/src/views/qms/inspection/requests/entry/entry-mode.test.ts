import { describe, expect, it } from 'vitest';

import {
  buildInspectionRequestEntryProcessOptions,
  mapInspectionRequestEntryBomPartOptions,
  mapInspectionRequestEntryTeamOptions,
} from './entry-mode';

describe('inspection request entry identity options', () => {
  it('keeps canonical TEAM IDs as selector values', () => {
    expect(
      mapInspectionRequestEntryTeamOptions([
        { group: 'internal', label: 'Internal Team', value: 'team-1' },
        { group: 'external', label: 'Resident Team', value: 'team-2' },
      ]),
    ).toEqual([
      {
        label: '内部生产车间',
        options: [{ label: 'Internal Team', value: 'team-1' }],
      },
      {
        label: '外协加工单位',
        options: [{ label: 'Resident Team', value: 'team-2' }],
      },
    ]);
  });

  it('uses canonical part IDs instead of names or BOM row IDs', () => {
    expect(
      mapInspectionRequestEntryBomPartOptions([
        {
          partId: 'part-1',
          partName: 'Frame',
          partNumber: 'P-001',
        },
        { partId: null, partName: 'Legacy', partNumber: 'P-002' },
      ]),
    ).toEqual([
      {
        label: 'Frame (P-001)',
        partName: 'Frame',
        value: 'part-1',
      },
    ]);
  });

  it('uses process master IDs and does not synthesize name values', () => {
    expect(
      buildInspectionRequestEntryProcessOptions(
        [
          {
            category: 'PROCESS',
            processId: 'process-1',
            processName: 'Welding',
          },
          {
            category: 'INCOMING',
            processId: 'process-2',
            processName: 'Renamed receipt verification',
          },
        ],
        'PROCESS',
      ),
    ).toEqual([
      {
        label: 'Welding',
        processName: 'Welding',
        value: 'process-1',
      },
    ]);
  });

  it('filters process options by explicit request category', () => {
    expect(
      buildInspectionRequestEntryProcessOptions(
        [
          {
            category: 'PROCESS',
            processId: 'process-1',
            processName: 'Welding',
          },
          {
            category: 'INCOMING',
            processId: 'process-2',
            processName: 'Renamed receipt verification',
          },
        ],
        'INCOMING',
      ),
    ).toEqual([
      {
        label: 'Renamed receipt verification',
        processName: 'Renamed receipt verification',
        value: 'process-2',
      },
    ]);
  });
});
