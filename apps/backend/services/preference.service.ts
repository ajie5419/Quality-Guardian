import prisma from '~/utils/prisma';

export const PreferenceService = {
  /**
   * 获取用户特定模块的偏好设置
   */
  async getUserPreference(userId: string, module: string) {
    return (prisma as any).user_preferences.findUnique({
      where: {
        userId_module: {
          userId,
          module,
        },
      },
    });
  },

  /**
   * 保存用户特定模块的偏好设置
   */
  async setUserPreference(userId: string, module: string, data: any) {
    const preferenceData =
      typeof data === 'string' ? data : JSON.stringify(data);

    return (prisma as any).user_preferences.upsert({
      where: {
        userId_module: {
          userId,
          module,
        },
      },
      update: {
        preference_data: preferenceData,
      },
      create: {
        userId,
        module,
        preference_data: preferenceData,
      },
    });
  },

  /**
   * 获取系统全局设置
   */
  async getSystemSetting(key: string) {
    return prisma.system_settings.findUnique({
      where: { key },
    });
  },

  /**
   * 保存系统全局设置 (通常仅限管理端)
   */
  async setSystemSetting(key: string, value: string, description?: string) {
    return prisma.system_settings.upsert({
      where: { key },
      update: {
        value,
        description,
      },
      create: {
        key,
        value,
        description,
      },
    });
  },

  /**
   * 获取合并后的偏好设置 (优先用户，次选系统默认)
   */
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
