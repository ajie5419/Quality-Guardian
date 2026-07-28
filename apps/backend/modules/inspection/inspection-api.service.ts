import type { UserSession } from '~/utils/jwt-utils';

import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';

import { InspectionIssueMutationService } from './inspection-issue-mutation.service';
import { InspectionPublicQueryService } from './inspection-public-query.service';
import { InspectionRequestCreateService } from './inspection-request-create.service';
import { InspectionRequestDeleteService } from './inspection-request-delete.service';
import { InspectionRequestDispatchService } from './inspection-request-dispatch.service';
import { InspectionRequestQueryService } from './inspection-request-query.service';

type RequestBody = Record<string, unknown>;

export const InspectionApiService = {
  async getRequestList(userinfo: UserSession, query: Record<string, unknown>) {
    return InspectionRequestQueryService.getRequestList(userinfo, query);
  },
  async createRequest(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    userinfo: null | UserSession,
    body: RequestBody,
    isPublic = false,
  ) {
    return InspectionRequestCreateService.createRequest(
      event,
      userinfo,
      body,
      isPublic,
      'V2',
    );
  },
  async dispatchRequest(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    id: string,
    body: RequestBody,
    userinfo: UserSession,
  ) {
    return InspectionRequestDispatchService.dispatchRequest(
      event,
      id,
      body,
      userinfo,
    );
  },
  async deleteRequest(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    id: string,
    userinfo: UserSession,
  ) {
    return InspectionRequestDeleteService.deleteRequest(event, id, userinfo);
  },
  async createIssue(userinfo: UserSession, body: RequestBody) {
    return InspectionIssueMutationService.createIssue(userinfo, body);
  },
  async updateIssue(
    userinfo: UserSession,
    id: string,
    body: RequestBody,
    existingNcNumber: null | string,
  ) {
    return InspectionIssueMutationService.updateIssue(
      userinfo,
      id,
      body,
      existingNcNumber,
    );
  },
  async batchDeleteIssues(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    userinfo: UserSession,
    ids: string[],
  ) {
    return InspectionIssueMutationService.batchDeleteIssues(
      event,
      userinfo,
      ids,
    );
  },
  async importIssues(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    userinfo: UserSession,
    items: Array<Record<string, unknown>>,
  ) {
    return InspectionIssueMutationService.importIssues(event, userinfo, items);
  },
  async getPublicProcesses(workOrderNumber: string) {
    return InspectionPublicQueryService.getPublicProcesses(workOrderNumber);
  },
  async getPublicTeams(keyword: string) {
    return InspectionPublicQueryService.getPublicTeams(keyword);
  },
  async getPublicWorkOrders(query: Record<string, unknown>) {
    return InspectionPublicQueryService.getPublicWorkOrders(query);
  },
};
