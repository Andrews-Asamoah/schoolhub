// Prototype of the pull side's cursor problem. In PostgreSQL a sequence number is handed out when a
// row is written, but the row only becomes visible when its transaction commits, and commits can
// happen in a different order. A client that remembers "the highest number I have seen" can
// therefore skip a change for good. The safe cursor only reads below the oldest open transaction.

export class ChangeLog {
  constructor() { this.nextSeq = 1; this.nextTx = 1; this.rows = []; this.open = new Map(); }

  begin() { const tx = { id: this.nextTx++, seqs: [] }; this.open.set(tx.id, tx); return tx; }

  write(tx, entity) {
    const row = { seq: this.nextSeq++, entity, committed: false };
    this.rows.push(row);
    tx.seqs.push(row.seq);
    return row;
  }

  commit(tx) {
    for (const row of this.rows) if (tx.seqs.includes(row.seq)) row.committed = true;
    this.open.delete(tx.id);
  }

  visible() { return this.rows.filter((row) => row.committed).sort((a, b) => a.seq - b.seq); }

  /** What a naive client does: take everything visible above its cursor, then jump to the highest seen. */
  naivePull(cursor) {
    const rows = this.visible().filter((row) => row.seq > cursor);
    return { rows, cursor: rows.length ? rows[rows.length - 1].seq : cursor };
  }

  /** Only reads rows older than any still-open write, so nothing can appear behind the cursor. */
  safePull(cursor) {
    const horizon = Math.min(Infinity, ...[...this.open.values()].flatMap((tx) => tx.seqs));
    const rows = this.visible().filter((row) => row.seq > cursor && row.seq < horizon);
    return { rows, cursor: rows.length ? rows[rows.length - 1].seq : cursor };
  }
}
