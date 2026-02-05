import type { UploadFile } from 'ant-design-vue';

import type { AfterSalesItem } from '#/api/qms/after-sales';

/**
 * 上传文件（带响应）
 */
export interface UploadFileWithResponse extends Omit<UploadFile, 'response'> {
    response?: {
        code?: number;
        data: {
            url: string;
        };
        message?: string;
    };
}

/**
 * 售后工单表单状态
 */
export interface AfterSalesFormState
    extends Omit<Partial<AfterSalesItem>, 'photos'> {
    photos?: UploadFileWithResponse[];
}
