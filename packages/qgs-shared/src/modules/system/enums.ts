/**
 * System Business Logic Enums
 */

/**
 * System Status (Enabled/Disabled)
 */
export enum SysStatusEnum {
  DISABLED = 0,
  ENABLED = 1,
}

/**
 * Login Status
 */
export enum LoginStatusEnum {
  FAIL = '失败',
  SUCCESS = '成功',
}

/**
 * Login Method
 */
export enum LoginMethodEnum {
  GATEWAY = '网关登录',
  OTHER = '其他',
  PASSWORD = '密码登录',
}
