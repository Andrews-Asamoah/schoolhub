import { Bell, CalendarDays, MessageCircle, Megaphone } from "lucide-react-native";
import { Text, View } from "react-native";
import { GlassCard } from "@/components/GlassCard";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { TAB_BAR_CLEARANCE } from "@/components/GlassTabBar";
import { spacing, type, useTheme, withAlpha } from "@/theme/theme";
const items=[["Assessment deadline reminder","Score submission closes this Friday · 20 min ago",CalendarDays,true],["New school announcement","Updated arrangements for the end-of-term event · 2 hours ago",Megaphone,true],["Parent–teacher meeting","Meeting schedule has been published · Yesterday",MessageCircle,false]] as const;
export default function NotificationsScreen(){
 const {colors,accent}=useTheme();
 return <Screen title="Updates" subtitle="Announcements and reminders" bottomInset={TAB_BAR_CLEARANCE}>
  <GlassCard padding={spacing.lg} style={{marginBottom:spacing.xl}}><View style={{flexDirection:"row",alignItems:"center",gap:12}}><View style={{width:46,height:46,borderRadius:15,backgroundColor:withAlpha(accent,.12),alignItems:"center",justifyContent:"center"}}><Bell size={21} color={accent}/></View><View style={{flex:1}}><Text style={[type.headline,{color:colors.foreground}]}>Your updates</Text><Text style={[type.caption,{color:colors.mutedForeground}]}>3 sample notices in this preview</Text></View></View></GlassCard>
  <Text style={[type.overline,{color:colors.mutedForeground,marginBottom:spacing.md}]}>RECENT</Text>
  <GlassCard padding={spacing.md}>{items.map(([title,subtitle,Icon,fresh],i)=><ListRow key={title} title={title} subtitle={subtitle} divider={i!==items.length-1} leading={<View style={{width:40,height:40,borderRadius:13,backgroundColor:withAlpha(accent,.12),alignItems:"center",justifyContent:"center"}}><Icon size={19} color={accent}/></View>} trailing={fresh?<View style={{width:7,height:7,borderRadius:4,backgroundColor:accent}}/>:null}/>)}</GlassCard>
 </Screen>
}
