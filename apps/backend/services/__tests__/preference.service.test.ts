import { describe, expect, it, vi, beforeEach } from 'vitest';
import prisma from '../../utils/prisma';
import { PreferenceService } from '../preference.service';

vi.mock('../../utils/prisma', () => ({
    default: {
        user_preferences: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
        system_settings: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

describe('PreferenceService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getUserPreference', () => {
        it('should fetch user preference for a specific module', async () => {
            const mockResult = { id: '1', userId: 'user1', module: 'table', preference_data: '{}' };
            (prisma.user_preferences.findUnique as any).mockResolvedValue(mockResult);

            const result = await PreferenceService.getUserPreference('user1', 'table');
            expect(result).toEqual(mockResult);
            expect(prisma.user_preferences.findUnique).toHaveBeenCalledWith({
                where: {
                    userId_module: {
                        userId: 'user1',
                        module: 'table',
                    },
                },
            });
        });
    });

    describe('setUserPreference', () => {
        it('should upsert user preference with stringified data', async () => {
            const mockRes = { id: '1' };
            (prisma.user_preferences.upsert as any).mockResolvedValue(mockRes);

            const data = { theme: 'dark' };
            await PreferenceService.setUserPreference('user1', 'colors', data);

            expect(prisma.user_preferences.upsert).toHaveBeenCalledWith({
                where: {
                    userId_module: {
                        userId: 'user1',
                        module: 'colors',
                    },
                },
                update: {
                    preference_data: JSON.stringify(data),
                },
                create: {
                    userId: 'user1',
                    module: 'colors',
                    preference_data: JSON.stringify(data),
                },
            });
        });
    });

    describe('getMergedPreference', () => {
        it('should return user preference if it exists', async () => {
            (prisma.user_preferences.findUnique as any).mockResolvedValue({
                preference_data: JSON.stringify({ show: true }),
            });
            (prisma.system_settings.findUnique as any).mockResolvedValue({
                value: JSON.stringify({ show: false }),
            });

            const result = await PreferenceService.getMergedPreference('u1', 'm1', 's1');
            expect(result).toEqual({ show: true });
        });

        it('should fallback to system setting if user preference is missing', async () => {
            (prisma.user_preferences.findUnique as any).mockResolvedValue(null);
            (prisma.system_settings.findUnique as any).mockResolvedValue({
                value: JSON.stringify({ default: 'value' }),
            });

            const result = await PreferenceService.getMergedPreference('u1', 'm1', 's1');
            expect(result).toEqual({ default: 'value' });
        });

        it('should handle non-JSON data gracefully', async () => {
            (prisma.user_preferences.findUnique as any).mockResolvedValue({
                preference_data: 'simple-string',
            });

            const result = await PreferenceService.getMergedPreference('u1', 'm1', 's1');
            expect(result).toBe('simple-string');
        });
    });
});
