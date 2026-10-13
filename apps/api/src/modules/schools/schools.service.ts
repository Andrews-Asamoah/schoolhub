import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { CreateAcademicYearInput } from "@schoolhub/shared";

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentSchool(schoolId: string) {
    const school = await this.prisma.client.school.findUnique({
      where: { id: schoolId },
      include: {
        academicYears: {
          orderBy: { startDate: "desc" },
          take: 5,
          include: { terms: { orderBy: { termNumber: "asc" } } },
        },
      },
    });

    if (!school) {
      throw new NotFoundException("School not found");
    }

    return school;
  }

  async updateSchool(
    schoolId: string,
    data: {
      name?: string;
      email?: string;
      phone?: string;
      address?: string;
      motto?: string;
      website?: string;
      primaryColor?: string;
      secondaryColor?: string;
    },
  ) {
    return this.prisma.client.school.update({
      where: { id: schoolId },
      data,
    });
  }

  async getAcademicYears(schoolId: string) {
    return this.prisma.client.academicYear.findMany({
      where: { schoolId },
      orderBy: { startDate: "desc" },
      include: { terms: { orderBy: { termNumber: "asc" } } },
    });
  }

  async createAcademicYear(schoolId: string, input: CreateAcademicYearInput) {
    return this.prisma.client.academicYear.create({
      data: {
        schoolId,
        name: input.name,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        isCurrent: input.isCurrent,
      },
    });
  }
}
