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
  SUCCESS = '成功',
  FAIL = '失败',
}

/**
 * Login Method
 */
export enum LoginMethodEnum {
  PASSWORD = '密码登录',
  GATEWAY = '网关登录',
  OTHER = '其他',
}
