// Minimal read-only SQLite 3 file reader (no WASM, no native deps).
// Supports rowid tables (leaf/interior b-tree pages) with overflow pages.

export type SqlValue = null | number | string | Uint8Array;
export type Row = Record<string, SqlValue>;

export class SqliteFile {
  private dv: DataView;
  private bytes: Uint8Array;
  private pageSize: number;
  private usable: number;
  private dec = new TextDecoder('utf-8');
  private schema: { type: string; name: string; rootpage: number; sql: string }[] = [];

  constructor(buf: ArrayBuffer | Uint8Array) {
    this.bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.dv = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const magic = this.dec.decode(this.bytes.subarray(0, 15));
    if (magic !== 'SQLite format 3') throw new Error('Not a SQLite database');
    const ps = this.dv.getUint16(16);
    this.pageSize = ps === 1 ? 65536 : ps;
    this.usable = this.pageSize - this.bytes[20];
    for (const r of this.scan(1)) {
      const [type, name, , rootpage, sql] = r.values;
      this.schema.push({ type: String(type), name: String(name), rootpage: Number(rootpage), sql: String(sql ?? '') });
    }
  }

  tables(): string[] {
    return this.schema.filter((s) => s.type === 'table').map((s) => s.name);
  }

  hasTable(name: string) {
    return this.schema.some((s) => s.type === 'table' && s.name === name);
  }

  all(table: string): Row[] {
    const t = this.schema.find((s) => s.type === 'table' && s.name === table);
    if (!t) return [];
    const cols = parseColumns(t.sql);
    const out: Row[] = [];
    for (const r of this.scan(t.rootpage)) {
      const row: Row = {};
      cols.forEach((c, i) => {
        let v = i < r.values.length ? r.values[i] : null;
        if (v === null && c.ipk) v = r.rowid;
        row[c.name] = v;
      });
      out.push(row);
    }
    return out;
  }

  private pageOffset(n: number) {
    return (n - 1) * this.pageSize;
  }

  private *scan(page: number): Generator<{ rowid: number; values: SqlValue[] }> {
    const stack = [page];
    while (stack.length) {
      const p = stack.pop()!;
      const base = this.pageOffset(p);
      const hdr = p === 1 ? base + 100 : base;
      const type = this.bytes[hdr];
      const ncells = this.dv.getUint16(hdr + 3);
      if (type === 0x05) {
        const right = this.dv.getUint32(hdr + 8);
        const children: number[] = [];
        for (let i = 0; i < ncells; i++) {
          const ptr = base + this.dv.getUint16(hdr + 12 + i * 2);
          children.push(this.dv.getUint32(ptr));
        }
        children.push(right);
        // push in reverse so we visit in order
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
      } else if (type === 0x0d) {
        for (let i = 0; i < ncells; i++) {
          let off = base + this.dv.getUint16(hdr + 8 + i * 2);
          const [psize, n1] = this.varint(off);
          off += n1;
          const [rowid, n2] = this.varint(off);
          off += n2;
          const payload = this.payload(off, psize);
          yield { rowid, values: this.record(payload) };
        }
      } else {
        // index pages or unknown: ignore
      }
    }
  }

  private payload(off: number, size: number): Uint8Array {
    const U = this.usable;
    const X = U - 35;
    if (size <= X) return this.bytes.subarray(off, off + size);
    const M = Math.floor(((U - 12) * 32) / 255) - 23;
    const K = M + ((size - M) % (U - 4));
    const local = K <= X ? K : M;
    const out = new Uint8Array(size);
    out.set(this.bytes.subarray(off, off + local), 0);
    let pos = local;
    let next = this.dv.getUint32(off + local);
    while (next && pos < size) {
      const b = this.pageOffset(next);
      const n = Math.min(U - 4, size - pos);
      out.set(this.bytes.subarray(b + 4, b + 4 + n), pos);
      pos += n;
      next = this.dv.getUint32(b);
    }
    return out;
  }

  private varint(off: number, src: Uint8Array = this.bytes): [number, number] {
    let v = 0;
    for (let i = 0; i < 8; i++) {
      const b = src[off + i];
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return [v, i + 1];
    }
    v = v * 256 + src[off + 8];
    return [v, 9];
  }

  private record(p: Uint8Array): SqlValue[] {
    const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
    const [hsize, n0] = this.varint(0, p);
    let h = n0;
    const types: number[] = [];
    while (h < hsize) {
      const [t, n] = this.varint(h, p);
      types.push(t);
      h += n;
    }
    let o = hsize;
    const vals: SqlValue[] = [];
    for (const t of types) {
      switch (t) {
        case 0: vals.push(null); break;
        case 1: vals.push(dv.getInt8(o)); o += 1; break;
        case 2: vals.push(dv.getInt16(o)); o += 2; break;
        case 3: { const v = (dv.getInt8(o) << 16) | (p[o + 1] << 8) | p[o + 2]; vals.push(v); o += 3; break; }
        case 4: vals.push(dv.getInt32(o)); o += 4; break;
        case 5: vals.push(dv.getInt16(o) * 4294967296 + dv.getUint32(o + 2)); o += 6; break;
        case 6: vals.push(Number(dv.getBigInt64(o))); o += 8; break;
        case 7: vals.push(dv.getFloat64(o)); o += 8; break;
        case 8: vals.push(0); break;
        case 9: vals.push(1); break;
        default:
          if (t >= 12 && t % 2 === 0) {
            const n = (t - 12) / 2;
            vals.push(p.slice(o, o + n)); o += n;
          } else if (t >= 13) {
            const n = (t - 13) / 2;
            vals.push(this.dec.decode(p.subarray(o, o + n))); o += n;
          } else vals.push(null);
      }
    }
    return vals;
  }
}

function parseColumns(sql: string): { name: string; ipk: boolean }[] {
  const start = sql.indexOf('(');
  const end = sql.lastIndexOf(')');
  const body = sql.slice(start + 1, end);
  const parts: string[] = [];
  let depth = 0, cur = '', q: string | null = null;
  for (const ch of body) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`' || ch === '[') { q = ch === '[' ? ']' : ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  const cols: { name: string; ipk: boolean }[] = [];
  for (const raw of parts) {
    const s = raw.trim();
    if (/^(primary|unique|check|foreign|constraint)\b/i.test(s)) continue;
    const m = s.match(/^("([^"]+)"|`([^`]+)`|'([^']+)'|\[([^\]]+)\]|(\S+))\s*(.*)$/s);
    if (!m) continue;
    const name = m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6];
    const rest = (m[7] || '').toLowerCase();
    cols.push({ name, ipk: /^integer\b/.test(rest) && rest.includes('primary key') });
  }
  return cols;
}
