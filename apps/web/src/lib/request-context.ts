/** Old account/role responses must never be consumed by a newly active portal. */
let version=0;
export const requestContextVersion=()=>version;
export function expireRequestContext(){version++;}
export function assertRequestContext(expected:number){
 if(expected!==version)throw new DOMException("The active account or school role changed.","AbortError");
}
