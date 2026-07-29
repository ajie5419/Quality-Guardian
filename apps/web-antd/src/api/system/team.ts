import { requestClient } from '#/api/request';

export interface TeamIdentity {
  id: string;
  name: string;
  remark: null | string;
  sort: number;
  status: number;
}

export const createTeamIdentity = (data: {
  name: string;
  remark?: null | string;
  sort?: number;
}) => requestClient.post<TeamIdentity>('/system/team', data);

export const updateTeamIdentity = (
  id: string,
  data: { name?: string; remark?: null | string; sort?: number },
) => requestClient.put<TeamIdentity>(`/system/team/${id}`, data);

export const retireTeamIdentity = (id: string) =>
  requestClient.delete(`/system/team/${id}`);
