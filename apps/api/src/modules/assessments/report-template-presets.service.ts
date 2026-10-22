import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";

const STANDARD_TEMPLATES = [
  {
    name: "Modern Indigo",
    description: "A clean, contemporary report with score highlights and a clear academic table.",
    layout: {
      type: "modern",
      accentColor: "#4f46e5",
      showPosition: true,
      showAssessmentBreakdown: true,
      sections: ["student", "academic", "assessment-breakdown", "remarks", "signatures"],
    },
  },
  {
    name: "Classic Academic",
    description: "A formal, print-first layout with a traditional school report presentation.",
    layout: {
      type: "classic",
      accentColor: "#1e3a8a",
      showPosition: true,
      showAssessmentBreakdown: true,
      sections: ["student", "academic", "assessment-breakdown", "remarks", "signatures"],
    },
  },
  {
    name: "Emerald Primary",
    description: "A warm, learner-friendly design inspired by the primary report layouts in SMS.",
    layout: {
      type: "primary",
      accentColor: "#047857",
      showPosition: false,
      showAssessmentBreakdown: false,
      sections: ["student", "academic", "remarks", "signatures"],
    },
  },
  {
    name: "JHS Performance",
    description: "A detailed academic layout for upper primary and JHS, including grade and position columns.",
    layout: {
      type: "jhs",
      accentColor: "#4338ca",
      showPosition: true,
      showAssessmentBreakdown: true,
      sections: ["student", "academic", "assessment-breakdown", "remarks", "signatures"],
    },
  },
] as const;

@Injectable()
export class ReportTemplatePresetsService {
  constructor(private readonly prisma: PrismaService) {}

  async initializeDefaultTemplates(schoolId: string, actorId: string) {
    const db = this.prisma.client;
    const existing = await db.reportCardTemplate.findMany({
      where: { schoolId },
      select: { id: true, name: true, isActive: true },
    });
    const byName = new Map(existing.map((template) => [template.name, template]));
    const missing = STANDARD_TEMPLATES.filter((template) => !byName.has(template.name));
    const inactiveDefaults = STANDARD_TEMPLATES
      .map((template) => byName.get(template.name))
      .filter((template): template is NonNullable<typeof template> => !!template && !template.isActive);

    const createdNames = missing.map((template) => template.name);
    const activatedNames = inactiveDefaults.map((template) => template.name);

    if (!missing.length && !inactiveDefaults.length) {
      return {
        createdCount: 0,
        activatedCount: 0,
        message: "The standard report templates are already installed and active.",
      };
    }

    await db.$transaction(async (tx) => {
      for (const template of missing) {
        await tx.reportCardTemplate.create({
          data: {
            schoolId,
            name: template.name,
            description: template.description,
            layout: template.layout as unknown as Prisma.InputJsonValue,
            isActive: true,
          },
        });
      }

      if (inactiveDefaults.length) {
        await tx.reportCardTemplate.updateMany({
          where: { schoolId, id: { in: inactiveDefaults.map((template) => template.id) } },
          data: { isActive: true },
        });
      }

      await tx.auditLog.create({
        data: {
          schoolId,
          userId: actorId,
          action: "CREATE",
          entityType: "REPORT_CARD_TEMPLATE",
          entityId: "standard-presets",
          newValues: {
            operation: "INITIALIZE_STANDARD_TEMPLATES",
            createdNames,
            activatedNames,
          },
        },
      });
    });

    return {
      createdCount: createdNames.length,
      activatedCount: activatedNames.length,
      message: [
        createdNames.length ? `Added ${createdNames.length} standard template(s).` : "",
        activatedNames.length ? `Reactivated ${activatedNames.length} standard template(s).` : "",
      ].filter(Boolean).join(" "),
    };
  }

  async activateTemplate(schoolId: string, actorId: string, templateId: string) {
    const db = this.prisma.client;
    const template = await db.reportCardTemplate.findFirst({
      where: { id: templateId, schoolId },
      select: { id: true, name: true, isActive: true },
    });
    if (!template) throw new NotFoundException("Report template not found.");

    if (!template.isActive) {
      await db.$transaction([
        db.reportCardTemplate.update({ where: { id: template.id }, data: { isActive: true } }),
        db.auditLog.create({
          data: {
            schoolId,
            userId: actorId,
            action: "UPDATE",
            entityType: "REPORT_CARD_TEMPLATE",
            entityId: template.id,
            newValues: { operation: "ACTIVATE", name: template.name },
          },
        }),
      ]);
    }

    return { id: template.id, name: template.name, isActive: true };
  }
}
