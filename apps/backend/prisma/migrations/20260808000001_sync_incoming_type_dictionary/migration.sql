-- Sync the incoming-type dictionary with the renamed machined process.
-- The process "机加成品件" was renamed to "机加成品件-外协" in the process
-- master. Incoming inspection records display the dictionary value resolved by
-- incomingTypeId (master-data-fields.ts), so the dictionary entry must follow
-- the rename for legacy records to show the current process name.
-- Guarded: only runs when the renamed process exists, the legacy dictionary
-- entry still exists, and the target name is not already taken.
UPDATE `dictionaries` d
JOIN `processes` p ON p.`name` = '机加成品件-外协' AND p.`isDeleted` = 0
LEFT JOIN `dictionaries` x
  ON x.`dictType` = 'incoming_type'
  AND x.`isDeleted` = 0
  AND (x.`dictKey` = '机加成品件-外协' OR x.`dictValue` = '机加成品件-外协')
  AND x.`id` <> d.`id`
SET d.`dictKey` = '机加成品件-外协', d.`dictValue` = '机加成品件-外协'
WHERE d.`dictType` = 'incoming_type'
  AND d.`isDeleted` = 0
  AND (d.`dictKey` = '机加成品件' OR d.`dictValue` = '机加成品件')
  AND x.`id` IS NULL;
