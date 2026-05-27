import type {
  FileAssetItem,
  FileListParams,
  FilePageResult,
  FileStorageStats,
  ScanMissingResult,
} from '@qgs/shared';

import { requestClient } from '#/api/request';

export type {
  FileAssetItem,
  FileListParams,
  FileReferenceItem,
  FileStorageStats,
} from '@qgs/shared';
export type FileListResponse = FilePageResult;

export function getFileList(params?: FileListParams) {
  return requestClient.get<FilePageResult>('/files', { params });
}

export function getFileStorageStats() {
  return requestClient.get<FileStorageStats>('/files/stats');
}

export function getOrphanFileList(
  params?: Pick<FileListParams, 'page' | 'pageSize'>,
) {
  return requestClient.get<FilePageResult>('/files/orphans', { params });
}

export function getFileDetail(id: string) {
  return requestClient.get<FileAssetItem>(`/files/${id}`);
}

export function deleteFileAsset(id: string) {
  return requestClient.delete(`/files/${id}`);
}

export function scanMissingFiles(data: {
  limit?: number;
  markMissing?: boolean;
}) {
  return requestClient.post<ScanMissingResult>('/files/scan-missing', data);
}
