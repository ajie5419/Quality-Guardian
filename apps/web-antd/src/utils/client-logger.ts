import { sendClientLog } from '#/api/system/log';

/**
 * 设置全局错误处理器，捕获未处理的运行时错误和 Promise 拒绝
 */
export function setupClientLogger() {
    if (import.meta.env.DEV) {
        // 开发环境下可选：是否也将错误发送到后端
        // return; 
    }

    window.onerror = (message, source, lineno, colno, error) => {
        sendClientLog({
            type: 'onerror',
            message: String(message),
            source,
            lineno,
            colno,
            stack: error?.stack,
            url: window.location.href,
            userAgent: navigator.userAgent,
        });
    };

    window.onunhandledrejection = (event) => {
        sendClientLog({
            type: 'unhandledrejection',
            message: event.reason?.message || String(event.reason),
            stack: event.reason?.stack,
            url: window.location.href,
            userAgent: navigator.userAgent,
        });
    };
}

/**
 * 手动记录远程错误
 */
export const logRemoteError = (message: string, context?: any) => {
    sendClientLog({
        type: 'manual',
        message,
        ...context,
        url: window.location.href,
        userAgent: navigator.userAgent,
    });
};
