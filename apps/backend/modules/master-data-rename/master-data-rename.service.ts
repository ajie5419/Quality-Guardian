import type {
  MasterDataOrphanItem,
  MasterDataRenameResult,
} from '~/core/master-data/governance-kernel';

import { MasterDataGovernanceKernel } from '~/core/master-data/governance-kernel';

export interface RenameRequest {
  configKey: string;
  dryRun?: boolean;
  newValue: string;
  oldValue: string;
}

export type RenameResult = MasterDataRenameResult;

export { type MasterDataOrphanItem };

export const MasterDataRenameService = {
  isConfigKey(configKey: string) {
    return MasterDataGovernanceKernel.isConfigKey(configKey);
  },

  async rename(request: RenameRequest): Promise<RenameResult[]> {
    return MasterDataGovernanceKernel.rename(request);
  },

  async audit(): Promise<MasterDataOrphanItem[]> {
    return MasterDataGovernanceKernel.auditOrphans();
  },
};
