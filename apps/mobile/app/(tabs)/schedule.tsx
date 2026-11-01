import { CalendarDays, MapPin } from "lucide-react-native";
import { Text, View } from "react-native";
import { GlassCard } from "@/components/GlassCard";
import { Screen } from "@/components/Screen";
import { TAB_BAR_CLEARANCE } from "@/components/GlassTabBar";
import { fonts, radius, spacing, type, useTheme, withAlpha } from "@/theme/theme";
const lessons=[["08:00","08:40","Mathematics","JHS 2 · Room 04","#635BDB","Completed"],["09:00","09:40","English Language","JHS 2 · Room 04","#0D9488","Completed"],["10:30","11:10","Integrated Science","JHS 2 · Science Lab","#D97706","Next up"],["11:30","12:10","Computing","JHS 1 · ICT Lab","#2563EB","Upcoming"]];
export default function ScheduleScreen(){
 const {colors,accent}=useTheme();
 return <Screen title="Schedule" subtitle="Monday, 2 November" bottomInset={TAB_BAR_CLEARANCE}>
  <GlassCard padding={spacing.lg} style={{marginBottom:spacing.xl}}><View style={{flexDirection:"row",alignItems:"center",gap:12}}><View style={{width:48,height:48,borderRadius:16,backgroundColor:withAlpha(accent,.13),alignItems:"center",justifyContent:"center"}}><CalendarDays color={accent} size={23}/></View><View style={{flex:1}}><Text style={[type.headline,{color:colors.foreground}]}>Your teaching day</Text><Text style={[type.caption,{color:colors.mutedForeground}]}>4 lessons · 2 free periods</Text></View><Text style={{color:colors.success,fontFamily:fonts.semibold,fontSize:12}}>Today</Text></View></GlassCard>
  <Text style={[type.headline,{color:colors.foreground,marginBottom:spacing.md}]}>Monday’s timetable</Text>
  {lessons.map(([start,end,subject,detail,tint,state],i)=><View key={subject} style={{flexDirection:"row",gap:12,marginBottom:12}}><View style={{width:54,alignItems:"center",paddingTop:4}}><Text style={{color:colors.foreground,fontFamily:fonts.semibold,fontSize:13}}>{start}</Text><Text style={{color:colors.mutedForeground,fontSize:11,marginTop:3}}>{end}</Text>{i<lessons.length-1?<View style={{width:1,flex:1,minHeight:54,backgroundColor:colors.border,marginTop:8}}/>:null}</View><GlassCard padding={14} style={{flex:1,borderLeftWidth:3,borderLeftColor:tint}}><View style={{flexDirection:"row",justifyContent:"space-between",gap:8}}><Text style={[type.bodyStrong,{color:colors.foreground,flex:1}]}>{subject}</Text><Text style={{fontSize:10,fontFamily:fonts.semibold,color:state==="Completed"?colors.success:state==="Next up"?accent:colors.mutedForeground,backgroundColor:withAlpha(state==="Completed"?colors.success:accent,.1),paddingHorizontal:8,paddingVertical:4,borderRadius:radius.pill}}>{state}</Text></View><View style={{flexDirection:"row",alignItems:"center",gap:6,marginTop:8}}><MapPin size={13} color={colors.mutedForeground}/><Text style={[type.caption,{color:colors.mutedForeground}]}>{detail}</Text></View></GlassCard></View>)}
  <Text style={[type.caption,{color:colors.mutedForeground,marginTop:12}]}>Example timetable for interface review only.</Text>
 </Screen>
}
