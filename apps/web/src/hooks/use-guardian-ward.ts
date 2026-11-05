import {useEffect,useSyncExternalStore} from "react";
import {useSession} from "@/lib/auth-client";
const EVENT="schoolhub-ward-change";
const subscribe=(notify:()=>void)=>{window.addEventListener(EVENT,notify);return()=>window.removeEventListener(EVENT,notify);};
/** Only IDs returned by the authenticated guardian's ward endpoint may be selected. */
export function useGuardianWard(wards:readonly {id:string}[]){
 const {data:session}=useSession();
 const key="schoolhub-ward:"+JSON.stringify([session?.user.id,session?.session.activeOrganizationId]);
 const stored=useSyncExternalStore(subscribe,()=>sessionStorage.getItem(key)??"",()=>"");
 const selected=wards.some(row=>row.id===stored)?stored:wards[0]?.id??"";
 const select=(id:string)=>{if(!wards.some(row=>row.id===id))return;sessionStorage.setItem(key,id);window.dispatchEvent(new Event(EVENT));};
 useEffect(()=>{if(selected&&selected!==stored){sessionStorage.setItem(key,selected);window.dispatchEvent(new Event(EVENT));}},[key,selected,stored]);
 return [selected,select] as const;
}
