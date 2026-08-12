-- Scalar lists cannot use the previous registration-request-to-unit foreign key.
ALTER TABLE "registration_requests" DROP CONSTRAINT "registration_requests_unit_id_fkey";

-- Preserve every existing registration request's unit and login type as a one-item list.
ALTER TABLE "registration_requests"
  ALTER COLUMN "unit_id" TYPE TEXT[] USING ARRAY["unit_id"],
  ALTER COLUMN "unit_id" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "register_type" DROP DEFAULT,
  ALTER COLUMN "register_type" TYPE "RegisterType"[] USING ARRAY["register_type"],
  ALTER COLUMN "register_type" SET DEFAULT ARRAY['SSO']::"RegisterType"[];

-- Allow an account to support SSO, password login, or both.
ALTER TABLE "users"
  ALTER COLUMN "register_type" DROP DEFAULT,
  ALTER COLUMN "register_type" TYPE "RegisterType"[] USING ARRAY["register_type"],
  ALTER COLUMN "register_type" SET DEFAULT ARRAY['STANDARD']::"RegisterType"[];
