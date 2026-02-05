import { logRemoteError } from '#/utils/client-logger';

/**
 * 统一错误处理 Hook
 * 用于在 View 层捕获并上报业务异常，同时避免冗余的 UI 提示
 */
export function useErrorHandler() {
    const handleApiError = (error: unknown, context = 'Operation') => {
        // 1. 忽略来自 Form 验证的错误 (通常由组件自身处理)
        if ((error as any)?.errorFields) return;

        // 2. 静默上报远程日志
        logRemoteError(`${context} failed`, {
            error: error instanceof Error ? error.message : String(error),
            response: (error as any)?.response?.data,
            stack: error instanceof Error ? error.stack : undefined,
        });

        // 3. 这里的 console.error 仅用于开发环境本地排查
        if (import.meta.env.DEV) {
            console.error(`[${context}] Error:`, error);
        }

        // 注意：全局拦截器 (request.ts) 已经通过 message.error 或 notification.error 
        // 显示了后端返回的报错信息，由于大部分业务逻辑直接透传后端消息，
        // 此处不需要再次弹出 message.error，除非有特定的本地 fallback 逻辑。
    };

    return {
        handleApiError,
    };
}
