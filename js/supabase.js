/**
 * Supabase 클라이언트 및 설정 관리 모듈
 */

export const DEFAULT_SUPABASE_URL = 'https://hidimbmtfhjjkosyndja.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_EILdYnvkzXAx3SVUHQovUQ_UL6nYo7f';

const STORAGE_KEY_CONFIG = 'reading_log_supabase_config';

export function getSupabaseConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.url && parsed.anonKey) {
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

  if (!cleanUrl || !cleanKey) {
    localStorage.removeItem(STORAGE_KEY_CONFIG);
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
    console.error('Supabase library not loaded yet');
    return null;
  }
  try {
    supabaseClient = window.supabase.createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    return supabaseClient;
  } catch (e) {
    console.error('Init Supabase client failed:', e);
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
      auth: { persistSession: false }
    });

    // 1. career_tracks 테이블 조회 시도
    const { data, error } = await testClient
      .from('career_tracks')
      .select('count', { count: 'exact', head: true });

    if (error) {
      // 테이블이 아직 생성되지 않은 경우 (404, 42P01 등)
      if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist') || error.code === 'PGRST116' || error.message?.includes('404')) {
        return {
          success: true,
          tableMissing: true,
          message: 'Supabase 프로젝트 키 인증 성공! (단, 데이터베이스 테이블이 아직 생성되지 않았습니다. 관리자 모드의 [SQL 전체 복사]를 눌러 Supabase SQL Editor에서 실행해 주세요.)'
        };
      }
      
      // Auth 헬스체크로 2차 검증
      try {
        const { error: authErr } = await testClient.auth.getSession();
        if (!authErr) {
          return {
            success: true,
            tableMissing: true,
            message: 'Supabase 서버 연결 성공! (SQL 스키마를 Supabase SQL Editor에서 실행해 주세요.)'
          };
        }
      } catch {}

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
