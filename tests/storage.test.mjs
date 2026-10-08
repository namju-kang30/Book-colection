import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { DEFAULT_TRACKS, DEFAULT_SESSIONS, DEFAULT_TEMPLATE, INITIAL_READING_LOGS } from '../js/defaultData.js';
import { validateBackup, parseBackupJSON, buildRestorePlan, MAX_BACKUP_BYTES } from '../js/backup.js';

class MemoryStorage {
  data = new Map();
  failKey = null;
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { if (key === this.failKey) throw new Error('QuotaExceededError'); this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
  clear() { this.data.clear(); this.failKey = null; }
}
globalThis.localStorage = new MemoryStorage();
globalThis.window = {};
Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
localStorage.setItem('reading_log_supabase_config', JSON.stringify({ url: '', anonKey: '' }));
const api = await import('../js/supabase.js');
const storage = await import('../js/storage.js');
const log = structuredClone(INITIAL_READING_LOGS[0]);
const backup = () => ({ format: 'reading-log-backup', version: 1, exported_at: '2026-10-08T00:00:00.000Z',
  data: { career_tracks: structuredClone(DEFAULT_TRACKS), sessions: structuredClone(DEFAULT_SESSIONS),
    journal_templates: [structuredClone(DEFAULT_TEMPLATE)], reading_logs: [structuredClone(log)] } });

class Query {
  constructor(db, table) { this.db = db; this.table = table; this.operation = 'select'; this.filters = []; this.maximum = Infinity; }
  select() { this.returnRows = true; return this; }
  order() { return this; }
  limit(count) { this.maximum = count; return this; }
  eq(key, val) { this.filters.push(r => r[key] === val); return this; }
  neq(key, val) { this.filters.push(r => r[key] !== val); return this; }
  gt(key, val) { this.filters.push(r => r[key] > val); return this; }
  insert(records) { this.operation = 'insert'; this.records = records; return this; }
  upsert(records, options = {}) { this.operation = 'upsert'; this.records = records; this.options = options; return this; }
  update(updates) { this.operation = 'update'; this.updates = updates; return this; }
  delete() { this.operation = 'delete'; return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; this.optional = true; return this; }
  then(resolve, reject) { return Promise.resolve().then(() => this.execute()).then(resolve, reject); }
  execute() {
    this.db.calls.push([this.table, this.operation]);
    const error = this.db.failure?.(this.table, this.operation);
    if (error) return { data: null, error: { message: error, code: 'TEST_ERROR' } };
    let all = this.db.tables[this.table];
    let result = [];
    const matches = row => this.filters.every(filter => filter(row));
    if (this.operation === 'select') result = all.filter(matches).sort((a, b) => a.id.localeCompare(b.id)).slice(0, this.maximum);
    if (this.operation === 'insert' || this.operation === 'upsert') {
      for (const record of this.records) {
        const found = all.find(row => row.id === record.id);
        if (found && this.options.ignoreDuplicates) continue;
        if (found) Object.assign(found, structuredClone(record)); else all.push(structuredClone(record));
        result.push(structuredClone(record));
      }
    }
    if (this.operation === 'update') result = all.filter(matches).map(row => Object.assign(row, this.updates));
    if (this.operation === 'delete') this.db.tables[this.table] = all.filter(row => !matches(row));
    if (this.one) {
      if (!result.length && !this.optional) return { data: null, error: { message: 'Row not found' } };
      return { data: structuredClone(result[0] ?? null), error: null };
    }
    return { data: structuredClone(result), error: null };
  }
}
function cloud(data = validateBackup(backup()).data) {
  const db = { tables: structuredClone(data), calls: [], failure: null, from(table) { return new Query(this, table); } };
  window.supabase = { createClient() { return db; } };
  api.saveSupabaseConfig('https://example.supabase.co', 'test-public-key');
  return db;
}
function local() {
  localStorage.clear();
  api.saveSupabaseConfig('', '');
  storage.resetToDemoData();
}

test('JSON backup preserves logs, Korean text, PIN hashes, likes and dates; strips unknown DB columns', () => {
  const restored = parseBackupJSON('\uFEFF' + JSON.stringify(backup()));
  assert.deepEqual(restored.data.reading_logs[0], log);
  assert.equal(restored.data.career_tracks[0].bgColor, undefined);
  assert.deepEqual(parseBackupJSON(JSON.stringify(restored)), restored);
});
test('reject malformed JSON, version, duplicate IDs, dangling references, bad dates and malicious keys before writing', () => {
  assert.throws(() => parseBackupJSON('{broken'), /JSON/);
  for (const mutate of [
    b => b.version = 2,
    b => b.data.reading_logs.push(b.data.reading_logs[0]),
    b => b.data.sessions = [],
    b => b.data.sessions[0].date = '2026-02-30',
    b => b.data.reading_logs[0].student_info.password_hash = '1234',
    b => b.data.journal_templates[0].fields[0].id = 'x" onfocus="alert(1)',
    b => b.data.journal_templates[0].fields.push(b.data.journal_templates[0].fields[0]),
    b => b.data.reading_logs[0].likes_count = -1,
    b => b.data.reading_logs[0].content = JSON.parse('{"__proto__":"bad"}')
  ]) {
    const value = backup(); mutate(value); assert.throws(() => validateBackup(value));
  }
});
test('reject oversized input and accept empty database and deleted nullable references', () => {
  assert.throws(() => parseBackupJSON(' '.repeat(MAX_BACKUP_BYTES + 1)), /20MB/);
  const value = backup(); for (const key of Object.keys(value.data)) value.data[key] = [];
  assert.equal(validateBackup(value).data.reading_logs.length, 0);
  const deleted = backup(); deleted.data.reading_logs[0].track_id = null; deleted.data.reading_logs[0].session_id = null;
  assert.equal(validateBackup(deleted).data.reading_logs[0].track_id, null);
});
test('restore plans preserve existing logs and active template settings', () => {
  const old = validateBackup(backup()); const incoming = validateBackup(backup());
  incoming.data.reading_logs[0].content.field_book = 'overwritten';
  assert.equal(buildRestorePlan(incoming, old).data.reading_logs.length, 0);
  incoming.data.journal_templates[0].id = '33333333-0002-4000-8000-000000000002';
  assert.equal(buildRestorePlan(incoming, old).data.journal_templates[0].is_active, false);
});
test('local backup/import round trip preserves student authentication and is idempotent', async () => {
  local();
  const exported = await storage.exportReadingLogBackup();
  localStorage.setItem('reading_log_entries', '[]');
  assert.equal((await storage.importReadingLogBackup(exported)).added, 5);
  assert.equal((await storage.importReadingLogBackup(exported)).added, 0);
  assert.deepEqual((await storage.exportReadingLogBackup()).data.reading_logs, exported.data.reading_logs);
});
test('invalid imports never alter local data', async () => {
  local(); const before = new Map(localStorage.data);
  const invalid = backup(); invalid.data.reading_logs[0].id = 'not-uuid';
  await assert.rejects(storage.importReadingLogBackup(invalid));
  assert.deepEqual(localStorage.data, before);
});
test('local restore rolls back metadata and logs on quota failure', async () => {
  local(); const before = new Map(localStorage.data);
  const value = backup(); value.data.career_tracks[0].id = '11111111-0009-4000-8000-000000000009';
  localStorage.failKey = 'reading_log_entries';
  await assert.rejects(storage.importReadingLogBackup(value), /저장 공간/);
  assert.deepEqual(localStorage.data, before);
  localStorage.failKey = null;
});
test('local submit, edit, delete and retries work without duplicate entries', async () => {
  local(); const input = { ...log, id: '44444444-9999-4000-8000-000000000099' };
  const created = await storage.createReadingLog(input);
  await storage.createReadingLog(input);
  assert.equal((await storage.getReadingLogs()).filter(l => l.id === created.id).length, 1);
  await storage.updateReadingLog(created.id, { content: { field_book: '수정된 도서' } });
  assert.equal((await storage.getReadingLogs()).find(l => l.id === created.id).content.field_book, '수정된 도서');
  await storage.deleteReadingLog(created.id);
  assert.equal((await storage.getReadingLogs()).some(l => l.id === created.id), false);
});
test('local submit validates session, track and PIN; quota failure never reports success', async () => {
  local();
  await assert.rejects(storage.createReadingLog({ ...log, session_id: DEFAULT_SESSIONS[3].id }), /마감/);
  await assert.rejects(storage.createReadingLog({ ...log, track_id: 'unknown' }), /계열/);
  await assert.rejects(storage.createReadingLog({ ...log, student_info: { password_hash: '' } }), /비밀번호/);
  localStorage.failKey = 'reading_log_entries';
  await assert.rejects(storage.createReadingLog({ ...log, id: '44444444-9999-4000-8000-000000000099' }), /저장 공간/);
  localStorage.failKey = null;
});
test('cloud insert errors are surfaced without creating a local-only submission', async () => {
  local(); const before = localStorage.getItem('reading_log_entries');
  const db = cloud(); db.failure = (table, op) => table === 'reading_logs' && op === 'upsert' ? 'Network failure' : null;
  await assert.rejects(storage.createReadingLog(log), /Network failure/);
  assert.equal(localStorage.getItem('reading_log_entries'), before);
});
test('cloud success survives cache quota errors and same-ID retries are idempotent', async () => {
  local(); const db = cloud(); localStorage.failKey = 'reading_log_entries';
  const input = { ...log, id: '44444444-9999-4000-8000-000000000099' };
  const saved = await storage.createReadingLog(input);
  assert.equal(saved.id, input.id);
  await storage.createReadingLog(input);
  assert.equal(db.tables.reading_logs.filter(row => row.id === input.id).length, 1);
  localStorage.failKey = null;
});
test('cloud update and delete errors leave the original data unchanged', async () => {
  local(); const db = cloud();
  db.failure = (table, op) => table === 'reading_logs' && op !== 'select' ? 'Permission denied' : null;
  await assert.rejects(storage.updateReadingLog(log.id, { content: {} }), /Permission/);
  await assert.rejects(storage.deleteReadingLog(log.id), /Permission/);
  assert.deepEqual(db.tables.reading_logs[0], log);
});
test('backup fetches every page beyond 1,000 rows, and accepts an empty cloud table', async () => {
  local(); const db = cloud();
  db.tables.reading_logs = Array.from({ length: 1205 }, (_, n) => ({ ...structuredClone(log), id: `44444444-0001-4000-8000-${String(n).padStart(12, '0')}` }));
  assert.equal((await storage.exportReadingLogBackup()).data.reading_logs.length, 1205);
  assert.equal(db.calls.filter(([table, op]) => table === 'reading_logs' && op === 'select').length, 3);
  db.tables.career_tracks = []; db.tables.sessions = []; db.tables.journal_templates = []; db.tables.reading_logs = [];
  assert.equal((await storage.getCareerTracks()).length, 0);
  assert.equal((await storage.getSessions()).length, 0);
  assert.equal((await storage.getActiveTemplate()).is_active, false);
});
test('failed cloud backup does not export stale cache; missing SDK cannot submit locally', async () => {
  local(); const db = cloud(); db.failure = () => 'Offline';
  await assert.rejects(storage.exportReadingLogBackup(), /Offline/);
  window.supabase = undefined; api.saveSupabaseConfig('https://example.supabase.co', 'test-key');
  await assert.rejects(storage.createReadingLog(log), /라이브러리/);
});
test('cloud import adds dependencies first, preserves existing data and safely resumes after failure', async () => {
  local(); const empty = backup().data; for (const key of Object.keys(empty)) empty[key] = [];
  const db = cloud(empty);
  db.failure = (table, op) => table === 'sessions' && op === 'upsert' ? 'Temporary failure' : null;
  await assert.rejects(storage.importReadingLogBackup(backup()), /일부 데이터/);
  assert.equal(db.tables.reading_logs.length, 0);
  assert.equal(db.tables.career_tracks.length, 8);
  db.failure = null;
  assert.equal((await storage.importReadingLogBackup(backup())).added, 1);
  db.tables.reading_logs[0].content.field_book = '교사의 최신 수정';
  assert.equal((await storage.importReadingLogBackup(backup())).added, 0);
  assert.equal(db.tables.reading_logs[0].content.field_book, '교사의 최신 수정');
});
test('DB errors cannot be reported as connected using a local auth session', async () => {
  local(); const db = cloud(); db.failure = () => 'Permission denied';
  assert.equal((await api.testSupabaseConnection('https://example.supabase.co', 'key')).success, false);
});

test('large cloud restores use small batches and resume partial log imports without duplicates', async () => {
  local(); const value = backup();
  value.data.reading_logs = Array.from({ length: 601 }, (_, n) => ({ ...structuredClone(log), id: `44444444-0001-4000-8000-${String(n).padStart(12, '0')}` }));
  const empty = backup().data; for (const key of Object.keys(empty)) empty[key] = [];
  const db = cloud(empty);
  let calls = 0;
  db.failure = (table, op) => table === 'reading_logs' && op === 'upsert' && ++calls === 2 ? 'Second batch failed' : null;
  await assert.rejects(storage.importReadingLogBackup(value), /일지 250건 확인/);
  assert.equal(db.tables.reading_logs.length, 250);
  db.failure = null;
  assert.equal((await storage.importReadingLogBackup(value)).added, 351);
  assert.equal(new Set(db.tables.reading_logs.map(row => row.id)).size, 601);
});
test('session deletion removes dependent local logs; career deletion preserves them with null references', async () => {
  local();
  await storage.deleteCareerTrack(log.track_id);
  assert.equal((await storage.getReadingLogs()).find(row => row.id === log.id).track_id, null);
  await storage.deleteSession(log.session_id);
  assert.equal((await storage.getReadingLogs()).some(row => row.id === log.id), false);
});
test('likes failures keep the current browser like state unchanged', async () => {
  local(); const db = cloud();
  db.failure = (table, op) => table === 'reading_logs' && op === 'update' ? 'Denied' : null;
  await assert.rejects(storage.toggleLikeReadingLog(log.id), /Denied/);
  assert.equal(storage.isLogLikedByUser(log.id), false);
});
