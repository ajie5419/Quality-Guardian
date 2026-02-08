import { requestClient } from '../request';

/**
 * 获取模块的合并偏好设置 (用户偏好 -> 系统默认)
 * @param module 模块名称
 * @param systemKey 系统默认值的 key (可选)
 */
export async function getMergedPreferenceApi(module: string, systemKey?: string) {
    return requestClient.get<any>(`/user/preferences/${module}`, {
        params: { systemKey },
    });
}

/**
 * 保存用户特定的模块偏好设置
 * @param module 模块名称
 * @param data 偏好数据
 */
export async function saveUserPreferenceApi(module: string, data: any) {
    return requestClient.post('/user/preferences/' + module, { data });
}

/**
 * 获取系统设置
 * @param key 设置的 key
 */
export async function getSystemSettingApi(key: string) {
    return requestClient.get<any>(`/system/settings/${key}`);
}

/**
 * 保存系统全局设置 (仅限管理员)
 * @param key 设置的 key
 * @param value 设置的值
 * @param description 设置的描述
 */
export async function saveSystemSettingApi(key: string, value: any, description?: string) {
    return requestClient.post(`/system/settings/${key}`, { value, description });
}
