-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "contract_progress" SET DEFAULT '{"GENERAL_STAFF":{"status":"NOT_STARTED","step":null},"HEAD_OF_UNIT":{"status":"NOT_STARTED","step":null},"DOCUMENT_STAFF":{"status":"NOT_STARTED","step":null}}',
ALTER COLUMN "procurement_progress" SET DEFAULT '{"GENERAL_STAFF":{"status":"NOT_STARTED","step":null},"HEAD_OF_UNIT":{"status":"NOT_STARTED","step":null},"DOCUMENT_STAFF":{"status":"NOT_STARTED","step":null}}';
