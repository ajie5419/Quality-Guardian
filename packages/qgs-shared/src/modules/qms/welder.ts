/**
 * Welder API Types
 */

export interface WelderItem {
  certificationNo?: null | string;
  createdAt?: string;
  employmentStatus?: 'ON_DUTY' | 'RESIGNED';
  examDate?: null | string;
  examPassed: boolean;
  id: string;
  isDeleted?: boolean;
  name: string;
  score: number;
  team: string;
  updatedAt?: string;
  welding_method?: null | string;
}

export interface WelderStats {
  averageScore: number | string;
  certifiedCount: number;
  examPassedCount: number;
  total: number;
  warningCount: number;
}

export interface WelderListParams {
  employmentStatus?: 'ON_DUTY' | 'RESIGNED';
  keyword?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  team?: string;
  welderCode?: string;
}

export interface WelderListResponse {
  items: WelderItem[];
  stats?: WelderStats;
  total: number;
}
