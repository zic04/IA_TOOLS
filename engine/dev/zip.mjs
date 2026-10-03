// Minimal ZIP writer (no dependency): deflated entries, CRC-32, UTF-8 names. Used by `doc-kit export --zip`.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE) of a buffer. */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(date) {
  const d = new Date(date);
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const day = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, day };
}

/**
 * Writes `zipFile` with every file of `folder`, under the prefix `prefix/` (the folder's name by default).
 * @returns {{ file: string, entries: number, bytes: number }}
 */
export function zipFolder(folder, zipFile, prefix = path.basename(folder)) {
  const files = fs
    .readdirSync(folder, { recursive: true })
    .map(String)
    .filter((f) => fs.statSync(path.join(folder, f)).isFile())
    .sort();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const rel of files) {
    const full = path.join(folder, rel);
    const data = fs.readFileSync(full);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const name = Buffer.from(`${prefix ? prefix + "/" : ""}${rel.split(path.sep).join("/")}`, "utf8");
    const crc = crc32(data);
    const { time, day } = dosTime(fs.statSync(full).mtime);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, body);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(stored ? 0 : 8, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(day, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += local.length + name.length + body.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  const out = Buffer.concat([...chunks, ...central, end]);
  fs.mkdirSync(path.dirname(zipFile), { recursive: true });
  fs.writeFileSync(zipFile, out);
  return { file: zipFile, entries: files.length, bytes: out.length };
}

/** Reads the entries of a ZIP written by zipFolder (tests): [{ name, data }]. */
export function readZip(zipFile) {
  const buf = fs.readFileSync(zipFile);
  const entries = [];
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const size = buf.readUInt32LE(i + 18);
    const nameLength = buf.readUInt16LE(i + 26);
    const extra = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLength).toString("utf8");
    const body = buf.subarray(i + 30 + nameLength + extra, i + 30 + nameLength + extra + size);
    entries.push({ name, data: method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body), crc: buf.readUInt32LE(i + 14) });
    i += 30 + nameLength + extra + size;
  }
  return entries;
}
