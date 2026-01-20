import prisma from './prisma';

export async function getMetadata<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const setting = await prisma.system_settings.findUnique({
      where: { key },
    });
    if (!setting || !setting.value) {
      return defaultValue;
    }
    return JSON.parse(setting.value) as T;
  } catch (error) {
    console.error(`Failed to get metadata for ${key}:`, error);
    return defaultValue;
  }
}

export async function setMetadata<T>(key: string, value: T): Promise<void> {
  try {
    await prisma.system_settings.upsert({
      where: { key },
      update: {
        value: JSON.stringify(value),
        updatedAt: new Date(),
      },
      create: {
        key,
        value: JSON.stringify(value),
        updatedAt: new Date(),
        description: 'Store persistent metadata for mock logic',
      },
    });
  } catch (error) {
    console.error(`Failed to set metadata for ${key}:`, error);
  }
}
