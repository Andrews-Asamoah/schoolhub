-- Additive and default-disabled: no existing school changes attendance policy on upgrade.
ALTER TABLE "schools" ADD COLUMN "attendancePolicyActiveFrom" DATE;
