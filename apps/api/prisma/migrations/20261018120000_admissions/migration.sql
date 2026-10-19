-- CreateEnum
CREATE TYPE "AdmissionCycleStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'EXAM_SCHEDULED', 'EXAM_COMPLETED', 'ACCEPTED', 'WAITLISTED', 'REJECTED', 'ADMITTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "admission_cycles" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "termId" TEXT,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "status" "AdmissionCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "examMaxScore" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "passMark" DECIMAL(6,2) NOT NULL DEFAULT 50,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_cycle_classes" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "seats" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_cycle_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "cycleClassId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "applicationNumber" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "otherNames" TEXT,
    "gender" "Gender" NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "nationality" TEXT NOT NULL DEFAULT 'Ghanaian',
    "previousSchool" TEXT,
    "previousClass" TEXT,
    "residentialAddress" TEXT,
    "city" TEXT,
    "region" TEXT,
    "guardianFirstName" TEXT NOT NULL,
    "guardianLastName" TEXT NOT NULL,
    "guardianPhone" TEXT NOT NULL,
    "guardianEmail" TEXT,
    "guardianRelationship" TEXT NOT NULL,
    "examDate" TIMESTAMP(3),
    "examVenue" TEXT,
    "examScore" DECIMAL(6,2),
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "studentId" TEXT,
    "admittedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admission_cycles_schoolId_status_idx" ON "admission_cycles"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "admission_cycles_schoolId_name_key" ON "admission_cycles"("schoolId", "name");

-- CreateIndex
CREATE INDEX "admission_cycle_classes_classId_idx" ON "admission_cycle_classes"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "admission_cycle_classes_cycleId_classId_key" ON "admission_cycle_classes"("cycleId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "applications_studentId_key" ON "applications"("studentId");

-- CreateIndex
CREATE INDEX "applications_cycleId_status_idx" ON "applications"("cycleId", "status");

-- CreateIndex
CREATE INDEX "applications_schoolId_status_idx" ON "applications"("schoolId", "status");

-- CreateIndex
CREATE INDEX "applications_cycleClassId_idx" ON "applications"("cycleClassId");

-- CreateIndex
CREATE INDEX "applications_classId_idx" ON "applications"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "applications_schoolId_applicationNumber_key" ON "applications"("schoolId", "applicationNumber");

-- AddForeignKey
ALTER TABLE "admission_cycles" ADD CONSTRAINT "admission_cycles_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_cycles" ADD CONSTRAINT "admission_cycles_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_cycles" ADD CONSTRAINT "admission_cycles_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_cycle_classes" ADD CONSTRAINT "admission_cycle_classes_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "admission_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_cycle_classes" ADD CONSTRAINT "admission_cycle_classes_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "admission_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_cycleClassId_fkey" FOREIGN KEY ("cycleClassId") REFERENCES "admission_cycle_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
