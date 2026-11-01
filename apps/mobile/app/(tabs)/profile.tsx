import { CircleHelp, Moon, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react-native";
import { Text, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { GlassCard } from "@/components/GlassCard";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TAB_BAR_CLEARANCE } from "@/components/GlassTabBar";
import { spacing, type, useTheme, type SchemePreference, withAlpha } from "@/theme/theme";
export default function ProfileScreen(){
 const theme=useTheme(); const {colors,accent}=theme;
 return <Screen title="Profile" subtitle="Your account and preferences" bottomInset={TAB_BAR_CLEARANCE}>
  <GlassCard padding={spacing.xl} style={{marginBottom:spacing.xl}}><View style={{alignItems:"center",gap:12,paddingVertical:12}}><Avatar name="Andrews Asamoah" size={76}/><View style={{alignItems:"center",gap:3}}><Text style={[type.title,{color:colors.foreground}]}>Andrews Asamoah</Text><Text style={[type.caption,{color:colors.mutedForeground}]}>Teacher · Wesley International School</Text></View><View style={{backgroundColor:withAlpha(accent,.12),borderRadius:99,paddingHorizontal:12,paddingVertical:6}}><Text style={{color:accent,fontSize:11,fontWeight:"600"}}>Profile preview</Text></View></View></GlassCard>
  <Text style={[type.headline,{color:colors.foreground,marginBottom:12}]}>Appearance</Text>
  <GlassCard padding={spacing.lg} style={{marginBottom:spacing.xl}}><View style={{flexDirection:"row",alignItems:"center",gap:8,marginBottom:12}}><Moon size={18} color={accent}/><Text style={[type.bodyStrong,{color:colors.foreground}]}>Colour theme</Text></View><SegmentedControl<SchemePreference> accessibilityLabel="Colour theme" value={theme.schemePreference} onChange={theme.setSchemePreference} options={[{value:"system",label:"System"},{value:"light",label:"Light"},{value:"dark",label:"Dark"}]}/></GlassCard>
  <Text style={[type.headline,{color:colors.foreground,marginBottom:12}]}>Preferences</Text>
  <GlassCard padding={spacing.md} style={{marginBottom:spacing.xl}}>
   <ListRow title="Account details" subtitle="Personal and school information" leading={<UserRound color={accent} size={19}/>} chevron divider/>
   <ListRow title="App preferences" subtitle="Notifications and accessibility" leading={<SlidersHorizontal color={accent} size={19}/>} chevron divider/>
   <ListRow title="Security" subtitle="Password and trusted devices" leading={<ShieldCheck color={accent} size={19}/>} chevron divider/>
   <ListRow title="Help and support" subtitle="Get assistance with SchoolHub" leading={<CircleHelp color={accent} size={19}/>} chevron/>
  </GlassCard>
  <Text style={[type.caption,{color:colors.mutedForeground,textAlign:"center"}]}>SchoolHub Mobile · UI preview · v0.1</Text>
 </Screen>
}
