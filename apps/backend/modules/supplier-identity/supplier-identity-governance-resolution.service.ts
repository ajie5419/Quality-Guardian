import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { BusinessError } from '~/utils/business-error';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import prisma from '~/utils/prisma';

import { MasterDataResolutionAuditService } from './master-data-resolution-audit.service';
import { SupplierIdentityService } from './supplier-identity.service';

export const SupplierIdentityGovernanceResolutionService = {
  async resolve(params: { auditId: string; note: string; supplierId: string }) {
    return prisma.$transaction(async (tx) => {
      const audit = await MasterDataResolutionAuditService.get(
        params.auditId,
        tx,
      );
      if (!audit) {
        throw new BusinessError(
          'MASTER_DATA_REFERENCE_NOT_FOUND',
          'Unresolved reference not found',
          404,
        );
      }
      if (
        audit.status !== 'OPEN' ||
        audit.entityType !== 'supplier_identity_links' ||
        audit.fieldName !== 'supplierId'
      ) {
        throw new BusinessError(
          'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
          'The unresolved supplier identity reference is not supported',
          400,
        );
      }
      const names = await MasterDataGovernanceKernel.resolveCanonicalNamesByIds(
        {
          canonicalIds: [params.supplierId],
          configKey: 'supplierName',
        },
      );
      if (!names.has(params.supplierId)) {
        throw new BusinessError(
          'INVALID_SUPPLIER_ID',
          'Active supplier does not exist',
          404,
        );
      }
      await SupplierIdentityService.lockTeamForMutation(audit.entityId, tx);
      const current = await tx.supplier_identity_links.findUnique({
        where: {
          identityType_identityId: {
            identityId: audit.entityId,
            identityType: 'TEAM',
          },
        },
      });
      const matchesAudit = current
        ? current.supplierId === audit.rawId &&
          current.identityNameSnapshot === audit.rawName
        : audit.rawId === null;
      if (!matchesAudit) {
        throw new BusinessError(
          'MASTER_DATA_REFERENCE_CHANGED',
          'Supplier identity link changed after the audit was created',
          409,
        );
      }
      const team = await tx.dictionaries.findFirst({
        where: {
          dictType: 'team',
          id: audit.entityId,
          isDeleted: false,
          status: 1,
        },
        select: { dictKey: true, id: true },
      });
      if (!team) {
        throw new BusinessError(
          'INVALID_TEAM_ID',
          'Active TEAM does not exist',
          404,
        );
      }
      const link = current
        ? await tx.supplier_identity_links.update({
            where: { id: current.id },
            data: {
              identityNameSnapshot: team.dictKey,
              isDeleted: false,
              supplierId: params.supplierId,
            },
          })
        : await tx.supplier_identity_links.create({
            data: {
              identityId: team.id,
              identityNameSnapshot: team.dictKey,
              identityType: 'TEAM',
              supplierId: params.supplierId,
            },
          });
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [current?.supplierId, params.supplierId],
        'supplier-identity.governance-resolved',
      );
      await MasterDataResolutionAuditService.resolve(
        {
          id: audit.id,
          note: params.note || 'Resolved from master data governance',
          resolvedId: params.supplierId,
        },
        tx,
      );
      return { affectedCount: 1, link, resolvedAuditCount: 1 };
    });
  },
};
