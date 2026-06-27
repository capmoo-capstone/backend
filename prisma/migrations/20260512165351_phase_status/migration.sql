/*
  Warnings:

  - You are about to drop the column `contract_status` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `contract_step` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `procurement_status` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `procurement_step` on the `projects` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "projects" DROP COLUMN "contract_status",
DROP COLUMN "contract_step",
DROP COLUMN "procurement_status",
DROP COLUMN "procurement_step",
ADD COLUMN     "contract_phase" "ProjectPhaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "contract_progress" JSONB NOT NULL DEFAULT '{"GENERAL_STAFF":{"status":"NOT_STARTED","step":null},"HEAD_OF_UNIT":{"status":"NOT_STARTED","step":null},"DOCUMENT_STAFF":{"status":"NOT_STARTED","step":null},"other":{"status":"NOT_STARTED","step":null}}',
ADD COLUMN     "procurement_phase" "ProjectPhaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "procurement_progress" JSONB NOT NULL DEFAULT '{"GENERAL_STAFF":{"status":"NOT_STARTED","step":null},"HEAD_OF_UNIT":{"status":"NOT_STARTED","step":null},"DOCUMENT_STAFF":{"status":"NOT_STARTED","step":null},"other":{"status":"NOT_STARTED","step":null}}';
