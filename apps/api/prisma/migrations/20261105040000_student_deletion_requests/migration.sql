-- CreateTable
CREATE TABLE "student_deletion_requests" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "admissionNumber" TEXT,
    "className" TEXT,
    "reason" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionNote" VARCHAR(1000),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_deletion_requests_status_createdAt_idx" ON "student_deletion_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "student_deletion_requests_schoolId_status_idx" ON "student_deletion_requests"("schoolId", "status");

-- CreateIndex
CREATE INDEX "student_deletion_requests_studentId_idx" ON "student_deletion_requests"("studentId");

-- AddForeignKey
ALTER TABLE "student_deletion_requests" ADD CONSTRAINT "student_deletion_requests_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
