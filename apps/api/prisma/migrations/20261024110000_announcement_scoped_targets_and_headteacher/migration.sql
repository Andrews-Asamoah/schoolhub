-- Normalize the school leadership role without losing existing memberships,
-- additional roles, invitations or role-based permissions.
UPDATE "members"
SET "role" = 'headteacher'
WHERE "role" = 'headmistress';

UPDATE "members"
SET "roles" = array_replace("roles", 'headmistress', 'headteacher')
WHERE array_position("roles", 'headmistress') IS NOT NULL;

UPDATE "organization_roles"
SET "role" = 'headteacher'
WHERE "role" = 'headmistress';

UPDATE "invitations"
SET "role" = 'headteacher'
WHERE "role" = 'headmistress';

ALTER TABLE "announcements"
ADD COLUMN "target_class_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
