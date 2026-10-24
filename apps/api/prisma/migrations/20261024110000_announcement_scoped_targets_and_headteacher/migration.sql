-- Normalize the school leadership role without losing existing memberships,
-- additional roles, invitations or role-based permissions.
UPDATE "members"
SET "role" = 'headteacher'
WHERE "role" = 'headmistress';

UPDATE "members"
SET "roles" = ARRAY(
  SELECT DISTINCT CASE
    WHEN role_name = 'headmistress' THEN 'headteacher'
    ELSE role_name
  END
  FROM unnest("roles") AS roles(role_name)
)
WHERE array_position("roles", 'headmistress') IS NOT NULL;

-- Avoid the unique (organizationId, role) constraint if both role labels
-- already exist for an organization.
DELETE FROM "organization_roles" AS old_role
USING "organization_roles" AS new_role
WHERE old_role."organizationId" = new_role."organizationId"
  AND old_role."role" = 'headmistress'
  AND new_role."role" = 'headteacher';

UPDATE "organization_roles"
SET "role" = 'headteacher'
WHERE "role" = 'headmistress';

UPDATE "invitations"
SET "role" = 'headteacher'
WHERE "role" = 'headmistress';

ALTER TABLE "announcements"
ADD COLUMN "target_class_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
