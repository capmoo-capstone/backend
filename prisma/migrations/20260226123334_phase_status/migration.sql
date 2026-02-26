-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "contract_phase_status" "ProjectPhaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "contract_step" INTEGER,
ADD COLUMN     "procurement_phase_status" "ProjectPhaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "procurement_step" INTEGER;
