import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionService } from '../inspection.service';
import prisma from '../../utils/prisma';

// Mock prisma
vi.mock('../../utils/prisma', () => ({
    default: {
        inspections: {
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
        },
        inspection_items: {
            deleteMany: vi.fn(),
            createMany: vi.fn(),
        },
        quality_records: {
            count: vi.fn(),
            findMany: vi.fn(),
        },
        $transaction: vi.fn((cb) => cb({
            inspections: {
                create: vi.fn().mockResolvedValue({ id: 'test-id' }),
                update: vi.fn().mockResolvedValue({ id: 'test-id' }),
            },
            inspection_items: {
                deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
                createMany: vi.fn().mockResolvedValue({ count: 1 }),
            }
        })),
    },
}));

describe('InspectionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('determineItemResult', () => {
        it('should correctly determine PASS for quantitative within tolerance', () => {
            const item = {
                standardValue: 10,
                measuredValue: 10.5,
                upperTolerance: 1,
                lowerTolerance: 1,
                result: 'PASS',
            };
            expect(InspectionService.determineItemResult(item)).toBe('PASS');
        });

        it('should determine FAIL for quantitative outside tolerance', () => {
            const item = {
                standardValue: 10,
                measuredValue: 12,
                upperTolerance: 1,
                lowerTolerance: 1,
                result: 'PASS',
            };
            expect(InspectionService.determineItemResult(item)).toBe('FAIL');
        });

        it('should respect NA result', () => {
            const item = { result: 'NA' };
            expect(InspectionService.determineItemResult(item)).toBe('NA');
        });
    });

    describe('generateSerialNumber', () => {
        it('should handle first record of the day', async () => {
            (prisma.inspections.findFirst as any).mockResolvedValue(null);
            const sn = await InspectionService.generateSerialNumber();
            expect(sn).toMatch(/^INS-\d{8}-001$/);
        });

        it('should increment existing sequence', async () => {
            (prisma.inspections.findFirst as any).mockResolvedValue({
                serialNumber: `INS-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-005`,
            });
            const sn = await InspectionService.generateSerialNumber();
            const seq = sn.split('-')[2];
            expect(seq).toBe('006');
        });
    });

    describe('getIssueStats', () => {
        it('should correctly aggregate counts and loss amounts', async () => {
            const mockIssues = [
                { status: 'OPEN', lossAmount: '100.00', date: new Date('2024-01-15'), defectType: 'Minor' },
                { status: 'CLOSED', lossAmount: '200.00', date: new Date('2024-01-20'), defectType: 'Major' },
            ];
            (prisma.quality_records.findMany as any).mockResolvedValue(mockIssues);

            const stats = await InspectionService.getIssueStats(2024);

            expect(stats.totalCount).toBe(2);
            expect(stats.openCount).toBe(1);
            expect(stats.closedCount).toBe(1);
            expect(stats.totalLoss).toBe(300);
            expect(stats.closedRate).toBe(50);
            expect(stats.pieData).toContainEqual({ name: 'Minor', value: 1 });
            expect(stats.pieData).toContainEqual({ name: 'Major', value: 1 });
        });
    });
});
