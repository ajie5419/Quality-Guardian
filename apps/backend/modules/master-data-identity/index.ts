export { IdentityProjectionService } from './identity-projection.service';
export { IdentityReconciliationService } from './identity-reconciliation.service';
export {
  getCanonicalIdentityState,
  getIdentityRegistryEntry,
  getOnlineResolutionDescriptor,
} from './identity-registry';
export type { OnlineResolutionDescriptor } from './identity-registry';
export {
  createIdentitySourceFingerprint,
  HistoricalIdentityResolutionService,
} from './identity-resolution.service';
export type {
  IdentityDecisionSource,
  IdentityResolutionState,
} from './identity-resolution.service';
