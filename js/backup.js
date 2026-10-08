/** JSON 검증과 병합 계획. 쓰기 전에 파일 전체를 검증한다. */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);
const tables = ['career_tracks', 'sessions', 'journal_templates', 'reading_logs'];
function fail(message) { throw new Error(`올바른 독서일지 백업 파일이 아닙니다: ${message}`); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 형식 오류`);
  if (Object.keys(value).some(key => unsafeKeys.has(key))) fail(`${label}에 허용되지 않은 키가 있습니다.`);
  return value;
}
function text(value, label, required = true) {
  if (typeof value !== 'string' || (required && !value.trim())) fail(`${label} 값이 없습니다.`);
  return value;
}
function uuid(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !UUID.test(value)) fail(`${label} ID 형식 오류`);
  return value.toLowerCase();
}
function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) fail(`${label} 날짜 오류`);
  return new Date(value).toISOString();
}
function bool(value, label) { if (typeof value !== 'boolean') fail(`${label} 형식 오류`); return value; }
function fields(value) {
  if (!Array.isArray(value) || value.length > 200) fail('양식 질문 형식 오류');
  const seen = new Set();
  return value.map(item => {
    object(item, '질문');
    const id = text(item.id, '질문 ID');
    if (!/^[A-Za-z0-9_-]+$/.test(id) || unsafeKeys.has(id) || seen.has(id)) fail('중복되거나 잘못된 질문 ID');
    seen.add(id);
    if (!['text', 'textarea', 'number', 'rating'].includes(item.type)) fail('지원하지 않는 질문 유형');
    return { id, label: text(item.label, '질문 이름'), type: item.type,
      required: bool(item.required, '필수 여부'), placeholder: text(item.placeholder ?? '', '안내 문구', false) };
  });
}
export function validateBackup(input) {
  object(input, '백업');
  if (input.format !== 'reading-log-backup' || input.version !== 1) fail('지원하지 않는 파일 형식 또는 버전');
  object(input.data, '데이터');
  const data = {};
  for (const table of tables) {
    const records = input.data[table];
    if (!Array.isArray(records) || records.length > 100000) fail(`${table} 목록 형식 오류 또는 너무 많은 항목`);
    const seen = new Set();
    data[table] = records.map(record => {
      object(record, table);
      const id = uuid(record.id, table);
      if (seen.has(id)) fail(`${table}의 중복 ID`);
      seen.add(id);
      const created_at = timestamp(record.created_at ?? input.exported_at, table);
      if (table === 'career_tracks') {
        const color = record.color ?? '#4F46E5';
        if (!/^#[0-9a-f]{6}$/i.test(color)) fail('진로 색상 형식 오류');
        const order_num = record.order_num ?? 0;
        if (!Number.isInteger(order_num) || order_num < 0 || order_num > 2147483647) fail('진로 순서 오류');
        const icon = record.icon ?? 'BookOpen';
        if (typeof icon !== 'string' || !/^[A-Za-z0-9-]+$/.test(icon)) fail('아이콘 형식 오류');
        return { id, name: text(record.name, '진로 이름'), color, icon, order_num, created_at };
      }
      if (table === 'sessions') {
        const date = text(record.date, '차시 날짜');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail('차시 날짜 오류');
        return { id, title: text(record.title, '차시 이름'), date, is_active: bool(record.is_active, '차시 활성 상태'), created_at };
      }
      if (table === 'journal_templates') return { id, title: text(record.title, '양식 이름'),
        fields: fields(record.fields), is_active: bool(record.is_active, '양식 활성 상태'), created_at };
      object(record.student_info, '학생 정보');
      const student_info = { student_id: text(record.student_info.student_id, '학번'), name: text(record.student_info.name, '학생 이름') };
      const hash = record.student_info.password_hash;
      if (hash !== undefined && hash !== '') {
        if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/i.test(hash)) fail('비밀번호 해시 오류');
        student_info.password_hash = hash.toLowerCase();
      }
      object(record.content, '일지 내용');
      const content = {};
      for (const [key, val] of Object.entries(record.content)) {
        if (!/^[A-Za-z0-9_-]+$/.test(key) || unsafeKeys.has(key)) fail('일지 항목 ID 오류');
        if (!(typeof val === 'string' || typeof val === 'number' && Number.isFinite(val) || val === null)) fail('일지 항목 값 오류');
        content[key] = val;
      }
      const likes_count = record.likes_count ?? 0;
      if (!Number.isInteger(likes_count) || likes_count < 0 || likes_count > 2147483647) fail('공감 수 오류');
      return { id, track_id: uuid(record.track_id, '진로', true), session_id: uuid(record.session_id, '차시', true),
        student_info, content, likes_count, created_at };
    });
  }
  // 삭제된 계열/차시는 null이며, 나머지 참조는 파일 안에 반드시 존재해야 한다.
  const tracks = new Set(data.career_tracks.map(t => t.id));
  const sessions = new Set(data.sessions.map(s => s.id));
  for (const log of data.reading_logs) {
    if (log.track_id && !tracks.has(log.track_id)) fail('일지가 참조하는 진로 계열이 없습니다.');
    if (log.session_id && !sessions.has(log.session_id)) fail('일지가 참조하는 활동 차시가 없습니다.');
  }
  return { format: 'reading-log-backup', version: 1, exported_at: timestamp(input.exported_at, '백업 생성'), data };
}
export function parseBackupJSON(textValue) {
  if (new TextEncoder().encode(textValue).byteLength > MAX_BACKUP_BYTES) fail('파일은 20MB 이하여야 합니다.');
  let value;
  try { value = JSON.parse(textValue.replace(/^\uFEFF/, '')); } catch { fail('JSON 문법 오류'); }
  return validateBackup(value);
}
export function buildRestorePlan(backup, current) {
  const data = {};
  for (const table of tables) {
    const existing = new Set(current.data[table].map(row => row.id));
    data[table] = backup.data[table].filter(row => !existing.has(row.id)).map(row => structuredClone(row));
  }
  // 기존 양식과 차시 설정은 덮어쓰지 않는다. 빈 DB에서는 백업의 최신 활성 양식을 사용한다.
  const existingActive = current.data.journal_templates.some(t => t.is_active);
  const activeId = existingActive ? null : data.journal_templates.filter(t => t.is_active)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]?.id;
  data.journal_templates.forEach(t => { t.is_active = t.id === activeId; });
  return { data };
}
export function downloadBackup(backup) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `독서일지_백업_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
