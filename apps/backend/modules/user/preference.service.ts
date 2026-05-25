import prisma from '~/utils/prisma';

export const PreferenceService = {
  async getUserPreference(userId: string, module: string) {
    return (prisma as any).user_preferences.findUnique({
      where: { userId_module: { userId, module } },
    });
  },

  async setUserPreference(userId: string, module: string, data: unknown) {
    const preferenceData =
      typeof data === 'string' ? data : JSON.stringify(data);
    return (prisma as any).user_preferences.upsert({
      where: { userId_module: { userId, module } },
      update: { preference_data: preferenceData },
      create: { userId, module, preference_data: preferenceData },
    });
  },

  async deleteUserPreference(userId: string, module: string) {
    return (prisma as any).user_preferences
      .delete({ where: { userId_module: { userId, module } } })
      .catch(() => null);
  },

  async clearAllUserPreferences(module: string) {
    return (prisma as any).user_preferences.deleteMany({ where: { module } });
  },

  async getSystemSetting(key: string) {
    return prisma.system_settings.findUnique({ where: { key } });
  },

  async setSystemSetting(key: string, value: string, description?: string) {
    return prisma.system_settings.upsert({
      where: { key },
      update: { value, description },
      create: { key, value, description },
    });
  },

  async getMergedPreference(userId: string, module: string, systemKey: string) {
    const [userPref, systemPref] = await Promise.all([
      this.getUserPreference(userId, module),
      this.getSystemSetting(systemKey),
    ]);

    if (userPref) {
      try {
        return JSON.parse(userPref.preference_data);
      } catch {
        return userPref.preference_data;
      }
    }
    if (systemPref?.value) {
      try {
        return JSON.parse(systemPref.value);
      } catch {
        return systemPref.value;
      }
    }
    return null;
  },
};
