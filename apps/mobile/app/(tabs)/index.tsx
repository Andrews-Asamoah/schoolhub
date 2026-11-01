import { useState } from "react";
import { router } from "expo-router";
import { ArrowUpRight, Bell, BookOpen, CalendarCheck, CalendarDays, GraduationCap, Users, Wallet } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { GlassCard } from "@/components/GlassCard";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { StatTile } from "@/components/StatTile";
import { TAB_BAR_CLEARANCE } from "@/components/GlassTabBar";
import { fonts, radius, spacing, type, useTheme, withAlpha } from "@/theme/theme";

type Role = "Admin" | "Teacher" | "Parent" | "Student" | "Accountant";
const roles = [{ value: "Admin", label: "Admin" }, { value: "Teacher", label: "Teacher" }, { value: "Parent", label: "Parent" }, { value: "Student", label: "Student" }, { value: "Accountant", label: "Finance" }] as const;
const dashboards: Record<Role, { greeting: string; intro: string; stats: [string,string,string,string][]; activity: [string,string,string][] }> = {
  Admin: { greeting: "Good morning, Andrews", intro: "Here’s what’s happening across your school today.", stats: [["Students","1,248","+24 this term","people"],["Attendance","96.8%","Today’s average","attendance"],["Fee collection","82%","Term progress","fees"],["Teaching staff","64","Across 18 classes","book"]], activity: [["Attendance review","3 classes have not submitted registers","Action needed"],["Staff meeting","Conference room · 2:30 PM","Upcoming"],["Term assessments","Score submission closes Friday","Reminder"]] },
  Teacher: { greeting: "Good morning, Andrews", intro: "Your teaching day, organised in one place.", stats: [["My classes","6","Across 3 year groups","people"],["Attendance","94%","Today’s registers","attendance"],["Assessments","4","Need your attention","book"],["Next lesson","10:30","Integrated Science","fees"]], activity: [["Integrated Science · JHS 2A","Science Lab · 10:30 AM","Next class"],["Submit Mathematics scores","JHS 1B · Due Friday","To do"],["Staff announcement","Updated observation schedule","New"]] },
  Parent: { greeting: "Welcome back", intro: "A quick look at your child’s school life.", stats: [["Attendance","97%","This term","attendance"],["Average score","84.5%","Latest assessment","book"],["Fees balance","GH₵ 450","Outstanding","fees"],["Assignments","2","Due this week","people"]], activity: [["Mathematics assessment","New score published · 88%","New result"],["School fees statement","Updated for the current term","Finance"],["Parent–teacher meeting","Thursday · 9:00 AM","Upcoming"]] },
  Student: { greeting: "Hello, Kofi", intro: "Stay on top of your classes and learning.", stats: [["Attendance","98%","This term","attendance"],["Average score","81.2%","Current term","book"],["Assignments","3","To complete","people"],["Next lesson","10:30","Integrated Science","fees"]], activity: [["Integrated Science","Science Lab · 10:30 AM","Next lesson"],["English assignment","Submit by Thursday","Due soon"],["Mathematics result","Your latest score is available","New result"]] },
  Accountant: { greeting: "Good morning, Andrews", intro: "A clear view of your school’s finances.", stats: [["Collected","GH₵ 86.4k","This term","fees"],["Outstanding","GH₵ 18.2k","126 accounts","people"],["Transactions","48","Today","attendance"],["Reconciliation","92%","This month","book"]], activity: [["Fee payments received","12 payments recorded today","Received"],["Outstanding accounts","18 accounts need follow-up","Review"],["Daily collection report","Ready for review","Report"]] },
};
export default function HomeScreen() {
  const [role,setRole] = useState<Role>("Teacher");
  const { colors, accent } = useTheme();
  const data = dashboards[role];
  return (
    <Screen title="Home" subtitle="Your school, at a glance" bottomInset={TAB_BAR_CLEARANCE} right={<Pressable onPress={() => router.push("/(tabs)/notifications")} accessibilityLabel="Notifications" style={{ width:42,height:42,borderRadius:21,alignItems:"center",justifyContent:"center",backgroundColor:withAlpha(accent,.12) }}><Bell size={20} color={accent}/><View style={{ position:"absolute",right:9,top:8,width:8,height:8,borderRadius:4,backgroundColor:colors.destructive }}/></Pressable>}>
      <View style={{ flexDirection:"row",alignItems:"center",gap:12,marginBottom:20 }}><Avatar name="Andrews Asamoah" size={48}/><View style={{ flex:1 }}><Text style={[type.headline,{color:colors.foreground}]}>{data.greeting}</Text><Text style={[type.caption,{color:colors.mutedForeground}]}>Wesley International School</Text></View><GraduationCap color={accent} size={23}/></View>
      <GlassCard padding={12} style={{ marginBottom:20 }}><Text style={[type.overline,{color:colors.mutedForeground,marginBottom:8}]}>PREVIEW ROLE</Text><SegmentedControl<Role> accessibilityLabel="Choose dashboard preview role" value={role} onChange={setRole} options={roles.map(x=>({...x}))}/><Text style={[type.caption,{color:colors.mutedForeground,marginTop:8}]}>Sample UI preview only. This does not change account permissions.</Text></GlassCard>
      <Text style={[type.body,{color:colors.mutedForeground,marginBottom:14}]}>{data.intro}</Text>
      <View style={{ flexDirection:"row",flexWrap:"wrap",gap:12,marginBottom:24 }}>
        {data.stats.map(([label,value,hint,kind]) => { const icon=kind==="people"?<Users size={18} color={accent}/>:kind==="attendance"?<CalendarCheck size={18} color={colors.success}/>:kind==="fees"?<Wallet size={18} color={colors.warning}/>:<BookOpen size={18} color={colors.info}/>; return <View key={label} style={{ width:"48%" }}><StatTile label={label} value={value} hint={hint} icon={icon} tone={kind==="attendance"?"success":kind==="fees"?"warning":"neutral"}/></View>; })}
      </View>
      <View style={{ flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}><Text style={[type.headline,{color:colors.foreground}]}>Today at a glance</Text><Text style={{ color:accent,fontFamily:fonts.semibold,fontSize:13 }}>View all</Text></View>
      <GlassCard padding={12} style={{ marginBottom:24 }}>{data.activity.map(([title,subtitle,tag],i)=><ListRow key={title} title={title} subtitle={subtitle} divider={i!==data.activity.length-1} trailing={<View style={{ backgroundColor:withAlpha(accent,.1),borderRadius:radius.pill,paddingHorizontal:8,paddingVertical:5 }}><Text style={{ color:accent,fontSize:10,fontFamily:fonts.semibold }}>{tag}</Text></View>}/>)}</GlassCard>
      <Text style={[type.headline,{color:colors.foreground,marginBottom:12}]}>Quick access</Text>
      <View style={{ flexDirection:"row",gap:12,marginBottom:20 }}>
        <Pressable onPress={()=>router.push("/(tabs)/schedule")} style={{ flex:1 }}><GlassCard padding={16}><CalendarDays size={22} color={accent}/><Text style={[type.bodyStrong,{color:colors.foreground,marginTop:12}]}>My schedule</Text><Text style={[type.caption,{color:colors.mutedForeground}]}>Classes and events</Text><ArrowUpRight size={15} color={colors.mutedForeground} style={{position:"absolute",right:12,top:12}}/></GlassCard></Pressable>
        <Pressable onPress={()=>router.push("/(tabs)/notifications")} style={{ flex:1 }}><GlassCard padding={16}><Bell size={22} color={accent}/><Text style={[type.bodyStrong,{color:colors.foreground,marginTop:12}]}>Updates</Text><Text style={[type.caption,{color:colors.mutedForeground}]}>Notices and alerts</Text><ArrowUpRight size={15} color={colors.mutedForeground} style={{position:"absolute",right:12,top:12}}/></GlassCard></Pressable>
      </View>
      <Text style={[type.caption,{color:colors.mutedForeground,textAlign:"center"}]}>Illustrative sample content · Not live school data</Text>
    </Screen>
  );
}
