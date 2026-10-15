-- DropForeignKey
ALTER TABLE "classes" DROP CONSTRAINT "classes_academicYearId_fkey";

-- AlterTable
ALTER TABLE "classes" ALTER COLUMN "academicYearId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
