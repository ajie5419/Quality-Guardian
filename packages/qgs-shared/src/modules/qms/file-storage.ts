export interface FileReferenceItem {
  bizId: string;
  bizType: string;
  createdAt?: Date | string;
  fieldName: string;
  fileId: string;
  id: string;
  sortOrder: number;
}

export interface FileAssetItem {
  _count?: { references: number };
  bucket?: null | string;
  createdAt?: Date | string;
  deletedAt?: Date | null | string;
  id: string;
  legacyUrl?: string;
  mimeType: string;
  objectKey: string;
  originalName: string;
  references?: FileReferenceItem[];
  sha256: string;
  size: number;
  status: string;
  storageProvider: string;
  storedName: string;
  thumbFilename?: null | string;
  thumbObjectKey?: null | string;
  thumbUrl?: null | string;
  updatedAt?: Date | string;
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

export interface FilePageResult {
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

export interface UploadFileResult extends FileAssetItem {
  legacyUrl: string;
  thumbFilename: null | string;
  thumbUrl: string;
}
