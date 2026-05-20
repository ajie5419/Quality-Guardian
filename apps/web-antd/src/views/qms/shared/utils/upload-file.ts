import type { UploadFile } from 'ant-design-vue';

export interface QmsUploadResponseData {
  fileId?: string;
  originalName?: string;
  size?: number;
  thumbUrl?: string;
  type?: string;
  url?: string;
}

export interface QmsUploadResponse {
  code?: number;
  data?: QmsUploadResponseData;
}

export function getUploadResponse(file: { response?: unknown }) {
  return file.response as QmsUploadResponse | undefined;
}

export function applyUploadResponse(file: UploadFile) {
  const response = getUploadResponse(file);
  if (response?.code !== 0 || !response.data?.url) return false;

  file.url = response.data.url;
  if (response.data.thumbUrl) {
    file.thumbUrl = response.data.thumbUrl;
  }
  return true;
}

export function getFileExtension(fileName: string) {
  const suffix = fileName.split('.').pop();
  return suffix ? suffix.toLowerCase() : '';
}

export function normalizeUploadFile(file: UploadFile, fallbackName: string) {
  const response = getUploadResponse(file);
  const data = response?.data;
  const url = String(file.url || data?.url || '').trim();
  if (!url) return null;

  const name = String(file.name || data?.originalName || fallbackName).trim();
  return {
    fileId: data?.fileId,
    name,
    size: Number(file.size ?? data?.size ?? 0),
    thumbUrl: file.thumbUrl || data?.thumbUrl,
    type: data?.type || getFileExtension(name),
    url,
  };
}

export function normalizeUploadFileList<
  T = ReturnType<typeof normalizeUploadFile>,
>(files: UploadFile[], fallbackName: string) {
  return files
    .map((file) => normalizeUploadFile(file, fallbackName))
    .filter(Boolean) as T[];
}
