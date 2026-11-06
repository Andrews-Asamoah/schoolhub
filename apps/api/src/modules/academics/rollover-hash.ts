import { createHash } from 'node:crypto';
/** PostgreSQL JSONB may reorder object keys; evidence hashes bind values, not insertion order. */
export function rolloverHash(data:unknown):string{
 const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==='object'?Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
 return createHash('sha256').update(JSON.stringify(canonical(JSON.parse(JSON.stringify(data))))).digest('hex');
}
