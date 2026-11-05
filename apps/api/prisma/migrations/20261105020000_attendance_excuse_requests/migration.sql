-- CreateTable
CREATE TABLE "attendance_excuse_requests" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionNote" VARCHAR(1000),
    "attachmentKey" TEXT,
    "attachmentMime" TEXT,
    "attachmentSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_excuse_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_schoolId_status_createdAt_idx" ON "attendance_excuse_requests"("schoolId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_guardianId_createdAt_idx" ON "attendance_excuse_requests"("guardianId", "createdAt");

-- CreateIndex
CREATE INDEX "attendance_excuse_requests_studentId_fromDate_toDate_idx" ON "attendance_excuse_requests"("studentId", "fromDate", "toDate");

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep review transitions and dates valid even for non-Prisma writers.
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_dates_check" CHECK ("fromDate" <= "toDate" AND "toDate" - "fromDate" <= 30);
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_status_check" CHECK (status IN ('PENDING','APPROVED','REJECTED'));
ALTER TABLE "attendance_excuse_requests" ADD CONSTRAINT "attendance_excuse_decision_check" CHECK ((status='PENDING' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL) OR (status IN ('APPROVED','REJECTED') AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "decisionNote" IS NOT NULL));
