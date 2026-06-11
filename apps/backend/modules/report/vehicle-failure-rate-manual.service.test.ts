import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getVehicleFailureManualData,
  getVehicleFailureManualWarrantyData,
  saveVehicleFailureManualPayload,
  VEHICLE_FAILURE_MANUAL_SETTING_KEY,
  VEHICLE_FAILURE_MANUAL_WARRANTY_SETTING_KEY,
} from '~/modules/report/vehicle-failure-rate-manual.service';
import { SystemService } from '~/modules/system';

vi.mock('~/modules/system', () => ({
  SystemService: {
    getSettingValue: vi.fn(),
    saveSettingValue: vi.fn(),
  },
}));

describe('vehicleFailureRateManualService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty object when no manual data exists', async () => {
    (SystemService.getSettingValue as any).mockResolvedValue(null);

    const result = await getVehicleFailureManualData();

    expect(result).toEqual({});
    expect(SystemService.getSettingValue).toHaveBeenCalledWith(
      VEHICLE_FAILURE_MANUAL_SETTING_KEY,
    );
  });

  it('parses valid JSON manual data', async () => {
    (SystemService.getSettingValue as any).mockResolvedValue(
      JSON.stringify({ '2025-03': 12, '2025-04': 8 }),
    );

    const result = await getVehicleFailureManualData();

    expect(result).toEqual({ '2025-03': 12, '2025-04': 8 });
  });

  it('filters out non-finite values from manual data', async () => {
    (SystemService.getSettingValue as any).mockResolvedValue(
      JSON.stringify({
        '2025-01': 5,
        '2025-02': Number.NaN,
        '2025-03': Infinity,
      }),
    );

    const result = await getVehicleFailureManualData();

    expect(result).toEqual({ '2025-01': 5, '2025-02': 0, '2025-03': 0 });
  });

  it('returns empty object when JSON is invalid', async () => {
    (SystemService.getSettingValue as any).mockResolvedValue('not-json');

    const result = await getVehicleFailureManualData();

    expect(result).toEqual({});
  });

  it('returns empty object for empty string value', async () => {
    (SystemService.getSettingValue as any).mockResolvedValue('');

    const result = await getVehicleFailureManualData();

    expect(result).toEqual({});
  });

  it('returns empty object for null value', async () => {
    (SystemService.getSettingValue as any).mockResolvedValue(null);

    const result = await getVehicleFailureManualData();

    expect(result).toEqual({});
  });

  it('fetches warranty data with the correct setting key', async () => {
    (SystemService.getSettingValue as any).mockResolvedValue(
      JSON.stringify({ '2025-06': 200 }),
    );

    const result = await getVehicleFailureManualWarrantyData();

    expect(result).toEqual({ '2025-06': 200 });
    expect(SystemService.getSettingValue).toHaveBeenCalledWith(
      VEHICLE_FAILURE_MANUAL_WARRANTY_SETTING_KEY,
    );
  });

  it('saves manual count payload and merges with existing data', async () => {
    (SystemService.getSettingValue as any).mockResolvedValue(
      JSON.stringify({ '2025-01': 5 }),
    );
    (SystemService.saveSettingValue as any).mockResolvedValue(undefined);

    const result = await saveVehicleFailureManualPayload({
      count: 10,
      month: '2025-02',
      updatedBy: 'admin',
    });

    expect(result).toEqual({
      count: 10,
      month: '2025-02',
      success: true,
      updatedBy: 'admin',
    });
    expect(SystemService.saveSettingValue).toHaveBeenCalledWith({
      description: expect.stringContaining('admin'),
      key: VEHICLE_FAILURE_MANUAL_SETTING_KEY,
      value: JSON.stringify({ '2025-01': 5, '2025-02': 10 }),
    });
  });

  it('saves warranty vehicle count payload', async () => {
    (SystemService.getSettingValue as any).mockResolvedValue(
      JSON.stringify({ '2025-03': 100 }),
    );
    (SystemService.saveSettingValue as any).mockResolvedValue(undefined);

    const result = await saveVehicleFailureManualPayload({
      month: '2025-04',
      updatedBy: 'user1',
      warrantyVehicleCount: 250,
    });

    expect(result).toEqual({
      month: '2025-04',
      success: true,
      updatedBy: 'user1',
      warrantyVehicleCount: 250,
    });
    expect(SystemService.saveSettingValue).toHaveBeenCalledWith({
      description: expect.stringContaining('user1'),
      key: VEHICLE_FAILURE_MANUAL_WARRANTY_SETTING_KEY,
      value: JSON.stringify({ '2025-03': 100, '2025-04': 250 }),
    });
  });

  it('saves both count and warranty when both provided', async () => {
    (SystemService.getSettingValue as any)
      .mockResolvedValueOnce(JSON.stringify({ '2025-01': 1 }))
      .mockResolvedValueOnce(JSON.stringify({ '2025-01': 50 }));
    (SystemService.saveSettingValue as any).mockResolvedValue(undefined);

    const result = await saveVehicleFailureManualPayload({
      count: 7,
      month: '2025-01',
      updatedBy: 'admin',
      warrantyVehicleCount: 200,
    });

    expect(result.count).toBe(7);
    expect(result.warrantyVehicleCount).toBe(200);
    expect(SystemService.saveSettingValue).toHaveBeenCalledTimes(2);
  });

  it('returns payload with only month and success when no count or warranty', async () => {
    const result = await saveVehicleFailureManualPayload({
      month: '2025-06',
      updatedBy: 'admin',
    });

    expect(result).toEqual({
      month: '2025-06',
      success: true,
      updatedBy: 'admin',
    });
    expect(SystemService.saveSettingValue).not.toHaveBeenCalled();
  });

  it('overwrites existing manual value for the same month', async () => {
    (SystemService.getSettingValue as any).mockResolvedValue(
      JSON.stringify({ '2025-05': 3 }),
    );
    (SystemService.saveSettingValue as any).mockResolvedValue(undefined);

    await saveVehicleFailureManualPayload({
      count: 15,
      month: '2025-05',
      updatedBy: 'admin',
    });

    expect(SystemService.saveSettingValue).toHaveBeenCalledWith({
      description: expect.any(String),
      key: VEHICLE_FAILURE_MANUAL_SETTING_KEY,
      value: JSON.stringify({ '2025-05': 15 }),
    });
  });

  it('returns empty object when existing data is empty object from system settings', async () => {
    (SystemService.getSettingValue as any).mockResolvedValue('{}');

    const result = await getVehicleFailureManualData();

    expect(result).toEqual({});
  });
});
