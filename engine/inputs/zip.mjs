// Safe ZIP reader for the documents of the sources (`doc-kit inputs ingest`, ARCHITECTURE.md §6.19): a .docx is a
// ZIP archive, and a document a team hands over is untrusted input (SECURITY.md). The archive is read the way its
// format means it to be read: from the End Of Central Directory record (found by a bounded backwards scan) to the
// central directory, then to the local header of each entry asked for. Every size is checked before anything is
// inflated, so a ZIP bomb is refused instead of filling the memory:
//   - only the entries asked for (exact names) are ever inflated, each at most `maxEntryBytes` and all together at
//     most `maxTotalBytes` once uncompressed, with a ratio (uncompressed / compressed) of at most `maxRatio`;
//   - inflation is capped at the declared size + 1 byte, the output must have exactly the declared size and the
//     CRC-32 it declares;
//   - ZIP64, multi-disk and encrypted archives, methods other than stored and deflate, duplicate names, and an
//     entry whose local header names another file or points outside the archive are refused (the sizes, the method
//     and the CRC used are those of the central directory, checked against the inflated data).
// Errors: KitError(EXIT.CHECK, "inputs.refused", { reason }), the caller adds the file name.
import zlib from "node:zlib";
import { KitError, EXIT } from "../project/errors.mjs";
import { crc32 } from "../core/hash.mjs";

/** Limits of the reader (uncompressed sizes in bytes; ratio of one entry, uncompressed / compressed). */
export const ZIP_LIMITS = Object.freeze({
  maxEntries: 10000,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxRatio: 200,
});

const SIGNATURE = Object.freeze({ end: 0x06054b50, central: 0x02014b50, local: 0x04034b50, end64: 0x07064b50 });
const END_SIZE = 22;
const CENTRAL_SIZE = 46;
const LOCAL_SIZE = 30;
const MAX_COMMENT = 0xffff;
/** Methods read: 0 stored, 8 deflate. */
const METHODS = new Set([0, 8]);

/** The error of a refused archive. */
const refused = (reason) => new KitError(EXIT.CHECK, "inputs.refused", { reason });

/**
 * The End Of Central Directory record: scanned backwards from the end, over at most the record and its longest
 * comment (65 535 + 22 bytes).
 * @param {Buffer} buf
 * @returns {{ at: number, entries: number, size: number, offset: number }}
 */
function endRecord(buf) {
  if (buf.length < END_SIZE) throw refused("notZip");
  const lowest = Math.max(0, buf.length - END_SIZE - MAX_COMMENT);
  let at = -1;
  for (let i = buf.length - END_SIZE; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === SIGNATURE.end && i + END_SIZE + buf.readUInt16LE(i + 20) <= buf.length) {
      at = i;
      break;
    }
  }
  if (at < 0) throw refused("notZip");
  if (at >= 20 && buf.readUInt32LE(at - 20) === SIGNATURE.end64) throw refused("zip64");
  const disk = buf.readUInt16LE(at + 4);
  const centralDisk = buf.readUInt16LE(at + 6);
  const here = buf.readUInt16LE(at + 8);
  const entries = buf.readUInt16LE(at + 10);
  const size = buf.readUInt32LE(at + 12);
  const offset = buf.readUInt32LE(at + 16);
  if (entries === 0xffff || here === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw refused("zip64");
  if (disk !== 0 || centralDisk !== 0 || here !== entries) throw refused("corrupt");
  if (offset + size > at) throw refused("corrupt");
  return { at, entries, size, offset };
}

/**
 * The records of the central directory: `{ name, flags, method, crc, compressed, size, local }` each, in order.
 * @param {Buffer} buf
 * @param {{ entries: number, size: number, offset: number }} end
 */
function centralRecords(buf, end) {
  const records = [];
  const limit = end.offset + end.size;
  let p = end.offset;
  for (let n = 0; n < end.entries; n++) {
    if (p + CENTRAL_SIZE > limit || buf.readUInt32LE(p) !== SIGNATURE.central) throw refused("corrupt");
    const nameLength = buf.readUInt16LE(p + 28);
    const next = p + CENTRAL_SIZE + nameLength + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    if (next > limit) throw refused("corrupt");
    const record = {
      name: buf.toString("utf8", p + CENTRAL_SIZE, p + CENTRAL_SIZE + nameLength),
      nameBytes: buf.subarray(p + CENTRAL_SIZE, p + CENTRAL_SIZE + nameLength),
      flags: buf.readUInt16LE(p + 8),
      method: buf.readUInt16LE(p + 10),
      crc: buf.readUInt32LE(p + 16),
      compressed: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      local: buf.readUInt32LE(p + 42),
    };
    const zip64 = [record.compressed, record.size, record.local].includes(0xffffffff);
    if (zip64 || buf.readUInt16LE(p + 34) === 0xffff) throw refused("zip64");
    if (buf.readUInt16LE(p + 34) !== 0) throw refused("corrupt");
    records.push(record);
    p = next;
  }
  return records;
}

/**
 * Checks what an entry declares before it is read: not encrypted, a known method, its size and its ratio.
 * @param {{ flags: number, method: number, compressed: number, size: number }} record
 * @param {typeof ZIP_LIMITS} limits
 */
function checkDeclared(record, limits) {
  if (record.flags & 1) throw refused("encrypted");
  if (!METHODS.has(record.method)) throw refused("method");
  if (record.size > limits.maxEntryBytes) throw refused("tooLarge");
  if (record.method === 0 && record.compressed !== record.size) throw refused("corrupt");
  if (record.compressed === 0) {
    if (record.size > 0) throw refused("corrupt");
  } else if (record.size / record.compressed > limits.maxRatio) throw refused("ratio");
}

/**
 * The compressed bytes of an entry, found through its local header, which must match the central record and lie
 * before the central directory.
 * @param {Buffer} buf
 * @param {{ nameBytes: Buffer, local: number, compressed: number }} record
 * @param {number} centralStart
 */
function entryData(buf, record, centralStart) {
  const p = record.local;
  if (p + LOCAL_SIZE > centralStart || buf.readUInt32LE(p) !== SIGNATURE.local) throw refused("corrupt");
  const nameLength = buf.readUInt16LE(p + 26);
  const start = p + LOCAL_SIZE + nameLength + buf.readUInt16LE(p + 28);
  if (nameLength !== record.nameBytes.length || start + record.compressed > centralStart) throw refused("corrupt");
  if (!buf.subarray(p + LOCAL_SIZE, p + LOCAL_SIZE + nameLength).equals(record.nameBytes)) throw refused("corrupt");
  return buf.subarray(start, start + record.compressed);
}

/**
 * Inflates an entry, capped at its declared size + 1 byte; the output must have its declared size and CRC-32.
 * @param {Buffer} data
 * @param {{ method: number, size: number, crc: number }} record
 * @returns {Buffer}
 */
function inflate(data, record) {
  let out;
  if (record.method === 0) out = Buffer.from(data);
  else {
    try {
      out = zlib.inflateRawSync(data, { maxOutputLength: record.size + 1 });
    } catch {
      throw refused("corrupt");
    }
  }
  if (out.length !== record.size || crc32(out) !== record.crc) throw refused("corrupt");
  return out;
}

/**
 * Reads the entries named `names` of a ZIP archive held in memory. An entry not asked for is never inflated; an
 * asked name absent from the archive is simply absent from the result (the caller decides whether it is required).
 * @param {Buffer} buf
 * @param {{ names?: string[], limits?: typeof ZIP_LIMITS }} [options]   `names`: exact entry names
 * @returns {Map<string, Buffer>}
 * @throws {KitError} "inputs.refused", { reason }: notZip, zip64, corrupt, encrypted, method, tooManyEntries,
 *   tooLarge, ratio
 */
export function readZipEntries(buf, { names = [], limits = ZIP_LIMITS } = {}) {
  const end = endRecord(buf);
  if (end.entries > limits.maxEntries) throw refused("tooManyEntries");
  const records = centralRecords(buf, end);
  const seen = new Set();
  for (const r of records) {
    if (seen.has(r.name)) throw refused("corrupt"); // two entries of one name: readers would disagree on which
    seen.add(r.name);
  }
  const asked = records.filter((r) => names.includes(r.name));
  let total = 0;
  for (const r of asked) {
    checkDeclared(r, limits);
    total += r.size;
  }
  if (total > limits.maxTotalBytes) throw refused("tooLarge");
  const out = new Map();
  for (const r of asked) out.set(r.name, inflate(entryData(buf, r, end.offset), r));
  return out;
}
