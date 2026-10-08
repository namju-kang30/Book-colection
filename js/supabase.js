/**
 * Supabase 클라이언트 및 설정 관리 모듈
 */

// 네트워크가 응답하지 않아도 작성 폼이 무한히 저장 중 상태로 남지 않게 한다.
export async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

export const DEFAULT_SUPABASE_URL = 'https://hidimbmtfhjjkosyndja.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_EILdYnvkzXAx3SVUHQovUQ_UL6nYo7f';

const STORAGE_KEY_CONFIG = 'reading_log_supabase_config';

export function getSupabaseConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed.url === 'string' && typeof parsed.anonKey === 'string') {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load supabase config from storage', e);
  }

  // 기본 window 환경변수 또는 프로젝트 기본 Supabase 설정
  const windowEnvUrl = window.__VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const windowEnvKey = window.__VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  return {
    url: windowEnvUrl,
    anonKey: windowEnvKey
  };
}

export function saveSupabaseConfig(url, anonKey) {
  const cleanUrl = (url || '').trim();
  const cleanKey = (anonKey || '').trim();

  if (Boolean(cleanUrl) !== Boolean(cleanKey)) throw new Error('Supabase URL과 API 키를 함께 입력해 주세요.');
  if (cleanUrl) {
    let parsed;
    try { parsed = new URL(cleanUrl); } catch { throw new Error('올바른 Supabase URL을 입력해 주세요.'); }
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') throw new Error('HTTPS Supabase URL을 입력해 주세요.');
  }
  if (!cleanUrl && !cleanKey) {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({ url: '', anonKey: '' }));
    supabaseClient = null;
    return false;
  }

  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({
    url: cleanUrl,
    anonKey: cleanKey
  }));

  // 클라이언트 재초기화
  initSupabaseClient(cleanUrl, cleanKey);
  return true;
}

let supabaseClient = null;

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const config = getSupabaseConfig();
  if (config.url && config.anonKey && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
        global: { fetch: fetchWithTimeout },
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
      return supabaseClient;
    } catch (err) {
      console.error('Error creating Supabase client:', err);
      return null;
    }
  }
  return null;
}

export function initSupabaseClient(url, anonKey) {
  if (!window.supabase) {
    supabaseClient = null;
    console.error('Supabase library not loaded yet');
    return null;
  }
  try {
    supabaseClient = window.supabase.createClient(url, anonKey, {
      global: { fetch: fetchWithTimeout },
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    return supabaseClient;
  } catch (e) {
    console.error('Init Supabase client failed:', e);
    supabaseClient = null;
    return null;
  }
}

/**
 * Supabase 접속 테스트
 */
export async function testSupabaseConnection(url, anonKey) {
  if (!window.supabase) {
    return { success: false, message: 'Supabase JS 라이브러리를 불러오지 못했습니다.' };
  }

  try {
    const testClient = window.supabase.createClient(url, anonKey, {
      global: { fetch: fetchWithTimeout },
      auth: { persistSession: false }
    });

    // 1. career_tracks 테이블 조회 시도
    const { data, error } = await testClient
      .from('career_tracks')
      .select('count', { count: 'exact', head: true });

    if (error) {
      // 테이블이 아직 생성되지 않은 경우 (404, 42P01 등)
      if (error.code === 'PGRST205' || error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist') || error.code === 'PGRST116' || error.message?.includes('404')) {
        return {
          success: false,
          tableMissing: true,
          message: '독서일지 데이터베이스 테이블을 찾을 수 없습니다. ( 관리자 모드의 [SQL 전체 복사]를 눌러 Supabase SQL Editor에서 실행해 주세요.)'
        };
      }
      
      return { success: false, message: `Supabase 연결 에러: ${error.message} (${error.code || ''})` };
    }

    return {
      success: true,
      tableMissing: false,
      message: 'Supabase 데이터베이스 및 테이블 연결이 완벽하게 확인되었습니다!'
    };
  } catch (err) {
    return { success: false, message: `연결 테스트 중 예외 발생: ${err.message}` };
  }
}

