-- Drop the manually-maintained qualityLoss column. The value is now
-- computed in the service layer from materialCost + laborTravelCost
-- whenever a row is rendered, so there is no longer a denormalized
-- column to drift out of sync with its inputs.

ALTER TABLE `after_sales` DROP COLUMN `qualityLoss`;
