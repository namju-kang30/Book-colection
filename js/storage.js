/**
 * 통합 데이터 스토리지 서비스 (Supabase + LocalStorage 하이브리드)
 */

import { getSupabaseClient } from './supabase.js';
import { DEFAULT_TRACKS, DEFAULT_SESSIONS, DEFAULT_TEMPLATE, INITIAL_READING_LOGS } from './defaultData.js';

const LS_KEY_TRACKS = 'reading_log_tracks';
const LS_KEY_SESSIONS = 'reading_log_sessions';
const LS_KEY_TEMPLATE = 'reading_log_template';
const LS_KEY_LOGS = 'reading_log_entries';
const LS_KEY_LIKES = 'reading_log_user_likes';

// 로컬 스토리지 초기화
function initLocalStorage() {
  if (!localStorage.getItem(LS_KEY_TRACKS)) {
    localStorage.setItem(LS_KEY_TRACKS, JSON.stringify(DEFAULT_TRACKS));
  }
  if (!localStorage.getItem(LS_KEY_SESSIONS)) {
    localStorage.setItem(LS_KEY_SESSIONS, JSON.stringify(DEFAULT_SESSIONS));
  }
  if (!localStorage.getItem(LS_KEY_TEMPLATE)) {
    localStorage.setItem(LS_KEY_TEMPLATE, JSON.stringify(DEFAULT_TEMPLATE));
  }
  if (!localStorage.getItem(LS_KEY_LOGS)) {
    localStorage.setItem(LS_KEY_LOGS, JSON.stringify(INITIAL_READING_LOGS));
  }
}
initLocalStorage();

/**
 * 1. 진로 계열 (Career Tracks)
 */
export async function getCareerTracks() {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('career_tracks')
        .select('*')
        .order('order_num', { ascending: true })
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        localStorage.setItem(LS_KEY_TRACKS, JSON.stringify(data));
        return data;
      }
    } catch (e) {
      console.warn('Supabase getCareerTracks error, fallback to local', e);
    }
  }

  try {
    const raw = localStorage.getItem(LS_KEY_TRACKS);
    return raw ? JSON.parse(raw) : DEFAULT_TRACKS;
  } catch {
    return DEFAULT_TRACKS;
  }
}

export async function createCareerTrack(track) {
  const newTrack = {
    ...track,
    id: track.id || `track-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    created_at: new Date().toISOString()
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('career_tracks')
        .insert([newTrack])
        .select()
        .single();
      if (!error && data) {
        // Also update local cache
        const list = await getCareerTracks();
        localStorage.setItem(LS_KEY_TRACKS, JSON.stringify([...list, data]));
        return data;
      }
    } catch (e) {
      console.warn('Supabase insert track error', e);
    }
  }

  const list = await getCareerTracks();
  const updated = [...list, newTrack];
  localStorage.setItem(LS_KEY_TRACKS, JSON.stringify(updated));
  return newTrack;
}

export async function updateCareerTrack(id, updates) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('career_tracks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) {
        return data;
      }
    } catch (e) {
      console.warn('Supabase update track error', e);
    }
  }

  const list = await getCareerTracks();
  const updated = list.map(t => t.id === id ? { ...t, ...updates } : t);
  localStorage.setItem(LS_KEY_TRACKS, JSON.stringify(updated));
  return updated.find(t => t.id === id);
}

export async function deleteCareerTrack(id) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('career_tracks').delete().eq('id', id);
    } catch (e) {
      console.warn('Supabase delete track error', e);
    }
  }

  const list = await getCareerTracks();
  const updated = list.filter(t => t.id !== id);
  localStorage.setItem(LS_KEY_TRACKS, JSON.stringify(updated));
  return true;
}

/**
 * 2. 활동 차시 (Sessions)
 */
export async function getSessions() {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .order('date', { ascending: true });

      if (!error && data && data.length > 0) {
        localStorage.setItem(LS_KEY_SESSIONS, JSON.stringify(data));
        return data;
      }
    } catch (e) {
      console.warn('Supabase getSessions error, fallback to local', e);
    }
  }

  try {
    const raw = localStorage.getItem(LS_KEY_SESSIONS);
    return raw ? JSON.parse(raw) : DEFAULT_SESSIONS;
  } catch {
    return DEFAULT_SESSIONS;
  }
}

export async function createSession(session) {
  const newSession = {
    ...session,
    id: session.id || `session-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    is_active: session.is_active !== undefined ? session.is_active : true,
    created_at: new Date().toISOString()
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .insert([newSession])
        .select()
        .single();
      if (!error && data) {
        return data;
      }
    } catch (e) {
      console.warn('Supabase insert session error', e);
    }
  }

  const list = await getSessions();
  const updated = [...list, newSession];
  localStorage.setItem(LS_KEY_SESSIONS, JSON.stringify(updated));
  return newSession;
}

export async function updateSession(id, updates) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) {
        return data;
      }
    } catch (e) {
      console.warn('Supabase update session error', e);
    }
  }

  const list = await getSessions();
  const updated = list.map(s => s.id === id ? { ...s, ...updates } : s);
  localStorage.setItem(LS_KEY_SESSIONS, JSON.stringify(updated));
  return updated.find(s => s.id === id);
}

export async function deleteSession(id) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('sessions').delete().eq('id', id);
    } catch (e) {
      console.warn('Supabase delete session error', e);
    }
  }

  const list = await getSessions();
  const updated = list.filter(s => s.id !== id);
  localStorage.setItem(LS_KEY_SESSIONS, JSON.stringify(updated));
  return true;
}

/**
 * 3. 공통 독서 일지 양식 (Journal Templates)
 */
export async function getActiveTemplate() {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('journal_templates')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        localStorage.setItem(LS_KEY_TEMPLATE, JSON.stringify(data));
        return data;
      }
    } catch (e) {
      console.warn('Supabase getActiveTemplate error', e);
    }
  }

  try {
    const raw = localStorage.getItem(LS_KEY_TEMPLATE);
    return raw ? JSON.parse(raw) : DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

export async function saveTemplate(template) {
  const updatedTemplate = {
    ...template,
    id: template.id || `template-${Date.now()}`,
    is_active: true,
    created_at: new Date().toISOString()
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      // 기존 active 템플릿 비활성화 또는 upsert
      await supabase
        .from('journal_templates')
        .update({ is_active: false })
        .neq('id', updatedTemplate.id);

      const { data, error } = await supabase
        .from('journal_templates')
        .upsert([updatedTemplate])
        .select()
        .single();

      if (!error && data) {
        localStorage.setItem(LS_KEY_TEMPLATE, JSON.stringify(data));
        return data;
      }
    } catch (e) {
      console.warn('Supabase saveTemplate error', e);
    }
  }

  localStorage.setItem(LS_KEY_TEMPLATE, JSON.stringify(updatedTemplate));
  return updatedTemplate;
}

/**
 * 4. 학생 독서 일지 (Reading Logs)
 */
export async function getReadingLogs(trackId = null, sessionId = null) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      let query = supabase
        .from('reading_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (trackId && trackId !== 'all') {
        query = query.eq('track_id', trackId);
      }
      if (sessionId && sessionId !== 'all') {
        query = query.eq('session_id', sessionId);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data;
      }
    } catch (e) {
      console.warn('Supabase getReadingLogs error, fallback to local', e);
    }
  }

  try {
    const raw = localStorage.getItem(LS_KEY_LOGS);
    let list = raw ? JSON.parse(raw) : INITIAL_READING_LOGS;

    if (trackId && trackId !== 'all') {
      list = list.filter(l => l.track_id === trackId);
    }
    if (sessionId && sessionId !== 'all') {
      list = list.filter(l => l.session_id === sessionId);
    }

    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch {
    return INITIAL_READING_LOGS;
  }
}

export async function createReadingLog(logData) {
  const newLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    track_id: logData.track_id,
    session_id: logData.session_id,
    student_info: logData.student_info,
    content: logData.content,
    likes_count: 0,
    created_at: new Date().toISOString()
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('reading_logs')
        .insert([newLog])
        .select()
        .single();
      if (!error && data) {
        // Update local cache
        const allLogs = await getAllLogsFromLocal();
        localStorage.setItem(LS_KEY_LOGS, JSON.stringify([data, ...allLogs]));
        return data;
      }
    } catch (e) {
      console.warn('Supabase createReadingLog error', e);
    }
  }

  // Fallback to local storage
  const allLogs = await getAllLogsFromLocal();
  const updated = [newLog, ...allLogs];
  localStorage.setItem(LS_KEY_LOGS, JSON.stringify(updated));
  return newLog;
}

export async function updateReadingLog(id, updates) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('reading_logs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) {
        const allLogs = await getAllLogsFromLocal();
        const updated = allLogs.map(l => l.id === id ? { ...l, ...data } : l);
        localStorage.setItem(LS_KEY_LOGS, JSON.stringify(updated));
        return data;
      }
    } catch (e) {
      console.warn('Supabase updateReadingLog error', e);
    }
  }

  const allLogs = await getAllLogsFromLocal();
  const updated = allLogs.map(l => l.id === id ? { ...l, ...updates } : l);
  localStorage.setItem(LS_KEY_LOGS, JSON.stringify(updated));
  return updated.find(l => l.id === id);
}

export async function deleteReadingLog(id) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('reading_logs').delete().eq('id', id);
    } catch (e) {
      console.warn('Supabase deleteReadingLog error', e);
    }
  }

  const allLogs = await getAllLogsFromLocal();
  const updated = allLogs.filter(l => l.id !== id);
  localStorage.setItem(LS_KEY_LOGS, JSON.stringify(updated));
  return true;
}

export async function toggleLikeReadingLog(id) {
  // 로컬에서 유저의 좋아요 상태 확인
  let likedIds = [];
  try {
    likedIds = JSON.parse(localStorage.getItem(LS_KEY_LIKES) || '[]');
  } catch {}

  const isLiked = likedIds.includes(id);
  const nextLiked = !isLiked;

  if (nextLiked) {
    likedIds.push(id);
  } else {
    likedIds = likedIds.filter(item => item !== id);
  }
  localStorage.setItem(LS_KEY_LIKES, JSON.stringify(likedIds));

  // 일지 목록에서 카운트 조정
  const allLogs = await getAllLogsFromLocal();
  const target = allLogs.find(l => l.id === id);
  if (!target) return { liked: nextLiked, count: 0 };

  const currentCount = target.likes_count || 0;
  const newCount = nextLiked ? currentCount + 1 : Math.max(0, currentCount - 1);
  target.likes_count = newCount;

  localStorage.setItem(LS_KEY_LOGS, JSON.stringify(allLogs));

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase
        .from('reading_logs')
        .update({ likes_count: newCount })
        .eq('id', id);
    } catch (e) {
      console.warn('Supabase update likes error', e);
    }
  }

  return { liked: nextLiked, count: newCount };
}

export function isLogLikedByUser(id) {
  try {
    const likedIds = JSON.parse(localStorage.getItem(LS_KEY_LIKES) || '[]');
    return likedIds.includes(id);
  } catch {
    return false;
  }
}

async function getAllLogsFromLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY_LOGS);
    return raw ? JSON.parse(raw) : INITIAL_READING_LOGS;
  } catch {
    return INITIAL_READING_LOGS;
  }
}

/**
 * 실시간 구독 설정
 */
export function subscribeToRealtimeLogs(onInsert, onUpdate, onDelete) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const channel = supabase
      .channel('public:reading_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reading_logs' }, payload => {
        if (onInsert) onInsert(payload.new);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reading_logs' }, payload => {
        if (onUpdate) onUpdate(payload.new);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reading_logs' }, payload => {
        if (onDelete) onDelete(payload.old);
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('Realtime subscription failed:', err);
    return null;
  }
}

/**
 * 초기 예시 데이터로 리셋
 */
export function resetToDemoData() {
  localStorage.setItem(LS_KEY_TRACKS, JSON.stringify(DEFAULT_TRACKS));
  localStorage.setItem(LS_KEY_SESSIONS, JSON.stringify(DEFAULT_SESSIONS));
  localStorage.setItem(LS_KEY_TEMPLATE, JSON.stringify(DEFAULT_TEMPLATE));
  localStorage.setItem(LS_KEY_LOGS, JSON.stringify(INITIAL_READING_LOGS));
  localStorage.removeItem(LS_KEY_LIKES);
  return true;
}
