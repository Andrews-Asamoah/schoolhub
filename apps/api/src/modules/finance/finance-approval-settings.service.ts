import { ForbiddenException, Injectable } from "@nestjs/common";
import type { FinanceApprovalControl } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { writeAudit, type AuditActor } from "../../common/audit/audit.js";
import {
  FINANCE_APPROVAL_CONTROLS, FINANCE_APPROVAL_CONTROL_LABELS, effectiveSetting,
  loadApprovalSetting, mayApproveStep,
  type ApprovalActor, type ApprovalSettingInput, type EffectiveApprovalSetting,
} from "./finance-approval-settings.js";

export interface ApprovalSettingView extends EffectiveApprovalSetting {
  label: string;
  updatedAt: string | null;
}

/** Admin-portal configuration of who must approve finance work (owner and admin only). */
@Injectable()
export class FinanceApprovalSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string): Promise<ApprovalSettingView[]> {
    const rows = await this.prisma.client.financeApprovalSetting.findMany({ where: { schoolId } });
    const byControl = new Map(rows.map(row => [row.control, row]));
    return FINANCE_APPROVAL_CONTROLS.map(control => {
      const row = byControl.get(control);
      return {
        ...effectiveSetting(control, row),
        label: FINANCE_APPROVAL_CONTROL_LABELS[control],
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  /** Throws unless this actor may complete an approval step that is its own call. */
  async assertMayApprove(schoolId: string, control: FinanceApprovalControl, actor: ApprovalActor, action: string) {
    const setting = await loadApprovalSetting(this.prisma.client, schoolId, control);
    if (!mayApproveStep(setting, actor)) {
      throw new ForbiddenException(`Only the approver chosen by the school can ${action}.`);
    }
    return setting;
  }

  /**
   * RolesGuard treats a headteacher as also being an "admin", and a headteacher may be one of the
   * approvers, so the role is checked here as well: only an owner or an admin may change who approves.
   */
  async update(
    schoolId: string, actor: AuditActor, role: string | undefined, isSuperAdmin: boolean,
    control: FinanceApprovalControl, input: ApprovalSettingInput,
  ): Promise<ApprovalSettingView> {
    if (!isSuperAdmin && role !== "owner" && role !== "admin") {
      throw new ForbiddenException("Only the school owner or an administrator can change who approves finance work.");
    }
    const roles = input.required ? [...new Set(input.approverRoles)].sort() : [];
    await this.prisma.client.$transaction(async tx => {
      const before = await tx.financeApprovalSetting.findUnique({ where: { schoolId_control: { schoolId, control } } });
      await tx.financeApprovalSetting.upsert({
        where: { schoolId_control: { schoolId, control } },
        create: { schoolId, control, required: input.required, approverRoles: roles, updatedById: actor.id },
        update: { required: input.required, approverRoles: roles, updatedById: actor.id },
      });
      await writeAudit(tx, actor, {
        action: "UPDATE", entityType: "finance.approval-setting.update", entityId: control, schoolId,
        oldValues: before ? { required: before.required, approverRoles: before.approverRoles } : { required: false, approverRoles: [], configured: false },
        newValues: { required: input.required, approverRoles: roles },
      });
    });
    const all = await this.list(schoolId);
    return all.find(item => item.control === control)!;
  }
}
