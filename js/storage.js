/** Supabase 저장 실패를 로컬 제출 성공으로 처리하지 않는다. */
import { getSupabaseClient, getSupabaseConfig } from './supabase.js';
import { DEFAULT_TRACKS, DEFAULT_SESSIONS, DEFAULT_TEMPLATE, INITIAL_READING_LOGS } from './defaultData.js';
import { validateBackup, buildRestorePlan } from './backup.js';

const KEYS = { career_tracks: 'reading_log_tracks', sessions: 'reading_log_sessions',
  journal_templates: 'reading_log_template', reading_logs: 'reading_log_entries' };
const LIKES_KEY = 'reading_log_user_likes';
const warnings = new Map();
const PAGE_SIZE = 500;

export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}
export function isCloudConfigured() {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.anonKey);
}
export function getStorageWarnings() { return [...warnings.values()]; }
function clientForWrite() {
  const client = getSupabaseClient();
  if (isCloudConfigured() && !client) throw new Error('서버 연결 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 제출해 주세요. 작성 내용은 유지됩니다.');
  return client;
}
function readLocal(table) {
  try {
    const raw = localStorage.getItem(KEYS[table]);
    if (raw === null) return table === 'journal_templates' ? DEFAULT_TEMPLATE : [];
    const data = JSON.parse(raw);
    if (table === 'journal_templates' ? !data || !Array.isArray(data.fields) : !Array.isArray(data)) throw new Error('형식 오류');
    return data;
  } catch { throw new Error('브라우저 저장 데이터를 읽을 수 없습니다. 기존 데이터를 삭제하지 말고 관리자에게 문의해 주세요.'); }
}
function writeLocal(table, data) {
  try { localStorage.setItem(KEYS[table], JSON.stringify(data)); }
  catch { throw new Error('브라우저 저장 공간이 부족하거나 저장이 차단되었습니다. 작성 내용을 복사해 보관한 뒤 다시 시도해 주세요.'); }
}
function cache(table, data) {
  try { localStorage.setItem(KEYS[table], JSON.stringify(data)); }
  catch (error) { console.warn('로컬 캐시 저장 실패 (서버 저장은 완료됨)', error); }
}
function cacheLog(log) {
  try { cache('reading_logs', [log, ...readLocal('reading_logs').filter(row => row.id !== log.id)]); }
  catch (error) { console.warn('로컬 캐시 읽기 실패', error); }
}
function localDefaults() {
  const defaults = { career_tracks: DEFAULT_TRACKS, sessions: DEFAULT_SESSIONS,
    journal_templates: DEFAULT_TEMPLATE, reading_logs: isCloudConfigured() ? [] : INITIAL_READING_LOGS };
  for (const [table, data] of Object.entries(defaults)) {
    try { if (localStorage.getItem(KEYS[table]) === null) writeLocal(table, data); }
    catch (error) { console.warn(error.message); }
  }
}
localDefaults();
function checkResult(result) {
  if (result.error) throw new Error(result.error.message || '서버 요청에 실패했습니다.');
  return result.data;
}
/** ID 순서로 끝까지 조회하여 Supabase 기본 1,000행 제한을 피한다. */
async function cloudRows(client, table) {
  const result = [];
  let lastId = null;
  while (true) {
    let query = client.from(table).select('*').order('id', { ascending: true }).limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    const page = checkResult(await query);
    if (!Array.isArray(page)) throw new Error('서버 응답 형식이 올바르지 않습니다.');
    result.push(...page);
    if (page.length < PAGE_SIZE) return result;
    lastId = page[page.length - 1].id;
  }
}
async function rows(table, { strict = false } = {}) {
  let client;
  try {
    client = clientForWrite();
    if (client) {
      const data = await cloudRows(client, table);
      if (table !== 'journal_templates') cache(table, data);
      warnings.delete(table);
      return data;
    }
  } catch (error) {
    warnings.set(table, '서버 데이터를 불러오지 못해 최근 저장된 목록을 표시합니다. 제출 완료 여부는 서버 저장 결과로 확인됩니다.');
    if (strict) throw error;
  }
  if (!isCloudConfigured()) warnings.delete(table);
  const data = readLocal(table);
  return table === 'journal_templates' ? [data] : data;
}
export async function getCareerTracks(options) {
  return (await rows('career_tracks', options)).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
}
export async function getSessions(options) {
  return (await rows('sessions', options)).sort((a, b) => a.date.localeCompare(b.date));
}
export async function getActiveTemplate(options) {
  const templates = await rows('journal_templates', options);
  const active = templates.filter(t => t.is_active).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  if (active) { cache('journal_templates', active); return active; }
  return { title: '등록된 양식 없음', fields: [], is_active: false };
}
export async function getReadingLogs(trackId = null, sessionId = null, options) {
  let logs = await rows('reading_logs', options);
  if (trackId && trackId !== 'all') logs = logs.filter(l => l.track_id === trackId);
  if (sessionId && sessionId !== 'all') logs = logs.filter(l => l.session_id === sessionId);
  return logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
async function createRow(table, row) {
  const client = clientForWrite();
  if (client) {
    const data = checkResult(await client.from(table).insert([row]).select().single());
    if (!data) throw new Error('서버에서 저장 결과를 확인할 수 없습니다.');
    return data;
  }
  writeLocal(table, [...readLocal(table), row]);
  return row;
}
async function updateRow(table, id, updates) {
  const client = clientForWrite();
  if (client) {
    const data = checkResult(await client.from(table).update(updates).eq('id', id).select().single());
    if (!data) throw new Error('수정할 데이터를 찾을 수 없습니다.');
    return data;
  }
  const list = readLocal(table);
  if (!list.some(row => row.id === id)) throw new Error('수정할 데이터를 찾을 수 없습니다.');
  const next = list.map(row => row.id === id ? { ...row, ...updates } : row);
  writeLocal(table, next);
  return next.find(row => row.id === id);
}
async function deleteRow(table, id) {
  const client = clientForWrite();
  if (client) checkResult(await client.from(table).delete().eq('id', id));
  else writeLocal(table, readLocal(table).filter(row => row.id !== id));
  if (client) { try { cache(table, readLocal(table).filter(row => row.id !== id)); } catch {} }
  return true;
}
export function createCareerTrack(track) {
  return createRow('career_tracks', { id: track.id || generateUUID(), name: track.name, color: track.color,
    icon: track.icon || 'BookOpen', order_num: track.order_num || 0, created_at: new Date().toISOString() });
}
export function updateCareerTrack(id, updates) { return updateRow('career_tracks', id, updates); }
export async function deleteCareerTrack(id) {
  await deleteRow('career_tracks', id);
  try {
    const logs = readLocal('reading_logs').map(l => l.track_id === id ? { ...l, track_id: null } : l);
    if (isCloudConfigured()) cache('reading_logs', logs); else writeLocal('reading_logs', logs);
  } catch (error) { if (!isCloudConfigured()) throw error; }
  return true;
}
export function createSession(session) {
  return createRow('sessions', { ...session, id: session.id || generateUUID(),
    is_active: session.is_active ?? true, created_at: new Date().toISOString() });
}
export function updateSession(id, updates) { return updateRow('sessions', id, updates); }
export async function deleteSession(id) {
  await deleteRow('sessions', id);
  try {
    const remaining = readLocal('reading_logs').filter(l => l.session_id !== id);
    if (isCloudConfigured()) cache('reading_logs', remaining); else writeLocal('reading_logs', remaining);
  } catch (error) { if (!isCloudConfigured()) throw error; }
  return true;
}
export async function saveTemplate(template) {
  const updated = { ...template, id: template.id || generateUUID(), is_active: true, created_at: new Date().toISOString() };
  const client = clientForWrite();
  if (client) {
    const data = checkResult(await client.from('journal_templates').upsert([updated]).select().single());
    checkResult(await client.from('journal_templates').update({ is_active: false }).neq('id', updated.id));
    cache('journal_templates', data);
    return data;
  }
  writeLocal('journal_templates', updated);
  return updated;
}
export async function createReadingLog(logData) {
  const [tracks, sessions] = await Promise.all([getCareerTracks({ strict: true }), getSessions({ strict: true })]);
  if (!tracks.some(t => t.id === logData.track_id)) throw new Error('선택한 진로 계열이 삭제되었습니다. 다시 선택해 주세요.');
  const session = sessions.find(s => s.id === logData.session_id);
  if (!session || !session.is_active) throw new Error('선택한 차시가 마감되었거나 삭제되었습니다. 진행 중인 차시를 선택해 주세요.');
  const newLog = { id: logData.id || generateUUID(), track_id: logData.track_id, session_id: logData.session_id,
    student_info: logData.student_info, content: logData.content, likes_count: 0, created_at: new Date().toISOString() };
  if (!/^[a-f0-9]{64}$/i.test(newLog.student_info?.password_hash || '')) throw new Error('비밀번호를 안전하게 저장할 수 없습니다. HTTPS 주소로 접속해 주세요.');
  const client = clientForWrite();
  if (client) {
    // 응답 전 연결이 끊겨도 같은 ID로 재시도하면 중복이 생기지 않는다.
    let data = checkResult(await client.from('reading_logs').upsert([newLog], { onConflict: 'id', ignoreDuplicates: true }).select().maybeSingle());
    if (!data) data = checkResult(await client.from('reading_logs').select('*').eq('id', newLog.id).single());
    if (!data) throw new Error('서버에서 저장 결과를 확인할 수 없습니다. 같은 화면에서 다시 제출해 주세요.');
    cacheLog(data);
    return data;
  }
  const list = readLocal('reading_logs');
  const existing = list.find(row => row.id === newLog.id);
  if (existing) return existing;
  writeLocal('reading_logs', [newLog, ...list]);
  return newLog;
}
export async function updateReadingLog(id, updates) {
  const data = await updateRow('reading_logs', id, updates);
  if (isCloudConfigured()) cacheLog(data);
  return data;
}
export function deleteReadingLog(id) { return deleteRow('reading_logs', id); }
export async function toggleLikeReadingLog(id) {
  let likedIds;
  try { likedIds = JSON.parse(localStorage.getItem(LIKES_KEY) || '[]'); } catch { likedIds = []; }
  if (!Array.isArray(likedIds)) likedIds = [];
  const nextLiked = !likedIds.includes(id);
  const target = (await getReadingLogs(null, null, { strict: true })).find(l => l.id === id);
  if (!target) throw new Error('일지를 찾을 수 없습니다. 목록을 새로고침해 주세요.');
  const count = Math.max(0, (Number(target.likes_count) || 0) + (nextLiked ? 1 : -1));
  await updateReadingLog(id, { likes_count: count });
  try { localStorage.setItem(LIKES_KEY, JSON.stringify(nextLiked ? [...likedIds, id] : likedIds.filter(x => x !== id))); } catch {}
  return { liked: nextLiked, count };
}
export function isLogLikedByUser(id) {
  try { const ids = JSON.parse(localStorage.getItem(LIKES_KEY) || '[]'); return Array.isArray(ids) && ids.includes(id); }
  catch { return false; }
}
export async function exportReadingLogBackup() {
  const [career_tracks, sessions, journal_templates, reading_logs] = await Promise.all([
    rows('career_tracks', { strict: true }), rows('sessions', { strict: true }),
    rows('journal_templates', { strict: true }), rows('reading_logs', { strict: true })
  ]);
  return validateBackup({ format: 'reading-log-backup', version: 1, exported_at: new Date().toISOString(),
    data: { career_tracks, sessions, journal_templates, reading_logs } });
}
export async function importReadingLogBackup(input) {
  const backup = validateBackup(input);
  const current = await exportReadingLogBackup();
  const plan = buildRestorePlan(backup, current);
  const client = clientForWrite();
  let added = plan.data.reading_logs.length;
  if (client) {
    // 의존 데이터를 먼저 추가한다. 작은 요청으로 나누며 기존 ID는 유지한다.
    let completed = false;
    added = 0;
    try {
      for (const table of ['career_tracks', 'sessions', 'journal_templates', 'reading_logs']) {
        for (let offset = 0; offset < plan.data[table].length; offset += 250) {
          const batch = plan.data[table].slice(offset, offset + 250);
          const inserted = checkResult(await client.from(table).upsert(batch, { onConflict: 'id', ignoreDuplicates: true }).select('id'));
          if (!Array.isArray(inserted)) throw new Error('서버에서 불러오기 결과를 확인할 수 없습니다.');
          if (table === 'reading_logs') added += inserted.length;
          completed = true;
        }
      }
    } catch (error) {
      throw new Error(`${completed ? `일부 데이터가 추가되었습니다(일지 ${added}건 확인). ` : ''}불러오기를 완료하지 못했습니다: ${error.message} 같은 파일로 다시 시도할 수 있습니다. 기존 일지는 유지됩니다.`);
    }
  } else {
    const original = Object.fromEntries(Object.values(KEYS).map(key => [key, localStorage.getItem(key)]));
    try {
      for (const table of ['career_tracks', 'sessions', 'reading_logs']) writeLocal(table, [...current.data[table], ...plan.data[table]]);
      const template = [...current.data.journal_templates, ...plan.data.journal_templates].find(t => t.is_active);
      if (template) writeLocal('journal_templates', template);
    } catch (error) {
      for (const [key, value] of Object.entries(original)) {
        try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch {}
      }
      throw error;
    }
  }
  return { added, skipped: backup.data.reading_logs.length - added };
}
export function subscribeToRealtimeLogs(onInsert, onUpdate, onDelete) {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    return client.channel('public:reading_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reading_logs' }, p => onInsert?.(p.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reading_logs' }, p => onUpdate?.(p.new))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reading_logs' }, p => onDelete?.(p.old)).subscribe();
  } catch (error) { console.warn('Realtime subscription failed', error); return null; }
}
export function resetToDemoData() {
  writeLocal('career_tracks', DEFAULT_TRACKS); writeLocal('sessions', DEFAULT_SESSIONS);
  writeLocal('journal_templates', DEFAULT_TEMPLATE); writeLocal('reading_logs', INITIAL_READING_LOGS);
  localStorage.removeItem(LIKES_KEY);
  return true;
}
