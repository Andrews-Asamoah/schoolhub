CREATE TYPE "PlatformSchoolRole" AS ENUM ('SUPPORT', 'DESKTOP_ACCESS');

CREATE TABLE "platform_school_grants" (
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "role" "PlatformSchoolRole" NOT NULL,
    CONSTRAINT "platform_school_grants_pkey" PRIMARY KEY ("userId", "schoolId"),
    CONSTRAINT "platform_school_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "platform_school_grants_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "platform_school_grants_schoolId_idx" ON "platform_school_grants"("schoolId");
