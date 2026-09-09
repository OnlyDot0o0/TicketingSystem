-- Self-service TOTP 2FA was removed as a feature (not needed for this
-- deployment's threat model) — drops the two columns that backed it.
-- No data migration needed: totpSecret was always NULL unless a user had
-- actively enrolled, and totpEnabled is a plain boolean flag with no
-- downstream data depending on its historical value.
ALTER TABLE "User" DROP COLUMN "totpSecret";
ALTER TABLE "User" DROP COLUMN "totpEnabled";
