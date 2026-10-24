import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, History, LoaderCircle, Package, Pencil, Plus, Search, Warehouse, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface InventoryItem {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  quantity: number;
  unit?: string | null;
  minQuantity: number;
  updatedAt: string;
  transactions?: InventoryMovement[];
}
interface InventoryMovement {
  id: string;
  itemId?: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
  quantity: number;
  date: string;
  description?: string | null;
  recipientName?: string | null;
  createdAt: string;
  item?: { id: string; name: string; category?: string | null; unit?: string | null };
  performedBy?: { name?: string | null } | null;
}
interface ItemDraft {
  name: string;
  description: string;
  category: string;
  unit: string;
  initialQuantity: string;
  minQuantity: string;
}
interface EditItemDraft {
  name: string;
  description: string;
  category: string;
  unit: string;
  minQuantity: string;
}
interface MovementDraft {
  itemId: string;
  type: "IN" | "OUT";
  quantity: string;
  date: string;
  description: string;
  recipientName: string;
}
const fieldClass = "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30";
const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0,10);
};
const monthStart = () => today().slice(0,7)+"-01";
const dateLabel = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? value + "T00:00:00.000Z" : value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(date);
};
const itemFresh = (): ItemDraft => ({ name:"", description:"", category:"", unit:"pcs", initialQuantity:"0", minQuantity:"0" });
const itemEditFresh = (item: InventoryItem): EditItemDraft => ({ name:item.name, description:item.description??"", category:item.category??"", unit:item.unit??"pcs", minQuantity:String(item.minQuantity) });
const movementFresh = (itemId=""): MovementDraft => ({ itemId, type:"IN", quantity:"1", date:today(), description:"", recipientName:"" });
const displayType = (type: string) => type === "IN" ? "Stock in" : type === "OUT" ? "Stock out" : "Adjustment";
function downloadCsv(rows: unknown[][], filename: string) {
  const csv = rows.map(row => row.map(value => '"' + String(value ?? "").replaceAll('"','""') + '"').join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8;"}));
  const link = document.createElement("a");
  link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

export function InventoryManagementWorkspace() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [movementItemId, setMovementItemId] = useState("ALL");
  const [movementType, setMovementType] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
  const [editDraft, setEditDraft] = useState<EditItemDraft | null>(null);
  const [movementOpen, setMovementOpen] = useState(false);
  const [itemDraft, setItemDraft] = useState<ItemDraft>(itemFresh);
  const [movementDraft, setMovementDraft] = useState<MovementDraft>(movementFresh);
  const [feedback, setFeedback] = useState<{kind:"success"|"error";text:string}|null>(null);
  const rangeInvalid = Boolean(fromDate && toDate && fromDate > toDate);

  const itemsQuery = useQuery({
    queryKey:["inventory","items"],
    queryFn:()=>apiFetch<InventoryItem[]>("/inventory/items"),
    retry:false,
  });
  const itemList = itemsQuery.data ?? [];
  const transactionQuery = useQuery({
    queryKey:["inventory","transactions",fromDate,toDate,movementItemId,movementType],
    queryFn:()=>{
      const params=new URLSearchParams();
      if(fromDate) params.set("from",fromDate);
      if(toDate) params.set("to",toDate);
      if(movementItemId!=="ALL") params.set("itemId",movementItemId);
      if(movementType!=="ALL") params.set("type",movementType);
      const query=params.toString();
      return apiFetch<InventoryMovement[]>("/inventory/transactions"+(query?"?"+query:""));
    },
    enabled:!rangeInvalid,
    retry:false,
  });
  const transactions = transactionQuery.data ?? [];
  const categoryNames = [...new Set(itemList.map(item => item.category?.trim()).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b));
  const lowCount = itemList.filter(item=>item.quantity<=item.minQuantity).length;
  const totalUnits = itemList.reduce((sum,item)=>sum+item.quantity,0);
  const visibleItems = useMemo(()=>itemList.filter(item=>{
    const term=search.trim().toLowerCase();
    const textMatch=!term||[item.name,item.category,item.description,item.unit].some(value=>String(value??"").toLowerCase().includes(term));
    return textMatch&&(!lowStockOnly||item.quantity<=item.minQuantity)&&(categoryFilter==="ALL"||item.category===categoryFilter);
  }),[itemList,search,lowStockOnly,categoryFilter]);

  const createItem = useMutation({
    mutationFn:(input:ItemDraft)=>apiFetch<InventoryItem>("/inventory/items",{method:"POST",body:JSON.stringify({
      name:input.name.trim(),description:input.description.trim()||undefined,category:input.category.trim()||undefined,unit:input.unit.trim()||"pcs",initialQuantity:Number(input.initialQuantity),minQuantity:Number(input.minQuantity)
    })}),
    onSuccess:async(item)=>{
      setFeedback({kind:"success",text:"Inventory item “"+item.name+"” was created."});
      setCreateOpen(false);setItemDraft(itemFresh());
      await Promise.all([queryClient.invalidateQueries({queryKey:["inventory","items"]}),queryClient.invalidateQueries({queryKey:["inventory","transactions"]})]);
    },
    onError:(error:Error)=>setFeedback({kind:"error",text:error.message}),
  });
  const updateItem = useMutation({
    mutationFn: ({ id, input }: { id: string; input: EditItemDraft }) =>
      apiFetch<InventoryItem>("/inventory/items/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify({
          name: input.name.trim(),
          description: input.description.trim() || undefined,
          category: input.category.trim() || undefined,
          unit: input.unit.trim() || "pcs",
          minQuantity: Number(input.minQuantity),
        }),
      }),
    onSuccess: async (item) => {
      setFeedback({ kind: "success", text: "Inventory item “" + item.name + "” updated. On-hand quantity is unchanged." });
      setEditTarget(null);
      setEditDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const recordMovement = useMutation({
    mutationFn:(input:MovementDraft)=>apiFetch<InventoryMovement>("/inventory/items/"+encodeURIComponent(input.itemId)+"/movements",{method:"POST",body:JSON.stringify({
      type:input.type,quantity:Number(input.quantity),date:input.date,description:input.description.trim()||undefined,recipientName:input.recipientName.trim()||undefined
    })}),
    onSuccess:async()=>{
      setFeedback({kind:"success",text:"Stock movement saved and the on-hand quantity updated."});
      setMovementOpen(false);setMovementDraft(movementFresh());
      await Promise.all([queryClient.invalidateQueries({queryKey:["inventory","items"]}),queryClient.invalidateQueries({queryKey:["inventory","transactions"]})]);
    },
    onError:(error:Error)=>setFeedback({kind:"error",text:error.message}),
  });

  function submitItem(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!Number.isInteger(Number(itemDraft.initialQuantity))||Number(itemDraft.initialQuantity)<0||!Number.isInteger(Number(itemDraft.minQuantity))||Number(itemDraft.minQuantity)<0){
      setFeedback({kind:"error",text:"Opening and minimum stock quantities must be non-negative whole numbers."});return;
    }
    createItem.mutate(itemDraft);
  }
  function submitEditItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget || !editDraft) return;
    if (!editDraft.name.trim() || !editDraft.unit.trim() || !Number.isInteger(Number(editDraft.minQuantity)) || Number(editDraft.minQuantity) < 0) {
      setFeedback({ kind: "error", text: "Enter a valid item name, unit and non-negative whole-number minimum stock level." });
      return;
    }
    updateItem.mutate({ id: editTarget.id, input: editDraft });
  }
  function submitMovement(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const item=itemList.find(candidate=>candidate.id===movementDraft.itemId);
    if(!item){setFeedback({kind:"error",text:"Choose an inventory item."});return;}
    if(!Number.isInteger(Number(movementDraft.quantity))||Number(movementDraft.quantity)<=0){setFeedback({kind:"error",text:"Movement quantity must be a positive whole number."});return;}
    if(movementDraft.type==="OUT"&&Number(movementDraft.quantity)>item.quantity){setFeedback({kind:"error",text:"This movement is larger than the current stock. Available: "+item.quantity+" "+(item.unit||"pcs")+"."});return;}
    recordMovement.mutate(movementDraft);
  }

  return <div className="mx-auto w-full min-w-0 max-w-screen-2xl space-y-6">
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Finance & bursary</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Inventory & supplies</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Track quantities, flag low stock, and review an auditable history of stock received and issued.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" className={secondaryButton} disabled={!visibleItems.length} onClick={()=>downloadCsv([["Item","Category","Description","Quantity on hand","Unit","Minimum quantity","Stock status","Last updated"],...visibleItems.map(item=>[item.name,item.category??"",item.description??"",item.quantity,item.unit??"pcs",item.minQuantity,item.quantity<=item.minQuantity?"LOW STOCK":"IN STOCK",dateLabel(item.updatedAt)])],"schoolhub-inventory-register.csv")}><Download className="size-4"/>Export stock</button><button type="button" className={primaryButton} onClick={()=>{setFeedback(null);setItemDraft(itemFresh());setCreateOpen(true);}}><Plus className="size-4"/>Add item</button></div>
    </section>
    {feedback&&<div role={feedback.kind==="error"?"alert":"status"} className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm",feedback.kind==="error"?"border-destructive/30 bg-destructive/5 text-destructive":"border-success/30 bg-success/5 text-foreground")}><span className="min-w-0 flex-1">{feedback.text}</span><button type="button" aria-label="Dismiss" onClick={()=>setFeedback(null)}><X className="size-4"/></button></div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Stocked items" value={itemsQuery.isPending?"—":String(itemList.length)} detail="Items in the register" icon={Package}/><Metric label="Low stock alerts" value={itemsQuery.isPending?"—":String(lowCount)} detail="At or below minimum quantity" icon={AlertTriangle}/><Metric label="Total quantity recorded" value={itemsQuery.isPending?"—":String(totalUnits)} detail="Quantities across mixed units" icon={Warehouse}/><Metric label="Movements in period" value={transactionQuery.isPending?"—":String(transactions.length)} detail="History is filtered by dates below" icon={History}/></div>

    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div className="min-w-0 flex-1"><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Search stock register</label><div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><input className={cn(fieldClass,"pl-9")} value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search item, description or category…"/></div></div><div className="grid gap-2 sm:grid-cols-2 lg:w-[420px]"><div><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Category</label><Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ALL">All categories</SelectItem>{categoryNames.map(name=><SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></div><label className="flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={lowStockOnly} onChange={event=>setLowStockOnly(event.target.checked)}/>Low stock only</label></div></div>
      {itemsQuery.isPending?<LoadingState/>:itemsQuery.error?<ErrorState message={itemsQuery.error.message}/>:visibleItems.length?<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Item</th><th className="p-3">Category</th><th className="p-3 text-right">On hand</th><th className="p-3 text-right">Minimum</th><th className="p-3">Status</th><th className="p-3">Updated</th><th className="p-3"></th></tr></thead><tbody>{visibleItems.map(item=>{const low=item.quantity<=item.minQuantity;return <tr key={item.id} className="border-b border-border/70 last:border-0 hover:bg-muted/30"><td className="p-3"><p className="font-semibold text-foreground">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.description||item.unit||"—"}</p></td><td className="p-3">{item.category||"Uncategorised"}</td><td className="p-3 text-right font-semibold tabular-nums">{item.quantity} {item.unit||"pcs"}</td><td className="p-3 text-right tabular-nums">{item.minQuantity}</td><td className="p-3"><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold",low?"bg-destructive/10 text-destructive":"bg-success/10 text-success")}>{low?"LOW STOCK":"IN STOCK"}</span></td><td className="p-3">{dateLabel(item.updatedAt)}</td><td className="p-3 text-right"><div className="inline-flex flex-wrap justify-end gap-3"><button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={()=>{setEditTarget(item);setEditDraft(itemEditFresh(item));}}><Pencil className="size-3.5"/>Edit</button><button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={()=>{setMovementDraft(movementFresh(item.id));setMovementOpen(true);}}>Record movement</button></div></td></tr>})}</tbody></table></div>:<EmptyState title="No matching stock items" description="Change the filters or add an inventory item to begin tracking quantities." onAction={()=>setCreateOpen(true)}/>}
    </section>

    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold text-foreground">Stock movement history</h2><p className="mt-1 text-sm text-muted-foreground">Latest 1,000 matching transactions. Each movement updates on-hand quantities.</p></div><button type="button" className={secondaryButton} disabled={!transactions.length} onClick={()=>downloadCsv([["Date","Item","Movement","Quantity","Unit","Description","Recipient","Recorded by"],...transactions.map(tx=>[dateLabel(tx.date),tx.item?.name??"",displayType(tx.type),tx.quantity,tx.item?.unit??"pcs",tx.description??"",tx.recipientName??"",tx.performedBy?.name??""])],"schoolhub-inventory-movements.csv")}><Download className="size-4"/>Export history</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="From date"><input type="date" className={fieldClass} value={fromDate} max={toDate||undefined} onChange={event=>setFromDate(event.target.value)}/></Field><Field label="To date"><input type="date" className={fieldClass} value={toDate} min={fromDate||undefined} onChange={event=>setToDate(event.target.value)}/></Field><Field label="Stock item"><Select value={movementItemId} onValueChange={setMovementItemId}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ALL">All items</SelectItem>{itemList.map(item=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Movement type"><Select value={movementType} onValueChange={setMovementType}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ALL">All movements</SelectItem><SelectItem value="IN">Stock in</SelectItem><SelectItem value="OUT">Stock out</SelectItem><SelectItem value="ADJUSTMENT">Adjustment</SelectItem></SelectContent></Select></Field></div>
      {rangeInvalid?<ErrorState message="The start date must be on or before the end date."/>:transactionQuery.isPending?<LoadingState/>:transactionQuery.error?<ErrorState message={transactionQuery.error.message}/>:transactions.length?<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Date</th><th className="p-3">Item</th><th className="p-3">Movement</th><th className="p-3 text-right">Quantity</th><th className="p-3">Recipient / description</th><th className="p-3">Recorded by</th></tr></thead><tbody>{transactions.map(tx=><tr key={tx.id} className="border-b border-border/70 last:border-0"><td className="p-3">{dateLabel(tx.date)}</td><td className="p-3 font-medium text-foreground">{tx.item?.name??"Unknown item"}</td><td className="p-3"><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold",tx.type==="IN"?"bg-success/10 text-success":tx.type==="OUT"?"bg-primary/10 text-primary":"bg-muted text-muted-foreground")}>{displayType(tx.type)}</span></td><td className="p-3 text-right font-semibold tabular-nums">{tx.quantity} {tx.item?.unit||"pcs"}</td><td className="p-3"><p>{tx.description||"—"}</p>{tx.recipientName&&<p className="mt-1 text-xs text-muted-foreground">Recipient: {tx.recipientName}</p>}</td><td className="p-3 text-muted-foreground">{tx.performedBy?.name||"—"}</td></tr>)}</tbody></table></div>:<p className="py-8 text-center text-sm text-muted-foreground">No stock movements match these filters.</p>}
    </section>

    {createOpen&&<Modal title="Add inventory item" description="Create a stock record and optionally record opening stock." onClose={()=>!createItem.isPending&&setCreateOpen(false)}><form className="space-y-4" onSubmit={submitItem}><div className="grid gap-4 sm:grid-cols-2"><Field label="Item name"><input required minLength={2} maxLength={150} className={fieldClass} value={itemDraft.name} onChange={event=>setItemDraft(current=>({...current,name:event.target.value}))} placeholder="e.g. Exercise books"/></Field><Field label="Category"><input maxLength={100} className={fieldClass} value={itemDraft.category} onChange={event=>setItemDraft(current=>({...current,category:event.target.value}))} placeholder="Stationery, ICT, cleaning…"/></Field></div><Field label="Description (optional)"><textarea maxLength={500} className={cn(fieldClass,"h-20 py-2")} value={itemDraft.description} onChange={event=>setItemDraft(current=>({...current,description:event.target.value}))}/></Field><div className="grid gap-4 sm:grid-cols-3"><Field label="Unit"><input required maxLength={20} className={fieldClass} value={itemDraft.unit} onChange={event=>setItemDraft(current=>({...current,unit:event.target.value}))}/></Field><Field label="Opening quantity"><input type="number" required min="0" step="1" className={fieldClass} value={itemDraft.initialQuantity} onChange={event=>setItemDraft(current=>({...current,initialQuantity:event.target.value}))}/></Field><Field label="Minimum stock"><input type="number" required min="0" step="1" className={fieldClass} value={itemDraft.minQuantity} onChange={event=>setItemDraft(current=>({...current,minQuantity:event.target.value}))}/></Field></div>{createItem.error&&<ErrorState message={createItem.error.message}/>}<div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" className={secondaryButton} onClick={()=>setCreateOpen(false)} disabled={createItem.isPending}>Cancel</button><button type="submit" className={primaryButton} disabled={createItem.isPending}>{createItem.isPending&&<LoaderCircle className="size-4 animate-spin"/>}Save item</button></div></form></Modal>}

    {editTarget&&editDraft&&<Modal title="Edit inventory item" description="Update item details and the low-stock threshold. On-hand quantity is maintained by stock movements and will not be changed here." onClose={()=>!updateItem.isPending&&(setEditTarget(null),setEditDraft(null))}><form className="space-y-4" onSubmit={submitEditItem}><div className="grid gap-4 sm:grid-cols-2"><Field label="Item name"><input required minLength={2} maxLength={150} className={fieldClass} value={editDraft.name} onChange={event=>setEditDraft(current=>current?({...current,name:event.target.value}):current)} /></Field><Field label="Category"><input maxLength={100} className={fieldClass} value={editDraft.category} onChange={event=>setEditDraft(current=>current?({...current,category:event.target.value}):current)} placeholder="Stationery, ICT, cleaning…" /></Field></div><Field label="Description (optional)"><textarea maxLength={500} className={cn(fieldClass,"h-20 py-2")} value={editDraft.description} onChange={event=>setEditDraft(current=>current?({...current,description:event.target.value}):current)} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Unit"><input required maxLength={20} className={fieldClass} value={editDraft.unit} onChange={event=>setEditDraft(current=>current?({...current,unit:event.target.value}):current)} /></Field><Field label="Minimum stock"><input type="number" required min="0" step="1" className={fieldClass} value={editDraft.minQuantity} onChange={event=>setEditDraft(current=>current?({...current,minQuantity:event.target.value}):current)} /></Field></div><div className="rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">Current on-hand quantity: <strong className="text-foreground">{editTarget.quantity} {editTarget.unit||"pcs"}</strong>. Use Record movement to change stock quantities so the inventory history remains auditable.</div>{updateItem.error&&<ErrorState message={updateItem.error.message}/>}<div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" className={secondaryButton} onClick={()=>{setEditTarget(null);setEditDraft(null);}} disabled={updateItem.isPending}>Cancel</button><button type="submit" className={primaryButton} disabled={updateItem.isPending}>{updateItem.isPending&&<LoaderCircle className="size-4 animate-spin"/>}Save changes</button></div></form></Modal>}
    {movementOpen&&<Modal title="Record stock movement" description={itemList.find(item=>item.id===movementDraft.itemId)?.name??"Update stock"} onClose={()=>!recordMovement.isPending&&setMovementOpen(false)}><form className="space-y-4" onSubmit={submitMovement}><Field label="Inventory item"><Select value={movementDraft.itemId} onValueChange={value=>setMovementDraft(current=>({...current,itemId:value}))}><SelectTrigger className="w-full"><SelectValue placeholder="Choose an item"/></SelectTrigger><SelectContent>{itemList.map(item=><SelectItem key={item.id} value={item.id}>{item.name} — {item.quantity} {item.unit||"pcs"} on hand</SelectItem>)}</SelectContent></Select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Movement type"><Select value={movementDraft.type} onValueChange={value=>setMovementDraft(current=>({...current,type:value as "IN"|"OUT"}))}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="IN">Stock in — received</SelectItem><SelectItem value="OUT">Stock out — issued</SelectItem></SelectContent></Select></Field><Field label="Quantity"><input type="number" min="1" step="1" required className={fieldClass} value={movementDraft.quantity} onChange={event=>setMovementDraft(current=>({...current,quantity:event.target.value}))}/></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Date"><input type="date" required className={fieldClass} value={movementDraft.date} onChange={event=>setMovementDraft(current=>({...current,date:event.target.value}))}/></Field><Field label="Recipient (optional)"><input maxLength={150} className={fieldClass} value={movementDraft.recipientName} onChange={event=>setMovementDraft(current=>({...current,recipientName:event.target.value}))} placeholder="Department or staff member"/></Field></div><Field label="Description / reason"><textarea maxLength={500} className={cn(fieldClass,"h-20 py-2")} value={movementDraft.description} onChange={event=>setMovementDraft(current=>({...current,description:event.target.value}))} placeholder="Delivery note, issue reason, invoice reference…"/></Field>{recordMovement.error&&<ErrorState message={recordMovement.error.message}/>}<div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" className={secondaryButton} onClick={()=>setMovementOpen(false)} disabled={recordMovement.isPending}>Cancel</button><button type="submit" className={primaryButton} disabled={recordMovement.isPending}>{recordMovement.isPending&&<LoaderCircle className="size-4 animate-spin"/>}Save movement</button></div></form></Modal>}
  </div>;
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Package }) { return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><Icon className="size-4 text-primary"/></div><p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid min-w-0 gap-1.5 text-sm font-medium text-foreground"><span>{label}</span>{children}</label>; }
function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-3 sm:p-6" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><button type="button" aria-label="Close dialog" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={onClose}><X className="size-4"/></button></div>{children}</section></div>; }
function ErrorState({ message }: { message: string }) { return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{message}</div>; }
function LoadingState() { return <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin"/>Loading inventory…</div>; }
function EmptyState({ title, description, onAction }: { title: string; description: string; onAction?: () => void }) { return <div className="flex min-h-52 flex-col items-center justify-center px-5 py-10 text-center"><span className="rounded-2xl bg-muted p-3"><Package className="size-6 text-muted-foreground"/></span><h3 className="mt-4 font-semibold text-foreground">{title}</h3><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>{onAction && <button type="button" className={primaryButton+" mt-4"} onClick={onAction}><Plus className="size-4"/>Add inventory item</button>}</div>; }
