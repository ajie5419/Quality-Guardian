import { requestClient } from '#/api/request';

export interface DictionaryItem {
  id: string;
  dictType: string;
  dictKey: string;
  dictValue: string;
  sort: number;
  status: number;
  remark?: null | string;
  isSystem: boolean;
  createdBy?: null | string;
  updatedBy?: null | string;
  createdAt: string;
  updatedAt: string;
}

export interface DictionaryListParams {
  page?: number;
  pageSize?: number;
  dictType?: string;
  keyword?: string;
  status?: number;
}

export interface DictionaryOptionItem {
  id: string;
  dictKey: string;
  dictValue: string;
  sort: number;
}

export const getDictionaryTypes = () => {
  return requestClient.get<string[]>('/system/dictionary/types');
};

export const getDictionaryList = (params: DictionaryListParams = {}) => {
  return requestClient.get<{ items: DictionaryItem[]; total: number }>(
    '/system/dictionary/list',
    {
      params,
    },
  );
};

export const getDictionaryOptions = (dictType: string) => {
  return requestClient.get<DictionaryOptionItem[]>(
    '/system/dictionary/options',
    {
      params: { dictType },
    },
  );
};

export const createDictionary = (
  data: Partial<DictionaryItem> & Record<string, unknown>,
) => {
  return requestClient.post('/system/dictionary', data);
};

export const updateDictionary = (
  id: string,
  data: Partial<DictionaryItem> & Record<string, unknown>,
) => {
  return requestClient.put(`/system/dictionary/${id}`, data);
};

export const deleteDictionary = (id: string) => {
  return requestClient.delete(`/system/dictionary/${id}`);
};
