import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AfterSalesService } from '../after-sales.service';
import prisma from '../../utils/prisma';

// Mock prisma
vi.mock('../../utils/prisma', () => ({
    default: {
        after_sales: {
            findMany: vi.fn(),
        },
    },
}));

describe('AfterSalesService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getList', () => {
        it('should correctly map database records to frontend items', async () => {
            const mockRecords = [
                {
                    id: 'AS-1',
                    occurDate: new Date('2024-01-01T10:00:00.000Z'),
                    factoryDate: new Date('2023-12-01T10:00:00.000Z'),
                    closeDate: null,
                    shipDate: null,
                    createdAt: new Date('2024-01-01T10:00:00.000Z'),
                    claimStatus: 'OPEN',
                    materialCost: 100,
                    laborTravelCost: 50,
                    respDept: 'Quality',
                    solution: 'Repair',
                    isClaim: true,
                    photos: JSON.stringify(['photo1.jpg']),
                    projectName: 'Project A',
                    workOrderNumber: 'WO-001',
                },
            ];

            (prisma.after_sales.findMany as any).mockResolvedValue(mockRecords);

            const result = await AfterSalesService.getList({});

            expect(result).toHaveLength(1);
            const item = result[0];
            expect(item.id).toBe('AS-1');
            expect(item.occurDate).toBe('2024-01-01');
            expect(item.issueDate).toBe('2024-01-01');
            expect(item.qualityLoss).toBe(150);
            expect(item.photos).toEqual(['photo1.jpg']);
            expect(item.responsibleDept).toBe('Quality');
        });

        it('should handle empty or invalid photos field', async () => {
            const mockRecords = [
                {
                    id: 'AS-2',
                    occurDate: new Date(),
                    photos: null,
                    materialCost: 0,
                    laborTravelCost: 0,
                },
                {
                    id: 'AS-3',
                    occurDate: new Date(),
                    photos: '',
                    materialCost: 0,
                    laborTravelCost: 0,
                },
            ];

            (prisma.after_sales.findMany as any).mockResolvedValue(mockRecords);

            const result = await AfterSalesService.getList({});
            expect(result[0].photos).toEqual([]);
            expect(result[1].photos).toEqual([]);
        });
    });
});
