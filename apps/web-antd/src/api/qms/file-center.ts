import { requestClient } from '#/api/request';

export interface FileReferenceItem {
  bizId: string;
  bizType: string;
  createdAt?: string;
  fieldName: string;
  fileId: string;
  id: string;
  sortOrder: number;
}

export interface FileAssetItem {
  _count?: { references: number };
  bucket?: null | string;
  createdAt?: string;
  deletedAt?: null | string;
  id: string;
  mimeType: string;
  objectKey: string;
  originalName: string;
  references?: FileReferenceItem[];
  sha256: string;
  size: number;
  status: string;
  storageProvider: string;
  thumbObjectKey?: null | string;
  thumbUrl?: null | string;
  updatedAt?: string;
  uploadedBy?: null | string;
  url: string;
}

export interface FileListParams {
  bizId?: string;
  bizType?: string;
  fieldName?: string;
  keyword?: string;
  mimeType?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  storageProvider?: string;
  uploadedBy?: string;
}

export interface FileListResponse {
  items: FileAssetItem[];
  total: number;
}

export interface FileStorageStats {
  activeCount: number;
  activeSize: number;
  byStatus: Array<{ count: number; size: number; status: string }>;
  byStorageProvider: Array<{
    count: number;
    size: number;
    storageProvider: string;
  }>;
  orphanCount: number;
  referencedCount: number;
  totalCount: number;
  totalSize: number;
}

export interface ScanMissingResult {
  checked: number;
  marked: number;
  missingIds: string[];
}

export function getFileList(params?: FileListParams) {
  return requestClient.get<FileListResponse>('/files', { params });
}

export function getFileStorageStats() {
  return requestClient.get<FileStorageStats>('/files/stats');
}

export function getOrphanFileList(
  params?: Pick<FileListParams, 'page' | 'pageSize'>,
) {
  return requestClient.get<FileListResponse>('/files/orphans', { params });
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
