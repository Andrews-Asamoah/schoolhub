import { Alert, View } from "react-native";
import type { ReportApproval, ReportData } from "@/api/report-preview";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { Text } from "@/components/Typography";
import { outputTable } from "./exports";
import { spacing, type } from "@/theme/theme";

export function ReportPreview({
  title,
  data,
  approval,
  onShare,
  printable,
}: {
  title: string;
  data?: ReportData | null;
  approval?: ReportApproval | null;
  onShare?: () => void;
  printable?: boolean;
}) {
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text accessibilityRole="header" style={type.headline}>
          {title}
        </Text>
        {data?.summary?.average != null ? (
          <Text>Average: {data.summary.average}%</Text>
        ) : null}
        {data?.summary?.overallPosition != null ? (
          <Text>
            Class position: {data.summary.overallPosition}
            {data.summary.classSize ? ` of ${data.summary.classSize}` : ""}
          </Text>
        ) : null}
        {data?.attendance ? (
          <Text>
            Attendance: {data.attendance.present} of {data.attendance.total}{" "}
            days
          </Text>
        ) : null}
        {data?.subjects?.map((row, index) => (
          <View key={`${row.subject.name}:${index}`}>
            <Text style={type.bodyStrong}>{row.subject.name}</Text>
            <Text>
              {[
                row.percentage == null ? null : `${row.percentage}%`,
                row.grade,
                row.gradeRemark,
              ]
                .filter(Boolean)
                .join(" · ") || "No grade"}
            </Text>
            {row.components?.map((component, componentIndex) => (
              <Text key={`${component.name}:${componentIndex}`}>
                {component.name}: {component.marksObtained}/{component.maxMarks}
              </Text>
            ))}
          </View>
        ))}
        {approval?.teacher?.remark ? (
          <Text>Teacher: {approval.teacher.remark}</Text>
        ) : null}
        {approval?.head?.remark ? (
          <Text>Headteacher: {approval.head.remark}</Text>
        ) : null}
        {!approval
          ? data?.remarks?.map((remark, index) => (
              <Text key={`${remark.type}:${index}`}>
                {remark.teacher ?? remark.type}: {remark.content}
              </Text>
            ))
          : null}
        {!data ? (
          <Text>Report details are unavailable for this record.</Text>
        ) : null}
        {printable && data ? (
          <Button
            label="Print report"
            variant="secondary"
            onPress={() => {
              const rows = (data.subjects ?? []).map((row) => [
                row.subject.name,
                row.percentage == null ? "" : `${row.percentage}%`,
                row.grade ?? "",
                row.gradeRemark ?? "",
              ]);
              if (data.summary?.average != null)
                rows.push(["Average", `${data.summary.average}%`, "", ""]);
              if (data.attendance)
                rows.push([
                  "Attendance",
                  `${data.attendance.present} / ${data.attendance.total}`,
                  "",
                  "",
                ]);
              for (const [role, remark] of [
                ["Teacher", approval?.teacher?.remark],
                ["Headteacher", approval?.head?.remark],
              ]) {
                if (remark) rows.push([role ?? "", "", "", remark]);
              }
              if (!approval)
                for (const remark of data.remarks ?? [])
                  rows.push([
                    remark.teacher ?? remark.type,
                    "",
                    "",
                    remark.content,
                  ]);
              void outputTable(
                title,
                ["Subject", "Score", "Grade", "Remarks"],
                rows,
                "print",
              ).catch(() => Alert.alert("Could not print the report"));
            }}
          />
        ) : null}
        {onShare ? (
          <Button
            label="Share signed PDF"
            variant="secondary"
            onPress={onShare}
          />
        ) : null}
      </View>
    </Card>
  );
}
