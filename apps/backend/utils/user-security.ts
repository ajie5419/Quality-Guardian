import process from 'node:process';

export const USER_RESET_PASSWORD_ENV_KEY = 'USER_RESET_DEFAULT_PASSWORD';

const FALLBACK_RESET_PASSWORD = '123456';

export function getDefaultResetPassword(): string {
  const envPassword = process.env[USER_RESET_PASSWORD_ENV_KEY];
  const normalized = typeof envPassword === 'string' ? envPassword.trim() : '';
  return normalized || FALLBACK_RESET_PASSWORD;
}
