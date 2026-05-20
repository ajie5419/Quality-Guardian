import type { UploadFile, UploadProps } from 'ant-design-vue';

import {
  completeDirectUpload,
  createDirectUploadPolicy,
} from '#/api/qms/file-center';

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

function toUploadSuccessPayload(
  data: QmsUploadResponseData,
): QmsUploadResponse {
  return {
    code: 0,
    data,
  };
}

function buildFormDataRequest(
  options: Parameters<NonNullable<UploadProps['customRequest']>>[0],
  file: File,
  action: string,
) {
  return new Promise<QmsUploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', action, true);
    if (options.withCredentials) {
      xhr.withCredentials = true;
    }
    const headers = options.headers || {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string' && value) {
        xhr.setRequestHeader(key, value);
      }
    }

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || !options.onProgress) return;
      options.onProgress({ percent: (event.loaded / event.total) * 100 });
    });

    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`upload failed with status ${xhr.status}`));
        return;
      }

      try {
        const response = JSON.parse(
          xhr.responseText || '{}',
        ) as QmsUploadResponse;
        resolve(response);
      } catch (error) {
        reject(error);
      }
    });

    xhr.addEventListener('error', () =>
      reject(new Error('network error while uploading')),
    );

    const formData = new FormData();
    formData.append(String(options.filename || 'file'), file);
    const extraData = options.data || {};
    for (const [key, value] of Object.entries(extraData)) {
      if (value === undefined || value === null) continue;
      formData.append(key, String(value));
    }
    xhr.send(formData);
  });
}

function resolveUploadFile(
  rawFile: Parameters<NonNullable<UploadProps['customRequest']>>[0]['file'],
) {
  if (rawFile instanceof File) return rawFile;
  throw new Error('invalid upload file');
}

async function fallbackUpload(
  options: Parameters<NonNullable<UploadProps['customRequest']>>[0],
  file: File,
  action: string,
) {
  const response = await buildFormDataRequest(options, file, action);
  return response;
}

async function directOssUpload(
  options: Parameters<NonNullable<UploadProps['customRequest']>>[0],
  file: File,
) {
  const policy = await createDirectUploadPolicy({
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(policy.uploadMethod, policy.uploadUrl, true);
    xhr.setRequestHeader('Content-Type', policy.mimeType);

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || !options.onProgress) return;
      options.onProgress({ percent: (event.loaded / event.total) * 100 });
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`direct upload failed with status ${xhr.status}`));
    });

    xhr.addEventListener('error', () =>
      reject(new Error('network error while direct uploading')),
    );

    xhr.send(file);
  });

  const completed = await completeDirectUpload({
    ticket: policy.ticket,
  });
  let normalizedSize: number | undefined;
  if (typeof completed.size === 'number' && completed.size > 0) {
    normalizedSize = completed.size;
  } else if (file.size > 0) {
    normalizedSize = file.size;
  }

  return toUploadSuccessPayload({
    fileId: completed.fileId,
    originalName: completed.originalName || file.name,
    size: normalizedSize,
    thumbUrl: completed.thumbUrl || undefined,
    type: completed.type || (file.type.length > 0 ? file.type : undefined),
    url: completed.url || '',
  });
}

/**
 * Unified uploader for QMS screens.
 * Prefer direct OSS upload when available; fallback to legacy `/api/upload`.
 */
export function createQmsUploadRequest(options?: {
  fallbackAction?: string;
}): UploadProps['customRequest'] {
  const fallbackAction = options?.fallbackAction || '/api/upload';

  return async (request) => {
    let target: File;
    try {
      target = resolveUploadFile(request.file);
    } catch {
      request.onError?.(new Error('invalid upload file'));
      return;
    }

    try {
      const response = await directOssUpload(request, target);
      request.onSuccess?.(response as any);
    } catch {
      try {
        const response = await fallbackUpload(
          request,
          target,
          request.action || fallbackAction,
        );
        request.onSuccess?.(response as any);
      } catch (error) {
        request.onError?.(error as Error);
      }
    }
  };
}
