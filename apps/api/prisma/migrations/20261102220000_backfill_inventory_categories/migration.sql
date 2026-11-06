UPDATE "inventory_categories"
SET "name" = btrim("name")
WHERE "name" <> btrim("name");

DELETE FROM "inventory_categories" AS duplicate
USING "inventory_categories" AS retained
WHERE duplicate."schoolId" = retained."schoolId"
  AND lower(duplicate."name") = lower(retained."name")
  AND duplicate."id" > retained."id";

UPDATE "inventory_items"
SET "category" = btrim("category")
WHERE "category" IS NOT NULL AND "category" <> btrim("category");

INSERT INTO "inventory_categories" ("id", "schoolId", "name", "createdAt", "updatedAt")
SELECT DISTINCT ON (item."schoolId", lower(btrim(item."category")))
    'legacy-inventory-category-' || md5(item."schoolId" || ':' || lower(btrim(item."category"))),
    item."schoolId",
    btrim(item."category"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "inventory_items" AS item
WHERE item."category" IS NOT NULL AND btrim(item."category") <> ''
ORDER BY item."schoolId", lower(btrim(item."category")), btrim(item."category")
ON CONFLICT DO NOTHING;

UPDATE "inventory_items" AS item
SET "category" = category."name"
FROM "inventory_categories" AS category
WHERE item."schoolId" = category."schoolId"
  AND lower(item."category") = lower(category."name");

CREATE UNIQUE INDEX "inventory_categories_schoolId_lower_name_key"
ON "inventory_categories" ("schoolId", lower("name"));
