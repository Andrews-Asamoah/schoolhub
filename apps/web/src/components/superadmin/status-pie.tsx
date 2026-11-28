import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface StatusSlice {
  status: string;
  label: string;
  value: number;
  fill: string;
}

export function StatusPie({ data }: { data: StatusSlice[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius="57%" outerRadius="82%" paddingAngle={2} stroke="none">
          {data.map((item) => (
            <Cell key={item.status} fill={item.fill} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", backgroundColor: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }}
          formatter={(value) => [`${Number(value ?? 0).toLocaleString("en-GH")} schools`, "Schools"]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
