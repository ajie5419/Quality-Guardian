export {
  assertPartMasterPermission,
  PART_MASTER_EDIT_PERMISSION,
  PART_MASTER_LIST_PERMISSION,
} from './part-master-access';
export {
  partMasterCreateSchema,
  partMasterIdSchema,
  partMasterManagementQuerySchema,
  partMasterRemoteSearchSchema,
  partMasterUpdateSchema,
} from './part-master.schema';
export type {
  PartMasterCreateInput,
  PartMasterManagementQuery,
  PartMasterRemoteSearchInput,
  PartMasterUpdateInput,
} from './part-master.schema';
export { PartMasterService } from './part-master.service';
