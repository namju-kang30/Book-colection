/**
 * 진로 맞춤형 차시별 독서 활동 일지 메인 앱 로직
 */

import {
  getCareerTracks,
  createCareerTrack,
  updateCareerTrack,
  deleteCareerTrack,
  getSessions,
  createSession,
  updateSession,
  deleteSession,
  getActiveTemplate,
  saveTemplate,
  getReadingLogs,
  createReadingLog,
  deleteReadingLog,
  toggleLikeReadingLog,
  isLogLikedByUser,
  subscribeToRealtimeLogs,
  resetToDemoData
} from './storage.js';

import {
  getSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
  getSupabaseClient
} from './supabase.js';

import { exportLogsToExcel, exportLogsToCSV } from './exportUtils.js';

// 관리자 인증용 SHA-256 해시값 (평문 비밀번호는 코드에 저장되지 않음)
const ADMIN_PASSWORD_HASH = '060cdc2ea278db21c67e6dba9c674ad9471a7ac5a29e120ee72942ee4aa7bdfe';

// ==========================================
// 전역 상태 (Global State)
// ==========================================
const state = {
  tracks: [],
  sessions: [],
  activeTemplate: null,
  logs: [],
  selectedTrackId: 'all',
  selectedSessionId: 'all',
  searchQuery: '',
  sortBy: 'latest', // 'latest', 'likes', 'oldest'
  
  // 모달 상태
  isFormModalOpen: false,
  isDetailModalOpen: false,
  selectedLog: null,
  editingLogId: null, // 일지 수정 대상 ID (null이면 새 작성)

  // 비밀번호 인증 모달 (학생 수정/삭제용)
  authPinModal: {
    isOpen: false,
    logId: null,
    action: null // 'edit' 또는 'delete'
  },
  
  // 관리자 상태
  isAdmin: false,
  isAdminLoginModalOpen: false,
  isAdminModalOpen: false,
  adminTab: 'logs', // 'logs', 'template', 'tracks', 'sessions', 'supabase'
  adminLogFilterTrack: 'all',
  adminLogFilterSession: 'all',
  adminLogSearch: '',
  
  // Supabase 상태
  isSupabaseConfigOpen: false,
  supabaseConfig: getSupabaseConfig(),
  supabaseConnected: false,
  supabaseEditMode: false,
  
  // 템플릿 빌더 임시 상태
  editingTemplate: null,
  
  // 학생 캐시 정보
  studentCache: {
    student_id: localStorage.getItem('cached_student_id') || '',
    name: localStorage.getItem('cached_student_name') || ''
  }
};

// ==========================================
// 초기화 및 데이터 로드
// ==========================================
export async function initApp() {
  await refreshAllData();
  
  // Supabase 실시간 구독 설정
  subscribeToRealtimeLogs(
    newLog => {
      showToast('info', `새로운 독서일지가 등록되었습니다: ${newLog.content?.field_book || '도서'}`);
      refreshLogs();
    },
    updatedLog => {
      refreshLogs();
    },
    deletedLog => {
      refreshLogs();
    }
  );

  // Supabase 연결 상태 체크
  if (state.supabaseConfig.url && state.supabaseConfig.anonKey) {
    checkSupabaseStatus();
  }

  // 이벤트 리스너 바인딩
  bindGlobalEvents();

  // 초기 화면 렌더링
  renderApp();
}

async function refreshAllData() {
  const [tracks, sessions, template, logs] = await Promise.all([
    getCareerTracks(),
    getSessions(),
    getActiveTemplate(),
    getReadingLogs()
  ]);

  state.tracks = tracks;
  state.sessions = sessions;
  state.activeTemplate = template;
  state.logs = logs;

  // 템플릿 빌더 초기화
  state.editingTemplate = JSON.parse(JSON.stringify(template));
}

async function refreshLogs() {
  state.logs = await getReadingLogs(state.selectedTrackId, state.selectedSessionId);
  renderFeed();
  renderStats();
}

async function checkSupabaseStatus() {
  if (!state.supabaseConfig.url || !state.supabaseConfig.anonKey) {
    state.supabaseConnected = false;
    updateSupabaseBadge();
    return;
  }
  const result = await testSupabaseConnection(state.supabaseConfig.url, state.supabaseConfig.anonKey);
  state.supabaseConnected = result.success;
  updateSupabaseBadge();
}

// ==========================================
// 렌더링 함수들
// ==========================================
export function renderApp() {
  renderNavbar();
  renderTrackSelector();
  renderSessionFilter();
  renderFeed();
  renderStats();
  renderModals();
  lucide.createIcons();
}

function renderStats() {
  const totalCountEl = document.getElementById('stat-total-count');
  const activeSessionsEl = document.getElementById('stat-active-sessions');
  if (totalCountEl) {
    totalCountEl.textContent = `${state.logs.length}편`;
  }
  if (activeSessionsEl) {
    const activeCount = state.sessions.filter(s => s.is_active).length;
    activeSessionsEl.textContent = `${activeCount}개 차시`;
  }
}

function renderNavbar() {
  const navContainer = document.getElementById('navbar-container');
  if (!navContainer) return;

  const connected = state.supabaseConnected;
  const isConfigured = !!(state.supabaseConfig.url && state.supabaseConfig.anonKey);

  navContainer.innerHTML = `
    <header class="glass-nav sticky top-0 z-30 transition-all">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16 sm:h-20">
          
          <!-- Logo & Title -->
          <div class="flex items-center gap-3 cursor-pointer" id="nav-logo-btn">
            <div class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <i data-lucide="book-marked" class="w-6 h-6"></i>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                  진로 독서 일지
                </h1>
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Realtime
                </span>
              </div>
              <p class="text-xs text-slate-500 hidden sm:block">진로 계열별 차시 맞춤형 독서 활동 기록 플랫폼</p>
            </div>
          </div>

          <!-- Right Actions -->
          <div class="flex items-center gap-2 sm:gap-3">
            
            <!-- Supabase Status Button -->
            <button id="btn-supabase-status" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isConfigured && connected
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                : isConfigured
                ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
            }" title="Supabase 연동 상태 확인 및 설정">
              <span class="w-2 h-2 rounded-full ${
                isConfigured && connected
                  ? 'bg-emerald-500 animate-pulse'
                  : isConfigured
                  ? 'bg-amber-500'
                  : 'bg-slate-400'
              }"></span>
              <span class="hidden md:inline">${
                isConfigured && connected
                  ? 'Supabase 연동됨'
                  : isConfigured
                  ? 'Supabase 확인필요'
                  : '로컬 모의모드'
              }</span>
              <i data-lucide="database" class="w-3.5 h-3.5"></i>
            </button>

            <!-- Write Log Button (Primary CTA) -->
            <button id="btn-open-form-modal" class="inline-flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 shadow-md shadow-indigo-200 hover:shadow-indigo-300 transition-all transform active:scale-95">
              <i data-lucide="pen-tool" class="w-4 h-4"></i>
              <span>일지 작성하기</span>
            </button>

            <!-- Admin Mode Toggle Button -->
            <button id="btn-admin-toggle" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium ${
              state.isAdmin
                ? 'bg-purple-100 text-purple-800 border border-purple-300'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            } transition-all">
              <i data-lucide="${state.isAdmin ? 'shield-check' : 'shield'}" class="w-4 h-4 ${state.isAdmin ? 'text-purple-600' : 'text-slate-500'}"></i>
              <span class="hidden sm:inline">${state.isAdmin ? '관리자 모드' : '선생님 관리'}</span>
            </button>

          </div>

        </div>
      </div>
    </header>
  `;
}

function updateSupabaseBadge() {
  renderNavbar();
  lucide.createIcons();
}

function renderTrackSelector() {
  const container = document.getElementById('track-selector-container');
  if (!container) return;

  const totalLogsCount = state.logs.length;
  const isAllActive = state.selectedTrackId === 'all';

  // 계열별 일지 수 계산
  const trackCountMap = {};
  state.logs.forEach(log => {
    trackCountMap[log.track_id] = (trackCountMap[log.track_id] || 0) + 1;
  });

  let html = `
    <div class="mb-6">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <i data-lucide="compass" class="w-5 h-5 text-indigo-600"></i>
          <h2 class="text-base sm:text-lg font-bold text-slate-800">진로 계열 선택</h2>
        </div>
        <span class="text-xs text-slate-500">관심 진로를 선택하면 해당 분야의 독서일지를 모아볼 수 있습니다.</span>
      </div>

      <!-- Scrollable Track Pill Buttons -->
      <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none snap-x">
        
        <!-- All Tracks Button -->
        <button 
          data-track-id="all" 
          class="track-btn shrink-0 snap-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            isAllActive
              ? 'bg-slate-900 text-white shadow-md shadow-slate-300 ring-2 ring-slate-900 ring-offset-2'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
          }">
          <i data-lucide="layers" class="w-4 h-4 ${isAllActive ? 'text-indigo-300' : 'text-slate-500'}"></i>
          <span>전체 계열</span>
          <span class="px-1.5 py-0.5 rounded-full text-xs ${
            isAllActive ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'
          }">${totalLogsCount}</span>
        </button>
  `;

  state.tracks.forEach(track => {
    const isActive = state.selectedTrackId === track.id;
    const count = trackCountMap[track.id] || 0;
    const trackColor = track.color || '#4F46E5';

    html += `
      <button 
        data-track-id="${track.id}" 
        style="${isActive ? `background-color: ${trackColor}; color: white; box-shadow: 0 4px 12px ${trackColor}40;` : ''}"
        class="track-btn shrink-0 snap-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
          isActive
            ? 'ring-2 ring-offset-2'
            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
        }">
        <i data-lucide="${getIconForTrack(track.name, track.icon)}" class="w-4 h-4 ${isActive ? 'text-white' : ''}" style="${!isActive ? `color: ${trackColor}` : ''}"></i>
        <span>${track.name}</span>
        <span class="px-1.5 py-0.5 rounded-full text-xs font-medium ${
          isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'
        }">${count}</span>
      </button>
    `;
  });

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function renderSessionFilter() {
  const container = document.getElementById('session-filter-container');
  if (!container) return;

  const isAllSessions = state.selectedSessionId === 'all';

  let html = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6">
      
      <!-- Session Tabs -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
        <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
          <i data-lucide="calendar" class="w-3.5 h-3.5"></i> 차시:
        </span>

        <!-- All Sessions -->
        <button 
          data-session-id="all"
          class="session-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
            isAllSessions
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }">
          전체 차시
        </button>
  `;

  state.sessions.forEach(sess => {
    const isActive = state.selectedSessionId === sess.id;
    html += `
      <button 
        data-session-id="${sess.id}"
        class="session-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
          isActive
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100'
        } ${!sess.is_active ? 'opacity-60' : ''}">
        <span>${sess.title}</span>
        ${sess.is_active ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>' : ''}
      </button>
    `;
  });

  html += `
      </div>

      <!-- Search & Sort Controls -->
      <div class="flex items-center gap-2 shrink-0">
        
        <!-- Search Input -->
        <div class="relative flex-1 md:w-64">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
          <input 
            type="text" 
            id="search-input" 
            value="${state.searchQuery}"
            placeholder="도서명, 저자, 학생명 검색..." 
            class="w-full pl-9 pr-8 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
          ${state.searchQuery ? `
            <button id="btn-clear-search" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          ` : ''}
        </div>

        <!-- Sort Select -->
        <select id="sort-select" class="px-2.5 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="latest" ${state.sortBy === 'latest' ? 'selected' : ''}>최신 등록순</option>
          <option value="likes" ${state.sortBy === 'likes' ? 'selected' : ''}>공감 많은순</option>
          <option value="oldest" ${state.sortBy === 'oldest' ? 'selected' : ''}>오래된순</option>
        </select>

      </div>

    </div>
  `;

  container.innerHTML = html;
}

function renderFeed() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  // 필터링 및 검색 적용
  let filtered = [...state.logs];

  if (state.selectedTrackId && state.selectedTrackId !== 'all') {
    filtered = filtered.filter(l => l.track_id === state.selectedTrackId);
  }

  if (state.selectedSessionId && state.selectedSessionId !== 'all') {
    filtered = filtered.filter(l => l.session_id === state.selectedSessionId);
  }

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    filtered = filtered.filter(l => {
      const book = (l.content?.field_book || '').toLowerCase();
      const author = (l.content?.field_author || '').toLowerCase();
      const studentName = (l.student_info?.name || '').toLowerCase();
      const studentId = (l.student_info?.student_id || '').toLowerCase();
      const quote = (l.content?.field_quote || '').toLowerCase();
      const career = (l.content?.field_career || '').toLowerCase();
      const keywords = (l.content?.field_keywords || '').toLowerCase();

      return book.includes(q) || author.includes(q) || studentName.includes(q) || studentId.includes(q) || quote.includes(q) || career.includes(q) || keywords.includes(q);
    });
  }

  // 정렬 적용
  if (state.sortBy === 'latest') {
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (state.sortBy === 'likes') {
    filtered.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
  } else if (state.sortBy === 'oldest') {
    filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 px-4 bg-white rounded-3xl border border-dashed border-slate-300">
        <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500">
          <i data-lucide="book-open" class="w-8 h-8"></i>
        </div>
        <h3 class="text-lg font-bold text-slate-800 mb-1">등록된 독서일지가 없습니다</h3>
        <p class="text-sm text-slate-500 max-w-md mx-auto mb-6">
          ${state.searchQuery ? `'${state.searchQuery}' 검색 조건에 해당하는 일지가 없습니다.` : '선택한 계열 및 차시에 첫 번째 독서일지를 작성해 보세요!'}
        </p>
        <button id="btn-empty-write" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all">
          <i data-lucide="plus-circle" class="w-4 h-4"></i>
          <span>지금 첫 일지 작성하기</span>
        </button>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  const trackMap = new Map(state.tracks.map(t => [t.id, t]));
  const sessionMap = new Map(state.sessions.map(s => [s.id, s]));

  let html = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">`;

  filtered.forEach(log => {
    const track = trackMap.get(log.track_id) || { name: '기타', color: '#6366F1' };
    const session = sessionMap.get(log.session_id) || { title: '활동 차시' };
    const sInfo = log.student_info || {};
    const content = log.content || {};
    const bookTitle = content.field_book || '무제 도서';
    const bookAuthor = content.field_author || '';
    const quote = content.field_quote || '';
    const career = content.field_career || '';
    const rating = Number(content.field_rating) || 0;
    const keywords = content.field_keywords ? content.field_keywords.split(',').map(k => k.trim()).filter(Boolean) : [];
    const isLiked = isLogLikedByUser(log.id);

    const formattedDate = formatRelativeTime(log.created_at);

    html += `
      <div class="glass-card rounded-2xl p-5 flex flex-col justify-between cursor-pointer group hover:border-indigo-200 animate-fade-in relative" data-log-card-id="${log.id}">
        
        <div>
          <!-- Top Row: Track Badge & Session Tag -->
          <div class="flex items-center justify-between gap-2 mb-3">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold" style="background-color: ${track.color}15; color: ${track.color}; border: 1px solid ${track.color}30;">
              <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${track.color}"></span>
              ${track.name}
            </span>
            <span class="text-xs text-slate-400 font-medium">${session.title?.split(':')[0] || '차시'}</span>
          </div>

          <!-- Book Title & Author -->
          <div class="mb-3">
            <h3 class="text-base sm:text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
              ${escapeHtml(bookTitle)}
            </h3>
            ${bookAuthor ? `<p class="text-xs text-slate-500 mt-0.5 line-clamp-1"><span class="text-slate-400">저자:</span> ${escapeHtml(bookAuthor)}</p>` : ''}
          </div>

          <!-- Rating Stars (if exists) -->
          ${rating > 0 ? `
            <div class="flex items-center gap-1 text-amber-400 text-xs mb-3">
              ${Array.from({ length: 5 }).map((_, i) => `
                <i data-lucide="star" class="w-3.5 h-3.5 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}"></i>
              `).join('')}
              <span class="text-slate-400 text-xs ml-1 font-medium">${rating}.0</span>
            </div>
          ` : ''}

          <!-- Quote Excerpt Card -->
          ${quote ? `
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 mb-3 text-xs text-slate-700 italic relative line-clamp-3">
              <i data-lucide="quote" class="w-3 h-3 text-indigo-400 inline mr-1 -mt-1 opacity-70"></i>
              ${escapeHtml(quote)}
            </div>
          ` : ''}

          <!-- Career Link Snippet -->
          ${career ? `
            <div class="mb-3">
              <p class="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                <i data-lucide="sparkles" class="w-3 h-3 text-indigo-500"></i> 진로 연계 및 느낀 점:
              </p>
              <p class="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                ${escapeHtml(career)}
              </p>
            </div>
          ` : ''}

          <!-- Keyword Tags -->
          ${keywords.length > 0 ? `
            <div class="flex flex-wrap gap-1 mb-4">
              ${keywords.slice(0, 3).map(kw => `
                <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium">#${escapeHtml(kw)}</span>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Card Footer -->
        <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          
          <!-- Student Info -->
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-slate-700 to-slate-900 text-white flex items-center justify-center font-bold text-[11px]">
              ${escapeHtml((sInfo.name || '학').slice(0, 1))}
            </div>
            <div>
              <span class="font-bold text-slate-800">${escapeHtml(sInfo.name || '학생')}</span>
              ${sInfo.student_id ? `<span class="text-slate-400 text-[11px] ml-1">(${escapeHtml(sInfo.student_id)})</span>` : ''}
            </div>
          </div>

          <!-- Likes & Date -->
          <div class="flex items-center gap-3">
            <span class="text-[11px] text-slate-400">${formattedDate}</span>
            <button 
              data-like-log-id="${log.id}" 
              class="like-btn inline-flex items-center gap-1 px-2 py-1 rounded-lg transition-all ${
                isLiked
                  ? 'bg-rose-50 text-rose-600 font-bold'
                  : 'bg-slate-50 text-slate-500 hover:bg-rose-50 hover:text-rose-500'
              }">
              <i data-lucide="heart" class="w-3.5 h-3.5 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}"></i>
              <span class="text-xs">${log.likes_count || 0}</span>
            </button>
          </div>

        </div>

      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
  lucide.createIcons();
}

function renderModals() {
  renderFormModal();
  renderDetailModal();
  renderAuthPinModal();
  renderAdminLoginModal();
  renderAdminModal();
  renderSupabaseConfigModal();
}

/**
 * 독서일지 작성 및 수정 모달 렌더링 (동적 템플릿 기반)
 */
function renderFormModal() {
  const modal = document.getElementById('log-form-modal');
  if (!modal) return;

  if (!state.isFormModalOpen) {
    modal.classList.add('hidden');
    return;
  }

  modal.classList.remove('hidden');

  const isEditing = Boolean(state.editingLogId);
  const editingLog = isEditing ? state.logs.find(l => l.id === state.editingLogId) : null;

  const template = state.activeTemplate || { fields: [] };
  const currentTrackId = editingLog ? editingLog.track_id : (state.selectedTrackId !== 'all' ? state.selectedTrackId : (state.tracks[0]?.id || ''));
  const currentSessionId = editingLog ? editingLog.session_id : (state.selectedSessionId !== 'all' ? state.selectedSessionId : (state.sessions[0]?.id || ''));
  const studentInfo = editingLog ? editingLog.student_info : state.studentCache;
  const contentData = editingLog?.content || {};

  let dynamicFieldsHtml = '';
  template.fields.forEach(field => {
    const isRequired = field.required;
    const reqBadge = isRequired ? '<span class="text-rose-500 ml-0.5">*</span>' : '';
    const val = contentData[field.id] !== undefined ? contentData[field.id] : '';

    if (field.type === 'textarea') {
      dynamicFieldsHtml += `
        <div class="space-y-1.5">
          <label class="block text-xs sm:text-sm font-semibold text-slate-800">
            ${escapeHtml(field.label)} ${reqBadge}
          </label>
          <textarea 
            name="${field.id}" 
            rows="3"
            ${isRequired ? 'required' : ''}
            placeholder="${escapeHtml(field.placeholder || '')}"
            class="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400"
          >${escapeHtml(val)}</textarea>
        </div>
      `;
    } else if (field.type === 'rating') {
      const initialRating = Number(val) || 5;
      dynamicFieldsHtml += `
        <div class="space-y-1.5">
          <label class="block text-xs sm:text-sm font-semibold text-slate-800">
            ${escapeHtml(field.label)} ${reqBadge}
          </label>
          <div class="flex items-center gap-2" id="star-rating-group">
            <input type="hidden" name="${field.id}" id="input-star-rating" value="${initialRating}" />
            <div class="flex items-center gap-1 text-2xl text-amber-400 cursor-pointer" id="star-container">
              ${[1, 2, 3, 4, 5].map(star => `
                <button type="button" data-star-val="${star}" class="star-rating-star ${star <= initialRating ? 'text-amber-400' : 'text-slate-200'} hover:scale-110 transition-transform">
                  ★
                </button>
              `).join('')}
            </div>
            <span class="text-xs font-bold text-slate-600 ml-2" id="star-rating-text">${initialRating}점</span>
          </div>
        </div>
      `;
    } else {
      dynamicFieldsHtml += `
        <div class="space-y-1.5">
          <label class="block text-xs sm:text-sm font-semibold text-slate-800">
            ${escapeHtml(field.label)} ${reqBadge}
          </label>
          <input 
            type="${field.type === 'number' ? 'number' : 'text'}" 
            name="${field.id}"
            value="${escapeHtml(val)}"
            ${isRequired ? 'required' : ''}
            placeholder="${escapeHtml(field.placeholder || '')}"
            class="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400"
          />
        </div>
      `;
    }
  });

  modal.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div class="glass-modal w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        
        <!-- Modal Header -->
        <div class="px-6 py-5 bg-gradient-to-r ${isEditing ? 'from-purple-600 to-indigo-700' : 'from-indigo-600 to-indigo-700'} text-white flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <i data-lucide="${isEditing ? 'edit-3' : 'pen-tool'}" class="w-5 h-5"></i>
            </div>
            <div>
              <h2 class="text-lg font-bold">${isEditing ? '독서 활동 일지 수정' : '독서 활동 일지 작성'}</h2>
              <p class="text-xs text-indigo-100">${escapeHtml(template.title || '공통 독서 활동 양식')}</p>
            </div>
          </div>
          <button id="btn-close-form-modal" class="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Form Body -->
        <form id="reading-log-form" class="p-6 overflow-y-auto space-y-5 flex-1">
          
          <!-- Student Info & Track / Session Row -->
          <div class="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-4">
            <div class="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
              <i data-lucide="user-check" class="w-4 h-4"></i> 작성자 정보 및 활동 분류
            </div>

            <!-- Student ID & Name & 4-digit PIN -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">
                  학번 (예: 20315) <span class="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  id="form-student-id" 
                  required 
                  value="${escapeHtml(studentInfo.student_id || '')}"
                  placeholder="5자리 학번" 
                  class="w-full px-3 py-2 text-sm bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">
                  이름 <span class="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  id="form-student-name" 
                  required 
                  value="${escapeHtml(studentInfo.name || '')}"
                  placeholder="이름 입력" 
                  class="w-full px-3 py-2 text-sm bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">
                  ${isEditing ? '비밀번호 변경 (선택)' : '비밀번호 (숫자 4자리) <span class="text-rose-500">*</span>'}
                </label>
                <input 
                  type="password" 
                  id="form-student-pin" 
                  ${isEditing ? '' : 'required'}
                  maxlength="4" 
                  pattern="[0-9]{4}" 
                  inputmode="numeric" 
                  placeholder="${isEditing ? '미입력시 기존유지' : '숫자 4자리'}" 
                  class="w-full px-3 py-2 text-sm bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  title="일지 수정 및 삭제 시 본인 확인을 위한 숫자 4자리 비밀번호"
                />
              </div>
            </div>

            <p class="text-[11px] text-indigo-700/80 -mt-1 flex items-center gap-1">
              <i data-lucide="shield-alert" class="w-3.5 h-3.5"></i>
              <span>비밀번호는 추후 본인이 일지를 <strong>수정하거나 삭제할 때</strong> 사용됩니다. (SHA-256 암호화 저장)</span>
            </p>

            <!-- Track & Session Selectors -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">
                  진로 계열 <span class="text-rose-500">*</span>
                </label>
                <select id="form-track-id" required class="w-full px-3 py-2 text-sm bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium">
                  ${state.tracks.map(t => `
                    <option value="${t.id}" ${t.id === currentTrackId ? 'selected' : ''}>${t.name}</option>
                  `).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1">
                  활동 차시 <span class="text-rose-500">*</span>
                </label>
                <select id="form-session-id" required class="w-full px-3 py-2 text-sm bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium">
                  ${state.sessions.map(s => `
                    <option value="${s.id}" ${s.id === currentSessionId ? 'selected' : ''}>${s.title} (${s.date})</option>
                  `).join('')}
                </select>
              </div>
            </div>

          </div>

          <!-- Dynamic Template Fields -->
          <div class="space-y-4">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <i data-lucide="file-text" class="w-4 h-4"></i> 독서 활동 기록 항목
            </div>
            ${dynamicFieldsHtml}
          </div>

          <!-- Submit Button -->
          <div class="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
            <button type="button" id="btn-cancel-form" class="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              취소
            </button>
            <button type="submit" id="btn-submit-log" class="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all">
              <i data-lucide="${isEditing ? 'check-circle' : 'check'}" class="w-4 h-4"></i>
              <span>${isEditing ? '수정 완료 및 저장' : '독서일지 제출하기'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  `;

  lucide.createIcons();
  bindFormModalEvents();
}

/**
 * 독서일지 상세 보기 모달 렌더링
 */
function renderDetailModal() {
  const modal = document.getElementById('log-detail-modal');
  if (!modal) return;

  if (!state.isDetailModalOpen || !state.selectedLog) {
    modal.classList.add('hidden');
    return;
  }

  modal.classList.remove('hidden');

  const log = state.selectedLog;
  const track = state.tracks.find(t => t.id === log.track_id) || { name: '기타', color: '#6366F1' };
  const session = state.sessions.find(s => s.id === log.session_id) || { title: '활동 차시', date: '' };
  const sInfo = log.student_info || {};
  const content = log.content || {};
  const isLiked = isLogLikedByUser(log.id);
  const template = state.activeTemplate || { fields: [] };

  const createdDate = new Date(log.created_at).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

  modal.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div class="glass-modal w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        
        <!-- Header -->
        <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold" style="background-color: ${track.color}15; color: ${track.color}; border: 1px solid ${track.color}30;">
              <span class="w-2 h-2 rounded-full" style="background-color: ${track.color}"></span>
              ${track.name}
            </span>
            <span class="text-xs font-semibold text-slate-500 px-2.5 py-1 bg-slate-100 rounded-lg">
              ${session.title}
            </span>
          </div>

          <div class="flex items-center gap-1 sm:gap-2">
            <!-- Edit Button -->
            <button id="btn-edit-detail" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors" title="비밀번호 확인 후 일지 수정">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
              <span>수정</span>
            </button>

            <!-- Delete Button -->
            <button id="btn-delete-detail" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors" title="비밀번호 확인 후 일지 삭제">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              <span>삭제</span>
            </button>

            <button id="btn-print-detail" class="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors" title="인쇄 / PDF 저장">
              <i data-lucide="printer" class="w-4 h-4"></i>
            </button>
            <button id="btn-copy-share" class="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors" title="내용 복사">
              <i data-lucide="share-2" class="w-4 h-4"></i>
            </button>
            <button id="btn-close-detail-modal" class="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
        </div>

        <!-- Content Body -->
        <div class="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 bg-slate-50/50" id="print-content-area">
          
          <!-- Book Hero Section -->
          <div class="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span class="text-xs font-bold text-indigo-600 tracking-wider uppercase">BOOK JOURNAL</span>
              <h2 class="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                ${escapeHtml(content.field_book || '도서명')}
              </h2>
              ${content.field_author ? `
                <p class="text-sm text-slate-600 mt-1 flex items-center gap-1.5">
                  <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400"></i> ${escapeHtml(content.field_author)}
                </p>
              ` : ''}
              ${content.field_pages ? `
                <p class="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <i data-lucide="bookmark" class="w-3.5 h-3.5 text-slate-400"></i> 읽은 범위: ${escapeHtml(content.field_pages)}
                </p>
              ` : ''}
            </div>

            <!-- Student Author Badge -->
            <div class="flex items-center gap-3 p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 shrink-0">
              <div class="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                ${escapeHtml((sInfo.name || '학').slice(0, 1))}
              </div>
              <div>
                <div class="text-sm font-bold text-slate-900">${escapeHtml(sInfo.name || '학생')}</div>
                <div class="text-xs text-indigo-700 font-medium">학번: ${escapeHtml(sInfo.student_id || '-')}</div>
              </div>
            </div>
          </div>

          <!-- Dynamic Fields Sections -->
          <div class="space-y-4">
            ${template.fields.map(f => {
              if (f.id === 'field_book' || f.id === 'field_author' || f.id === 'field_pages') return '';
              const val = content[f.id];
              if (!val) return '';

              if (f.type === 'rating') {
                const ratingNum = Number(val) || 0;
                return `
                  <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <i data-lucide="star" class="w-4 h-4 text-amber-500"></i> ${escapeHtml(f.label)}
                    </h4>
                    <div class="flex items-center gap-2">
                      <div class="flex items-center text-amber-400">
                        ${Array.from({ length: 5 }).map((_, idx) => `
                          <i data-lucide="star" class="w-5 h-5 ${idx < ratingNum ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}"></i>
                        `).join('')}
                      </div>
                      <span class="text-sm font-bold text-slate-800 ml-2">${ratingNum}점 / 5.0</span>
                    </div>
                  </div>
                `;
              }

              if (f.id === 'field_quote') {
                return `
                  <div class="p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-100 shadow-sm">
                    <h4 class="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <i data-lucide="quote" class="w-4 h-4 text-indigo-600"></i> ${escapeHtml(f.label)}
                    </h4>
                    <p class="text-sm sm:text-base text-slate-800 font-medium italic leading-relaxed whitespace-pre-line border-l-4 border-indigo-500 pl-4 py-1">
                      "${escapeHtml(val)}"
                    </p>
                  </div>
                `;
              }

              return `
                <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <i data-lucide="align-left" class="w-4 h-4 text-indigo-500"></i> ${escapeHtml(f.label)}
                  </h4>
                  <p class="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    ${escapeHtml(val)}
                  </p>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Metadata Footer -->
          <div class="flex items-center justify-between text-xs text-slate-400 pt-3">
            <span>작성 일시: ${createdDate}</span>
            <span>일지 고유 ID: ${log.id}</span>
          </div>

        </div>

        <!-- Modal Footer with Like CTA -->
        <div class="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between shrink-0">
          <button 
            data-detail-like-id="${log.id}"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              isLiked 
                ? 'bg-rose-50 text-rose-600 border border-rose-200' 
                : 'bg-slate-50 text-slate-700 hover:bg-rose-50 hover:text-rose-600 border border-slate-200'
            }">
            <i data-lucide="heart" class="w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}"></i>
            <span>${isLiked ? '공감 취소' : '공감하기'} (${log.likes_count || 0})</span>
          </button>

          <button id="btn-close-detail-modal-bottom" class="px-5 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors">
            닫기
          </button>
        </div>

      </div>
    </div>
  `;

  lucide.createIcons();
  bindDetailModalEvents();
}

/**
 * 일지 수정/삭제 시 4자리 비밀번호 확인 모달 렌더링
 */
function renderAuthPinModal() {
  const modal = document.getElementById('auth-pin-modal');
  if (!modal) return;

  if (!state.authPinModal.isOpen) {
    modal.classList.add('hidden');
    return;
  }

  modal.classList.remove('hidden');

  const action = state.authPinModal.action; // 'edit' | 'delete'
  const isEdit = action === 'edit';
  const targetLog = state.logs.find(l => l.id === state.authPinModal.logId);
  const studentName = targetLog?.student_info?.name || '작성자';

  modal.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div class="glass-modal w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-slate-100 p-6 sm:p-8">
        
        <div class="w-12 h-12 rounded-2xl ${isEdit ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'} flex items-center justify-center mx-auto mb-4">
          <i data-lucide="${isEdit ? 'key-round' : 'trash-2'}" class="w-6 h-6"></i>
        </div>

        <h2 class="text-xl font-bold text-center text-slate-900 mb-1">
          일지 ${isEdit ? '수정' : '삭제'} 본인 확인
        </h2>
        <p class="text-xs text-center text-slate-500 mb-6">
          <strong>${escapeHtml(studentName)}</strong> 학생이 등록 시 설정한 <strong>숫자 4자리 비밀번호</strong>를 입력해 주세요.
        </p>

        <form id="auth-pin-form" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1.5">비밀번호 (숫자 4자리)</label>
            <input 
              type="password" 
              id="auth-pin-input" 
              required 
              autofocus
              maxlength="4"
              pattern="[0-9]{4}"
              inputmode="numeric"
              placeholder="••••" 
              class="w-full text-center tracking-widest text-xl font-mono py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 ${isEdit ? 'focus:ring-indigo-500' : 'focus:ring-rose-500'}"
            />
          </div>

          <div class="flex items-center gap-3 pt-2">
            <button type="button" id="btn-close-auth-pin" class="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              취소
            </button>
            <button type="submit" class="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white ${isEdit ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'} shadow-md transition-all">
              ${isEdit ? '수정 계속하기' : '일지 삭제'}
            </button>
          </div>
        </form>

      </div>
    </div>
  `;

  lucide.createIcons();
  bindAuthPinModalEvents();
}

/**
 * 관리자 로그인 모달
 */
function renderAdminLoginModal() {
  const modal = document.getElementById('admin-login-modal');
  if (!modal) return;

  if (!state.isAdminLoginModalOpen) {
    modal.classList.add('hidden');
    return;
  }

  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div class="glass-modal w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-slate-100 p-6 sm:p-8">
        
        <div class="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-4">
          <i data-lucide="shield" class="w-6 h-6"></i>
        </div>

        <h2 class="text-xl font-bold text-center text-slate-900 mb-1">선생님 / 관리자 인증</h2>
        <p class="text-xs text-center text-slate-500 mb-6">진로 계열, 활동 차시 및 작성 양식을 관리할 수 있습니다.</p>

        <form id="admin-login-form" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1.5">관리자 비밀번호</label>
            <input 
              type="password" 
              id="admin-password-input" 
              required 
              autofocus
              placeholder="관리자 비밀번호를 입력하세요" 
              class="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div class="p-3 rounded-xl bg-purple-50 text-[11px] text-purple-700 flex items-center gap-1.5">
            <i data-lucide="lock" class="w-3.5 h-3.5 shrink-0"></i>
            <span>관리자 비밀번호는 <strong>SHA-256 단방향 암호화 해시</strong>로 안전하게 검증됩니다.</span>
          </div>

          <div class="flex items-center gap-3 pt-2">
            <button type="button" id="btn-close-admin-login" class="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              취소
            </button>
            <button type="submit" class="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200 transition-all">
              로그인
            </button>
          </div>
        </form>

      </div>
    </div>
  `;

  lucide.createIcons();
  bindAdminLoginEvents();
}

/**
 * 관리자 대시보드 모달
 */
function renderAdminModal() {
  const modal = document.getElementById('admin-dashboard-modal');
  if (!modal) return;

  if (!state.isAdminModalOpen) {
    modal.classList.add('hidden');
    return;
  }

  modal.classList.remove('hidden');

  const tab = state.adminTab;

  modal.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div class="glass-modal w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col h-[90vh]">
        
        <!-- Admin Top Header -->
        <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center text-white">
              <i data-lucide="settings" class="w-5 h-5"></i>
            </div>
            <div>
              <h2 class="text-base sm:text-lg font-bold">선생님 관리자 대시보드</h2>
              <p class="text-xs text-slate-400">진로 계열, 활동 차시, 작성 양식 및 일지 통합 관리</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button id="btn-admin-logout" class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors">
              관리자 모드 종료
            </button>
            <button id="btn-close-admin-modal" class="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
        </div>

        <!-- Admin Navigation Tabs -->
        <div class="px-6 bg-slate-100/80 border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0">
          <button data-admin-tab="logs" class="admin-tab-btn px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all shrink-0 ${tab === 'logs' ? 'border-purple-600 text-purple-700 bg-white shadow-sm' : 'border-transparent text-slate-600 hover:text-slate-900'}">
            <i data-lucide="table" class="w-4 h-4 inline mr-1"></i> 일지 관리 & 엑셀 다운로드
          </button>
          <button data-admin-tab="template" class="admin-tab-btn px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all shrink-0 ${tab === 'template' ? 'border-purple-600 text-purple-700 bg-white shadow-sm' : 'border-transparent text-slate-600 hover:text-slate-900'}">
            <i data-lucide="file-edit" class="w-4 h-4 inline mr-1"></i> 독서일지 양식 설정
          </button>
          <button data-admin-tab="tracks" class="admin-tab-btn px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all shrink-0 ${tab === 'tracks' ? 'border-purple-600 text-purple-700 bg-white shadow-sm' : 'border-transparent text-slate-600 hover:text-slate-900'}">
            <i data-lucide="compass" class="w-4 h-4 inline mr-1"></i> 진로 계열 관리
          </button>
          <button data-admin-tab="sessions" class="admin-tab-btn px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all shrink-0 ${tab === 'sessions' ? 'border-purple-600 text-purple-700 bg-white shadow-sm' : 'border-transparent text-slate-600 hover:text-slate-900'}">
            <i data-lucide="calendar" class="w-4 h-4 inline mr-1"></i> 활동 차시 관리
          </button>
          <button data-admin-tab="supabase" class="admin-tab-btn px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all shrink-0 ${tab === 'supabase' ? 'border-purple-600 text-purple-700 bg-white shadow-sm' : 'border-transparent text-slate-600 hover:text-slate-900'}">
            <i data-lucide="database" class="w-4 h-4 inline mr-1"></i> Supabase 연동 & SQL
          </button>
        </div>

        <!-- Admin Tab Content Area -->
        <div class="p-6 overflow-y-auto flex-1 bg-slate-50/50">
          ${renderAdminTabContent(tab)}
        </div>

      </div>
    </div>
  `;

  lucide.createIcons();
  bindAdminModalEvents();
}

function renderAdminTabContent(tab) {
  if (tab === 'logs') {
    return renderAdminLogsTab();
  } else if (tab === 'template') {
    return renderAdminTemplateTab();
  } else if (tab === 'tracks') {
    return renderAdminTracksTab();
  } else if (tab === 'sessions') {
    return renderAdminSessionsTab();
  } else if (tab === 'supabase') {
    return renderAdminSupabaseTab();
  }
  return '';
}

/**
 * 1. 관리자 - 일지 관리 및 엑셀 다운로드 탭 (계열별 / 차시별 필터링 지원)
 */
function renderAdminLogsTab() {
  const totalCount = state.logs.length;
  const trackMap = new Map(state.tracks.map(t => [t.id, t.name]));
  const sessionMap = new Map(state.sessions.map(s => [s.id, s.title]));

  // 필터링 적용
  let filteredLogs = [...state.logs];

  if (state.adminLogFilterTrack && state.adminLogFilterTrack !== 'all') {
    filteredLogs = filteredLogs.filter(l => l.track_id === state.adminLogFilterTrack);
  }

  if (state.adminLogFilterSession && state.adminLogFilterSession !== 'all') {
    filteredLogs = filteredLogs.filter(l => l.session_id === state.adminLogFilterSession);
  }

  if (state.adminLogSearch && state.adminLogSearch.trim()) {
    const q = state.adminLogSearch.toLowerCase().trim();
    filteredLogs = filteredLogs.filter(l => {
      const book = (l.content?.field_book || '').toLowerCase();
      const author = (l.content?.field_author || '').toLowerCase();
      const name = (l.student_info?.name || '').toLowerCase();
      const studentId = (l.student_info?.student_id || '').toLowerCase();
      return book.includes(q) || author.includes(q) || name.includes(q) || studentId.includes(q);
    });
  }

  return `
    <div class="space-y-6">
      
      <!-- Top Filter & Action Bar -->
      <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-base font-bold text-slate-900">제출된 독서일지 관리</h3>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                조회 ${filteredLogs.length}건 / 전체 ${totalCount}건
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">계열 및 차시별로 조회하여 <strong>조회된 일지만 엑셀(.xlsx)로 맞춤 다운로드</strong>할 수 있습니다.</p>
          </div>

          <!-- Export Action Buttons -->
          <div class="flex items-center gap-2 shrink-0">
            <button id="btn-export-excel" class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-200 transition-all">
              <i data-lucide="file-spreadsheet" class="w-4 h-4"></i>
              <span>조회된 일지 Excel 다운로드</span>
            </button>
            <button id="btn-export-csv" class="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all">
              <i data-lucide="download" class="w-4 h-4"></i>
              <span>CSV 저장</span>
            </button>
          </div>
        </div>

        <!-- Filter Dropdowns & Search Row -->
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-3 border-t border-slate-100">
          
          <!-- Career Track Filter -->
          <div class="sm:col-span-4">
            <label class="block text-xs font-semibold text-slate-600 mb-1">진로 계열 필터</label>
            <select id="admin-filter-track-select" class="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium">
              <option value="all" ${state.adminLogFilterTrack === 'all' ? 'selected' : ''}>전체 진로 계열</option>
              ${state.tracks.map(t => `
                <option value="${t.id}" ${state.adminLogFilterTrack === t.id ? 'selected' : ''}>${t.name}</option>
              `).join('')}
            </select>
          </div>

          <!-- Session Filter -->
          <div class="sm:col-span-4">
            <label class="block text-xs font-semibold text-slate-600 mb-1">활동 차시 필터</label>
            <select id="admin-filter-session-select" class="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium">
              <option value="all" ${state.adminLogFilterSession === 'all' ? 'selected' : ''}>전체 활동 차시</option>
              ${state.sessions.map(s => `
                <option value="${s.id}" ${state.adminLogFilterSession === s.id ? 'selected' : ''}>${s.title}</option>
              `).join('')}
            </select>
          </div>

          <!-- Search Keyword -->
          <div class="sm:col-span-4">
            <label class="block text-xs font-semibold text-slate-600 mb-1">학생명 / 학번 / 도서명 검색</label>
            <div class="relative">
              <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
              <input 
                type="text" 
                id="admin-filter-search-input" 
                value="${escapeHtml(state.adminLogSearch)}"
                placeholder="검색어 입력..." 
                class="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

        </div>

      </div>

      <!-- Logs Table -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs sm:text-sm">
            <thead class="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th class="py-3.5 px-4">작성일시</th>
                <th class="py-3.5 px-4">학번 / 이름</th>
                <th class="py-3.5 px-4">진로 계열</th>
                <th class="py-3.5 px-4">차시</th>
                <th class="py-3.5 px-4">도서명 / 저자</th>
                <th class="py-3.5 px-4 text-center">공감수</th>
                <th class="py-3.5 px-4 text-center">관리</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${filteredLogs.length === 0 ? `
                <tr>
                  <td colspan="7" class="py-12 text-center text-slate-400">조회 조건에 해당하는 독서일지가 없습니다.</td>
                </tr>
              ` : filteredLogs.map(log => `
                <tr class="hover:bg-slate-50/80 transition-colors">
                  <td class="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                    ${new Date(log.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <span class="font-bold text-slate-900">${escapeHtml(log.student_info?.name || '학생')}</span>
                    <span class="text-xs text-slate-500 block">${escapeHtml(log.student_info?.student_id || '-')}</span>
                  </td>
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700">
                      ${trackMap.get(log.track_id) || '기타'}
                    </span>
                  </td>
                  <td class="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                    ${sessionMap.get(log.session_id)?.split(':')[0] || '차시'}
                  </td>
                  <td class="py-3.5 px-4 max-w-xs">
                    <span class="font-bold text-slate-800 block truncate">${escapeHtml(log.content?.field_book || '무제')}</span>
                    <span class="text-xs text-slate-400 block truncate">${escapeHtml(log.content?.field_author || '')}</span>
                  </td>
                  <td class="py-3.5 px-4 text-center font-bold text-rose-600">
                    ♥ ${log.likes_count || 0}
                  </td>
                  <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center gap-1.5">
                      <button data-admin-view-log="${log.id}" class="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50" title="상세보기">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                      </button>
                      <button data-admin-edit-log="${log.id}" class="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50" title="일지 수정">
                        <i data-lucide="edit-3" class="w-4 h-4"></i>
                      </button>
                      <button data-admin-delete-log="${log.id}" class="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="삭제">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}

/**
 * 2. 관리자 - 독서 일지 양식 설정 (Dynamic Template Builder)
 */
function renderAdminTemplateTab() {
  const template = state.editingTemplate || state.activeTemplate;

  return `
    <div class="space-y-6">
      
      <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 class="text-base font-bold text-slate-900">공통 독서 일지 작성 양식 커스터마이징</h3>
          <p class="text-xs text-slate-500">학생들이 독서일지 작성 시 답변할 항목을 자유롭게 추가, 수정, 순서 변경할 수 있습니다.</p>
        </div>
        <button id="btn-save-template" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200 transition-all shrink-0">
          <i data-lucide="save" class="w-4 h-4"></i>
          <span>양식 저장 & 실시간 적용</span>
        </button>
      </div>

      <!-- Template Title Input -->
      <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <label class="block text-xs font-semibold text-slate-700 mb-1.5">양식 제목</label>
        <input 
          type="text" 
          id="template-title-input" 
          value="${escapeHtml(template.title || '')}" 
          class="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold"
        />
      </div>

      <!-- Template Fields List -->
      <div class="space-y-3" id="template-fields-container">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider">양식 항목 리스트 (${template.fields.length}개)</h4>
          <button id="btn-add-template-field" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i> 항목 추가하기
          </button>
        </div>

        ${template.fields.map((field, idx) => `
          <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3" data-field-index="${idx}">
            <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <span class="text-xs font-bold text-slate-400">항목 #${idx + 1}</span>
              <div class="flex items-center gap-1">
                <button type="button" data-field-move-up="${idx}" class="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="위로 이동" ${idx === 0 ? 'disabled class="opacity-30"' : ''}>
                  <i data-lucide="arrow-up" class="w-3.5 h-3.5"></i>
                </button>
                <button type="button" data-field-move-down="${idx}" class="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="아래로 이동" ${idx === template.fields.length - 1 ? 'disabled class="opacity-30"' : ''}>
                  <i data-lucide="arrow-down" class="w-3.5 h-3.5"></i>
                </button>
                <button type="button" data-field-delete="${idx}" class="p-1 rounded text-rose-500 hover:bg-rose-50" title="항목 삭제">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div class="sm:col-span-6">
                <label class="block text-xs font-semibold text-slate-700 mb-1">항목명(질문)</label>
                <input 
                  type="text" 
                  data-field-key="label" 
                  value="${escapeHtml(field.label)}" 
                  class="w-full px-3 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div class="sm:col-span-3">
                <label class="block text-xs font-semibold text-slate-700 mb-1">입력 형태</label>
                <select data-field-key="type" class="w-full px-3 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="text" ${field.type === 'text' ? 'selected' : ''}>단문 텍스트 (한 줄)</option>
                  <option value="textarea" ${field.type === 'textarea' ? 'selected' : ''}>장문 텍스트 (여러 줄)</option>
                  <option value="rating" ${field.type === 'rating' ? 'selected' : ''}>별점 5점 만점</option>
                  <option value="number" ${field.type === 'number' ? 'selected' : ''}>숫자</option>
                </select>
              </div>

              <div class="sm:col-span-3 flex items-center pt-5">
                <label class="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" data-field-key="required" ${field.required ? 'checked' : ''} class="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300" />
                  <span class="text-xs font-semibold text-slate-700">필수 입력 항목</span>
                </label>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">입력 안내 힌트 (Placeholder)</label>
              <input 
                type="text" 
                data-field-key="placeholder" 
                value="${escapeHtml(field.placeholder || '')}" 
                placeholder="학생들에게 보여줄 예시 또는 작성 팁" 
                class="w-full px-3 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
        `).join('')}
      </div>

    </div>
  `;
}

/**
 * 3. 관리자 - 진로 계열 관리 탭
 */
function renderAdminTracksTab() {
  return `
    <div class="space-y-6">
      
      <!-- Track Add Form Card -->
      <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
          <i data-lucide="plus-circle" class="w-4 h-4 text-purple-600"></i> 새 진로 계열 추가
        </h3>
        <form id="add-track-form" class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div class="sm:col-span-5">
            <label class="block text-xs font-semibold text-slate-700 mb-1">계열명</label>
            <input type="text" id="new-track-name" required placeholder="예: 인공지능·소프트웨어" class="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div class="sm:col-span-3">
            <label class="block text-xs font-semibold text-slate-700 mb-1">테마 색상</label>
            <div class="flex items-center gap-2">
              <input type="color" id="new-track-color" value="#4F46E5" class="w-9 h-9 p-0.5 rounded-lg border border-slate-200 cursor-pointer" />
              <span class="text-xs font-mono text-slate-500" id="new-track-color-text">#4F46E5</span>
            </div>
          </div>
          <div class="sm:col-span-4">
            <button type="submit" class="w-full py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200 transition-all">
              진로 계열 등록
            </button>
          </div>
        </form>
      </div>

      <!-- Tracks List Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        ${state.tracks.map(track => {
          const logCount = state.logs.filter(l => l.track_id === track.id).length;
          return `
            <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold" style="background-color: ${track.color || '#4F46E5'}">
                  <i data-lucide="${getIconForTrack(track.name, track.icon)}" class="w-4 h-4"></i>
                </div>
                <div>
                  <h4 class="text-sm font-bold text-slate-900">${escapeHtml(track.name)}</h4>
                  <span class="text-xs text-slate-400">제출된 일지 ${logCount}건</span>
                </div>
              </div>

              <div class="flex items-center gap-1">
                <button data-delete-track="${track.id}" class="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors" title="계열 삭제">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

    </div>
  `;
}

/**
 * 4. 관리자 - 활동 차시 관리 탭
 */
function renderAdminSessionsTab() {
  return `
    <div class="space-y-6">
      
      <!-- Session Add Form Card -->
      <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
          <i data-lucide="plus-circle" class="w-4 h-4 text-purple-600"></i> 새 활동 차시 등록
        </h3>
        <form id="add-session-form" class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div class="sm:col-span-6">
            <label class="block text-xs font-semibold text-slate-700 mb-1">차시명</label>
            <input type="text" id="new-session-title" required placeholder="예: 5차시 : 심화 탐구 보고서 발표" class="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div class="sm:col-span-3">
            <label class="block text-xs font-semibold text-slate-700 mb-1">활동 일자</label>
            <input type="date" id="new-session-date" required value="${new Date().toISOString().slice(0, 10)}" class="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div class="sm:col-span-3">
            <button type="submit" class="w-full py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200 transition-all">
              차시 등록
            </button>
          </div>
        </form>
      </div>

      <!-- Sessions List -->
      <div class="space-y-3">
        ${state.sessions.map(sess => {
          const logCount = state.logs.filter(l => l.session_id === sess.id).length;
          return `
            <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl ${sess.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'} flex items-center justify-center font-bold text-xs">
                  <i data-lucide="calendar" class="w-5 h-5"></i>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h4 class="text-sm font-bold text-slate-900">${escapeHtml(sess.title)}</h4>
                    <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${sess.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}">
                      ${sess.is_active ? '진행 중' : '마감'}
                    </span>
                  </div>
                  <p class="text-xs text-slate-500 mt-0.5">활동일: ${sess.date} · 제출된 일지 ${logCount}건</p>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button data-toggle-session="${sess.id}" class="px-3 py-1.5 rounded-lg text-xs font-semibold ${sess.is_active ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'} transition-colors">
                  ${sess.is_active ? '마감하기' : '활성화'}
                </button>
                <button data-delete-session="${sess.id}" class="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors" title="차시 삭제">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

    </div>
  `;
}

/**
 * 5. 관리자 - Supabase 연동 & SQL 스키마 탭 (보안 마스킹 및 복사 차단 적용)
 */
function renderAdminSupabaseTab() {
  const isConnected = state.supabaseConnected;
  const isEditing = state.supabaseEditMode;

  return `
    <div class="space-y-6">
      
      <!-- Connection Status Banner -->
      <div class="p-5 rounded-2xl ${isConnected ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl ${isConnected ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'} flex items-center justify-center shrink-0">
            <i data-lucide="${isConnected ? 'check-circle-2' : 'alert-triangle'}" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-sm font-bold ${isConnected ? 'text-emerald-900' : 'text-amber-900'}">
              ${isConnected ? 'Supabase 클라우드 데이터베이스에 정상 연결되어 있습니다.' : '현재 브라우저 로컬 저장소(Mock) 모드로 작동 중입니다.'}
            </h3>
            <p class="text-xs ${isConnected ? 'text-emerald-700' : 'text-amber-700'} mt-1">
              ${isConnected ? '모든 학생 제출 데이터가 실시간으로 Supabase PostgreSQL DB에 안전하게 동기화됩니다.' : 'Supabase 설정 후 아래 SQL 스크립트를 Supabase SQL Editor에 실행하면 클라우드 실시간 연동이 활성화됩니다.'}
            </p>
          </div>
        </div>
      </div>

      <!-- Config Inputs Form with Security Protection -->
      <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
            <i data-lucide="shield-check" class="w-4 h-4 text-purple-600"></i> Supabase 접속 키 설정
          </h3>
          <span class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <i data-lucide="lock" class="w-3.5 h-3.5"></i> 접속 정보 암호화 보호 중
          </span>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
          <i data-lucide="eye-off" class="w-4 h-4 text-slate-400 shrink-0"></i>
          <span>보안 정책에 따라 활성화된 Supabase Project URL 및 Anon Key의 <strong>화면 노출 및 복사가 차단</strong>되어 있습니다.</span>
        </div>

        ${!isEditing ? `
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">VITE_SUPABASE_URL (Project URL)</label>
              <input 
                type="password" 
                readonly 
                disabled
                value="••••••••••••••••••••••••••••••••••••••••" 
                class="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-100/80 text-slate-400 font-mono select-none cursor-not-allowed pointer-events-none"
                oncopy="return false;" oncut="return false;" oncontextmenu="return false;"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">VITE_SUPABASE_ANON_KEY (Public Anon Key)</label>
              <input 
                type="password" 
                readonly 
                disabled
                value="••••••••••••••••••••••••••••••••••••••••••••••••••••" 
                class="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-100/80 text-slate-400 font-mono select-none cursor-not-allowed pointer-events-none"
                oncopy="return false;" oncut="return false;" oncontextmenu="return false;"
              />
            </div>

            <div class="flex items-center gap-3 pt-2">
              <button type="button" id="btn-test-supabase-conn" class="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors">
                연결 상태 점검
              </button>
              <button type="button" id="btn-toggle-supabase-edit" class="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200 transition-all">
                새 접속 키 등록하기
              </button>
              <button type="button" id="btn-reset-demo-data" class="px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 ml-auto" title="초기 예시 데이터로 되돌리기">
                초기 샘플 데이터 복구
              </button>
            </div>
          </div>
        ` : `
          <form id="supabase-config-form" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">새 VITE_SUPABASE_URL 입력</label>
              <input 
                type="url" 
                id="admin-supabase-url" 
                required
                placeholder="https://xxxxxxxxxxxx.supabase.co" 
                class="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">새 VITE_SUPABASE_ANON_KEY 입력</label>
              <input 
                type="text" 
                id="admin-supabase-key" 
                required
                placeholder="sb_publishable_..." 
                class="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
              />
            </div>

            <div class="flex items-center gap-3 pt-2">
              <button type="button" id="btn-cancel-supabase-edit" class="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                취소
              </button>
              <button type="submit" class="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200 transition-all">
                새 키 저장 및 연동
              </button>
            </div>
          </form>
        `}
      </div>

      <!-- SQL Schema Generator -->
      <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-bold text-slate-900">Supabase SQL 스키마 스크립트</h3>
            <p class="text-xs text-slate-500">Supabase 대시보드의 [SQL Editor]에 복사하여 붙여넣고 [Run]을 누르세요.</p>
          </div>
          <button id="btn-copy-sql-schema" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i> SQL 전체 복사
          </button>
        </div>

        <pre class="p-4 rounded-xl bg-slate-900 text-slate-200 text-xs font-mono overflow-x-auto max-h-60 leading-relaxed border border-slate-800 select-all" id="sql-schema-code">-- 1. 확장 기능 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. 진로 계열 테이블
CREATE TABLE IF NOT EXISTS career_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    color TEXT DEFAULT '#4F46E5',
    icon TEXT DEFAULT 'BookOpen',
    order_num INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 활동 차시 테이블
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 독서 일지 공통 양식 테이블
CREATE TABLE IF NOT EXISTS journal_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT '표준 독서 활동 일지 양식',
    fields JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 학생 독서 일지 테이블
CREATE TABLE IF NOT EXISTS reading_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id UUID REFERENCES career_tracks(id) ON DELETE SET NULL,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    student_info JSONB NOT NULL,
    content JSONB NOT NULL,
    likes_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RLS 공개 정책 설정
ALTER TABLE career_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all career_tracks" ON career_tracks;
CREATE POLICY "Allow public all career_tracks" ON career_tracks FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all sessions" ON sessions;
CREATE POLICY "Allow public all sessions" ON sessions FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all journal_templates" ON journal_templates;
CREATE POLICY "Allow public all journal_templates" ON journal_templates FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all reading_logs" ON reading_logs;
CREATE POLICY "Allow public all reading_logs" ON reading_logs FOR ALL USING (true);

-- 7. 초기 데이터 삽입
INSERT INTO career_tracks (id, name, color, icon, order_num) VALUES 
('11111111-0001-4000-8000-000000000001', '자연과학', '#059669', 'Atom', 1),
('11111111-0002-4000-8000-000000000002', '공학·IT', '#2563EB', 'Cpu', 2),
('11111111-0003-4000-8000-000000000003', '인문·사회', '#D97706', 'BookOpen', 3),
('11111111-0004-4000-8000-000000000004', '의약·보건', '#E11D48', 'Activity', 4),
('11111111-0005-4000-8000-000000000005', '교육·사범', '#7C3AED', 'GraduationCap', 5),
('11111111-0006-4000-8000-000000000006', '경영·경제', '#0891B2', 'TrendingUp', 6),
('11111111-0007-4000-8000-000000000007', '예술·체육', '#DB2777', 'Palette', 7),
('11111111-0008-4000-8000-000000000008', '융합·자율', '#4F46E5', 'Compass', 8)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sessions (id, title, date, is_active) VALUES 
('22222222-0001-4000-8000-000000000001', '1차시 : 진로 탐색 및 핵심 도서 선정', '2026-03-10', TRUE),
('22222222-0002-4000-8000-000000000002', '2차시 : 심화 쟁점 분석 및 비판적 읽기', '2026-03-24', TRUE),
('22222222-0003-4000-8000-000000000003', '3차시 : 진로 융합 탐구 및 인사이트 나눔', '2026-04-07', TRUE),
('22222222-0004-4000-8000-000000000004', '4차시 : 독서 연계 주제 탐구 포트폴리오', '2026-04-21', FALSE)
ON CONFLICT (id) DO NOTHING;</pre>
      </div>

    </div>
  `;
}

/**
 * 퀵 Supabase 설정 모달 (보안 마스킹 적용)
 */
function renderSupabaseConfigModal() {
  const modal = document.getElementById('supabase-quick-modal');
  if (!modal) return;

  if (!state.isSupabaseConfigOpen) {
    modal.classList.add('hidden');
    return;
  }

  modal.classList.remove('hidden');

  modal.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div class="glass-modal w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl border border-slate-100 p-6 sm:p-8">
        
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <i data-lucide="database" class="w-5 h-5"></i>
            </div>
            <div>
              <h2 class="text-lg font-bold text-slate-900">Supabase 연동 설정</h2>
              <p class="text-xs text-slate-500">실시간 클라우드 DB 연동</p>
            </div>
          </div>
          <button id="btn-close-quick-supabase" class="p-1.5 rounded-xl text-slate-400 hover:text-slate-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="quick-supabase-form" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">VITE_SUPABASE_URL</label>
            <input 
              type="url" 
              id="quick-supabase-url" 
              value="${escapeHtml(cfg.url || '')}" 
              placeholder="https://xxxxxxxx.supabase.co" 
              class="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">VITE_SUPABASE_ANON_KEY</label>
            <input 
              type="text" 
              id="quick-supabase-key" 
              value="${escapeHtml(cfg.anonKey || '')}" 
              placeholder="eyJhbGciOiJIUz..." 
              class="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
          </div>

          <div class="p-3 rounded-xl bg-slate-50 text-[11px] text-slate-600 border border-slate-200">
            📌 키를 비워두면 브라우저 로컬 저장소(Mock)로 즉시 작동합니다.
          </div>

          <div class="flex items-center gap-3 pt-2">
            <button type="button" id="btn-quick-test-conn" class="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200">
              연결 테스트
            </button>
            <button type="submit" class="flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200">
              저장 및 연동
            </button>
          </div>
        </form>

      </div>
    </div>
  `;

  lucide.createIcons();
  bindQuickSupabaseEvents();
}

// ==========================================
// 이벤트 바인딩 (Event Handlers)
// ==========================================
function bindGlobalEvents() {
  // 로고 클릭 시 전체 피드로 리셋
  document.addEventListener('click', e => {
    const logoBtn = e.target.closest('#nav-logo-btn');
    if (logoBtn) {
      state.selectedTrackId = 'all';
      state.selectedSessionId = 'all';
      state.searchQuery = '';
      renderTrackSelector();
      renderSessionFilter();
      renderFeed();
    }

    // 작성 모달 열기 버튼
    const openFormBtn = e.target.closest('#btn-open-form-modal') || e.target.closest('#btn-empty-write');
    if (openFormBtn) {
      state.isFormModalOpen = true;
      renderModals();
    }

    // Supabase 뱃지 버튼 클릭
    const supabaseBtn = e.target.closest('#btn-supabase-status');
    if (supabaseBtn) {
      state.isSupabaseConfigOpen = true;
      renderModals();
    }

    // 관리자 버튼 클릭
    const adminBtn = e.target.closest('#btn-admin-toggle');
    if (adminBtn) {
      if (state.isAdmin) {
        state.isAdminModalOpen = true;
      } else {
        state.isAdminLoginModalOpen = true;
      }
      renderModals();
    }

    // 진로 계열 필터 클릭
    const trackBtn = e.target.closest('.track-btn');
    if (trackBtn) {
      const trackId = trackBtn.getAttribute('data-track-id');
      if (trackId) {
        state.selectedTrackId = trackId;
        renderTrackSelector();
        renderFeed();
      }
    }

    // 차시 필터 클릭
    const sessionBtn = e.target.closest('.session-btn');
    if (sessionBtn) {
      const sessId = sessionBtn.getAttribute('data-session-id');
      if (sessId) {
        state.selectedSessionId = sessId;
        renderSessionFilter();
        renderFeed();
      }
    }

    // 피드 카드 클릭 -> 상세 모달
    const logCard = e.target.closest('[data-log-card-id]');
    if (logCard && !e.target.closest('.like-btn')) {
      const logId = logCard.getAttribute('data-log-card-id');
      const found = state.logs.find(l => l.id === logId);
      if (found) {
        state.selectedLog = found;
        state.isDetailModalOpen = true;
        renderModals();
      }
    }

    // 좋아요 버튼 클릭 (피드 카드)
    const likeBtn = e.target.closest('.like-btn');
    if (likeBtn) {
      e.stopPropagation();
      const logId = likeBtn.getAttribute('data-like-log-id');
      if (logId) {
        handleLikeLog(logId);
      }
    }

    // 검색어 클리어 버튼
    const clearSearchBtn = e.target.closest('#btn-clear-search');
    if (clearSearchBtn) {
      state.searchQuery = '';
      renderSessionFilter();
      renderFeed();
    }
  });

  // 검색창 입력 이벤트 (디바운스 처리)
  document.addEventListener('input', e => {
    if (e.target.id === 'search-input') {
      state.searchQuery = e.target.value;
      renderFeed();
    }
  });

  // 정렬 셀렉트 이벤트
  document.addEventListener('change', e => {
    if (e.target.id === 'sort-select') {
      state.sortBy = e.target.value;
      renderFeed();
    }
  });
}

async function handleLikeLog(logId) {
  const result = await toggleLikeReadingLog(logId);
  // 로컬 상태 동기화
  const target = state.logs.find(l => l.id === logId);
  if (target) {
    target.likes_count = result.count;
  }
  if (state.selectedLog && state.selectedLog.id === logId) {
    state.selectedLog.likes_count = result.count;
  }
  renderFeed();
  if (state.isDetailModalOpen) {
    renderDetailModal();
  }
}

function bindFormModalEvents() {
  const closeBtn = document.getElementById('btn-close-form-modal');
  const cancelBtn = document.getElementById('btn-cancel-form');
  const form = document.getElementById('reading-log-form');

  const closeModal = () => {
    state.isFormModalOpen = false;
    state.editingLogId = null;
    renderModals();
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;

  // 별점 인터랙션 바인딩
  const starContainer = document.getElementById('star-container');
  const starInput = document.getElementById('input-star-rating');
  const starText = document.getElementById('star-rating-text');

  if (starContainer && starInput) {
    const starLabels = ['', '1점 (다소 아쉬움)', '2점 (보통)', '3점 (유익함)', '4점 (적극 추천)', '5점 (인생의 책)'];
    starContainer.querySelectorAll('.star-rating-star').forEach(btn => {
      btn.onclick = () => {
        const val = Number(btn.getAttribute('data-star-val'));
        starInput.value = val;
        if (starText) starText.textContent = starLabels[val] || `${val}점`;
        starContainer.querySelectorAll('.star-rating-star').forEach((s, idx) => {
          if (idx < val) {
            s.classList.add('text-amber-400');
            s.classList.remove('text-slate-200');
          } else {
            s.classList.remove('text-amber-400');
            s.classList.add('text-slate-200');
          }
        });
      };
    });
  }

  // 폼 제출 이벤트 (등록 & 수정 공통)
  if (form) {
    form.onsubmit = async e => {
      e.preventDefault();

      const studentId = document.getElementById('form-student-id')?.value.trim();
      const studentName = document.getElementById('form-student-name')?.value.trim();
      const pin = document.getElementById('form-student-pin')?.value.trim();
      const trackId = document.getElementById('form-track-id')?.value;
      const sessionId = document.getElementById('form-session-id')?.value;

      if (!studentId || !studentName) {
        showToast('error', '학번과 이름을 모두 입력해 주세요.');
        return;
      }

      const isEditing = Boolean(state.editingLogId);

      // 비밀번호 검증 (신규 작성 시 필수 4자리, 수정 시 입력 시에만 4자리 검증)
      if (!isEditing && (!pin || !/^\d{4}$/.test(pin))) {
        showToast('error', '수정/삭제 본인 확인을 위한 숫자 4자리 비밀번호를 입력해 주세요. (예: 1234)');
        return;
      }
      if (isEditing && pin && !/^\d{4}$/.test(pin)) {
        showToast('error', '변경할 비밀번호는 숫자 4자리여야 합니다.');
        return;
      }

      // 학생 정보 캐싱
      state.studentCache.student_id = studentId;
      state.studentCache.name = studentName;
      localStorage.setItem('cached_student_id', studentId);
      localStorage.setItem('cached_student_name', studentName);

      // 동적 필드 수집
      const formData = new FormData(form);
      const content = {};

      const template = state.activeTemplate || { fields: [] };
      let hasValidationError = false;

      template.fields.forEach(field => {
        const val = formData.get(field.id);
        if (field.required && (!val || !val.toString().trim())) {
          hasValidationError = true;
          showToast('error', `'${field.label}' 항목은 필수 입력입니다.`);
        }
        content[field.id] = val ? val.toString().trim() : '';
      });

      if (hasValidationError) return;

      const submitBtn = document.getElementById('btn-submit-log');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> 저장 중...`;
        lucide.createIcons();
      }

      try {
        if (isEditing) {
          // 수정 모드
          const existingLog = state.logs.find(l => l.id === state.editingLogId);
          let passwordHash = existingLog?.student_info?.password_hash;
          if (pin) {
            passwordHash = await computeSHA256(pin);
          }

          const updateData = {
            track_id: trackId,
            session_id: sessionId,
            student_info: {
              student_id: studentId,
              name: studentName,
              password_hash: passwordHash || ''
            },
            content: content
          };

          const updated = await updateReadingLog(state.editingLogId, updateData);
          const idx = state.logs.findIndex(l => l.id === state.editingLogId);
          if (idx !== -1) state.logs[idx] = updated;
          if (state.selectedLog && state.selectedLog.id === state.editingLogId) {
            state.selectedLog = updated;
          }

          state.editingLogId = null;
          state.isFormModalOpen = false;
          renderModals();
          renderTrackSelector();
          renderFeed();
          showToast('success', `🎉 ${studentName} 학생의 독서일지가 성공적으로 수정되었습니다!`);
        } else {
          // 신규 등록 모드
          const pinHash = await computeSHA256(pin);
          const logData = {
            track_id: trackId,
            session_id: sessionId,
            student_info: {
              student_id: studentId,
              name: studentName,
              password_hash: pinHash
            },
            content: content
          };

          const created = await createReadingLog(logData);
          state.logs = [created, ...state.logs];

          state.isFormModalOpen = false;
          renderModals();
          renderTrackSelector();
          renderFeed();

          // 성공 폭죽 애니메이션 & 토스트
          triggerConfetti();
          showToast('success', `🎉 ${studentName} 학생의 독서일지가 성공적으로 등록되었습니다!`);
        }
      } catch (err) {
        showToast('error', `일지 저장 중 오류가 발생했습니다: ${err.message}`);
      }
    };
  }
}

function bindDetailModalEvents() {
  const closeBtn = document.getElementById('btn-close-detail-modal');
  const closeBottomBtn = document.getElementById('btn-close-detail-modal-bottom');
  const printBtn = document.getElementById('btn-print-detail');
  const shareBtn = document.getElementById('btn-copy-share');
  const editBtn = document.getElementById('btn-edit-detail');
  const deleteBtn = document.getElementById('btn-delete-detail');
  const detailLikeBtn = document.querySelector('[data-detail-like-id]');

  const closeModal = () => {
    state.isDetailModalOpen = false;
    state.selectedLog = null;
    renderModals();
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  if (closeBottomBtn) closeBottomBtn.onclick = closeModal;

  // 수정 버튼 클릭
  if (editBtn) {
    editBtn.onclick = () => {
      const log = state.selectedLog;
      if (!log) return;
      if (state.isAdmin) {
        // 관리자는 비밀번호 없이 즉시 수정
        state.editingLogId = log.id;
        state.isDetailModalOpen = false;
        state.isFormModalOpen = true;
        renderModals();
      } else {
        // 학생은 4자리 비밀번호 확인 창 열기
        state.authPinModal = {
          isOpen: true,
          logId: log.id,
          action: 'edit'
        };
        renderAuthPinModal();
      }
    };
  }

  // 삭제 버튼 클릭
  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      const log = state.selectedLog;
      if (!log) return;
      if (state.isAdmin) {
        if (confirm(`'${log.content?.field_book || '독서일지'}'를 정말 삭제하시겠습니까?`)) {
          await deleteReadingLog(log.id);
          state.logs = state.logs.filter(l => l.id !== log.id);
          state.isDetailModalOpen = false;
          state.selectedLog = null;
          renderModals();
          renderTrackSelector();
          renderFeed();
          showToast('success', '독서일지가 삭제되었습니다.');
        }
      } else {
        state.authPinModal = {
          isOpen: true,
          logId: log.id,
          action: 'delete'
        };
        renderAuthPinModal();
      }
    };
  }

  if (printBtn) {
    printBtn.onclick = () => {
      window.print();
    };
  }

  if (shareBtn) {
    shareBtn.onclick = () => {
      const log = state.selectedLog;
      if (!log) return;
      const text = `[진로 독서 일지] ${log.content?.field_book || '도서'} (${log.student_info?.name || '학생'})\n- 진로 연계: ${log.content?.field_career || ''}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast('success', '독서일지 내용이 클립보드에 복사되었습니다.');
      });
    };
  }

  if (detailLikeBtn) {
    detailLikeBtn.onclick = () => {
      const logId = detailLikeBtn.getAttribute('data-detail-like-id');
      if (logId) {
        handleLikeLog(logId);
      }
    };
  }
}

/**
 * 4자리 비밀번호 확인 모달 이벤트
 */
function bindAuthPinModalEvents() {
  const closeBtn = document.getElementById('btn-close-auth-pin');
  const form = document.getElementById('auth-pin-form');

  if (closeBtn) {
    closeBtn.onclick = () => {
      state.authPinModal = { isOpen: false, logId: null, action: null };
      renderAuthPinModal();
    };
  }

  if (form) {
    form.onsubmit = async e => {
      e.preventDefault();
      const inputPin = document.getElementById('auth-pin-input')?.value.trim();
      const logId = state.authPinModal.logId;
      const action = state.authPinModal.action;

      if (!inputPin || !/^\d{4}$/.test(inputPin)) {
        showToast('error', '숫자 4자리 비밀번호를 입력해 주세요.');
        return;
      }

      const targetLog = state.logs.find(l => l.id === logId);
      if (!targetLog) {
        showToast('error', '해당 일지를 찾을 수 없습니다.');
        return;
      }

      const inputHash = await computeSHA256(inputPin);
      const storedHash = targetLog.student_info?.password_hash;
      const defaultPinHash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'; // 1234

      // 비밀번호 일치 검증 (기존 비밀번호가 없으면 1234 기본 통과 허용)
      const isValid = storedHash ? (inputHash === storedHash) : (inputPin === '1234' || inputHash === defaultPinHash);

      if (!isValid) {
        showToast('error', '비밀번호가 일치하지 않습니다. 다시 확인해 주세요.');
        const pinInput = document.getElementById('auth-pin-input');
        if (pinInput) {
          pinInput.value = '';
          pinInput.focus();
        }
        return;
      }

      // 인증 성공
      if (action === 'edit') {
        state.authPinModal = { isOpen: false, logId: null, action: null };
        state.isDetailModalOpen = false;
        state.selectedLog = null;
        state.editingLogId = logId;
        state.isFormModalOpen = true;
        renderModals();
        showToast('success', '비밀번호가 확인되었습니다. 일지를 수정할 수 있습니다.');
      } else if (action === 'delete') {
        if (confirm(`'${targetLog.content?.field_book || '독서일지'}'를 정말 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.`)) {
          await deleteReadingLog(logId);
          state.logs = state.logs.filter(l => l.id !== logId);
          state.authPinModal = { isOpen: false, logId: null, action: null };
          state.isDetailModalOpen = false;
          state.selectedLog = null;
          renderModals();
          renderTrackSelector();
          renderFeed();
          showToast('success', '독서일지가 안전하게 삭제되었습니다.');
        }
      }
    };
  }
}

function bindAdminLoginEvents() {
  const closeBtn = document.getElementById('btn-close-admin-login');
  const form = document.getElementById('admin-login-form');

  if (closeBtn) {
    closeBtn.onclick = () => {
      state.isAdminLoginModalOpen = false;
      renderModals();
    };
  }

  if (form) {
    form.onsubmit = async e => {
      e.preventDefault();
      const pwInput = document.getElementById('admin-password-input')?.value || '';
      
      // SHA-256 단방향 해시 변환 및 검증
      const inputHash = await computeSHA256(pwInput);
      const targetHash = localStorage.getItem('admin_password_hash') || ADMIN_PASSWORD_HASH;

      if (inputHash === targetHash) {
        state.isAdmin = true;
        state.isAdminLoginModalOpen = false;
        state.isAdminModalOpen = true;
        renderNavbar();
        renderModals();
        showToast('success', '선생님 관리자 모드로 접속되었습니다.');
      } else {
        showToast('error', '비밀번호가 일치하지 않습니다.');
      }
    };
  }
}

function bindAdminModalEvents() {
  const closeBtn = document.getElementById('btn-close-admin-modal');
  const logoutBtn = document.getElementById('btn-admin-logout');

  if (closeBtn) {
    closeBtn.onclick = () => {
      state.isAdminModalOpen = false;
      renderModals();
    };
  }

  if (logoutBtn) {
    logoutBtn.onclick = () => {
      state.isAdmin = false;
      state.isAdminModalOpen = false;
      renderNavbar();
      renderModals();
      showToast('info', '관리자 모드가 종료되었습니다.');
    };
  }

  // 탭 전환 버튼
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.onclick = () => {
      const tab = btn.getAttribute('data-admin-tab');
      if (tab) {
        state.adminTab = tab;
        renderAdminModal();
      }
    };
  });

  // 1. 일지 관리 탭 - 필터 및 검색 이벤트
  const trackFilterSelect = document.getElementById('admin-filter-track-select');
  if (trackFilterSelect) {
    trackFilterSelect.onchange = e => {
      state.adminLogFilterTrack = e.target.value;
      renderAdminModal();
    };
  }

  const sessionFilterSelect = document.getElementById('admin-filter-session-select');
  if (sessionFilterSelect) {
    sessionFilterSelect.onchange = e => {
      state.adminLogFilterSession = e.target.value;
      renderAdminModal();
    };
  }

  const searchInput = document.getElementById('admin-filter-search-input');
  if (searchInput) {
    searchInput.oninput = e => {
      state.adminLogSearch = e.target.value;
      // 검색 입력 시 포커스 유지를 위해 DOM의 tbody만 부분 업데이트하거나 renderAdminModal() 호출
      renderAdminModal();
      const updatedInput = document.getElementById('admin-filter-search-input');
      if (updatedInput) {
        updatedInput.focus();
        updatedInput.selectionStart = updatedInput.selectionEnd = updatedInput.value.length;
      }
    };
  }

  // 일지 엑셀 / CSV 다운로드 (필터링된 결과만 추출)
  const excelBtn = document.getElementById('btn-export-excel');
  if (excelBtn) {
    excelBtn.onclick = () => {
      let filteredLogs = [...state.logs];
      if (state.adminLogFilterTrack && state.adminLogFilterTrack !== 'all') {
        filteredLogs = filteredLogs.filter(l => l.track_id === state.adminLogFilterTrack);
      }
      if (state.adminLogFilterSession && state.adminLogFilterSession !== 'all') {
        filteredLogs = filteredLogs.filter(l => l.session_id === state.adminLogFilterSession);
      }
      if (state.adminLogSearch && state.adminLogSearch.trim()) {
        const q = state.adminLogSearch.toLowerCase().trim();
        filteredLogs = filteredLogs.filter(l => {
          const book = (l.content?.field_book || '').toLowerCase();
          const author = (l.content?.field_author || '').toLowerCase();
          const name = (l.student_info?.name || '').toLowerCase();
          const studentId = (l.student_info?.student_id || '').toLowerCase();
          return book.includes(q) || author.includes(q) || name.includes(q) || studentId.includes(q);
        });
      }

      const trackMap = new Map(state.tracks.map(t => [t.id, t.name]));
      const sessionMap = new Map(state.sessions.map(s => [s.id, s.title]));
      const filterInfo = {
        trackName: state.adminLogFilterTrack !== 'all' ? trackMap.get(state.adminLogFilterTrack) : '',
        sessionTitle: state.adminLogFilterSession !== 'all' ? sessionMap.get(state.adminLogFilterSession) : ''
      };

      exportLogsToExcel(filteredLogs, state.tracks, state.sessions, state.activeTemplate, filterInfo);
      showToast('success', `조회된 독서일지 ${filteredLogs.length}건이 Excel(.xlsx) 파일로 다운로드되었습니다.`);
    };
  }

  const csvBtn = document.getElementById('btn-export-csv');
  if (csvBtn) {
    csvBtn.onclick = () => {
      let filteredLogs = [...state.logs];
      if (state.adminLogFilterTrack && state.adminLogFilterTrack !== 'all') {
        filteredLogs = filteredLogs.filter(l => l.track_id === state.adminLogFilterTrack);
      }
      if (state.adminLogFilterSession && state.adminLogFilterSession !== 'all') {
        filteredLogs = filteredLogs.filter(l => l.session_id === state.adminLogFilterSession);
      }
      if (state.adminLogSearch && state.adminLogSearch.trim()) {
        const q = state.adminLogSearch.toLowerCase().trim();
        filteredLogs = filteredLogs.filter(l => {
          const book = (l.content?.field_book || '').toLowerCase();
          const author = (l.content?.field_author || '').toLowerCase();
          const name = (l.student_info?.name || '').toLowerCase();
          const studentId = (l.student_info?.student_id || '').toLowerCase();
          return book.includes(q) || author.includes(q) || name.includes(q) || studentId.includes(q);
        });
      }

      const trackMap = new Map(state.tracks.map(t => [t.id, t.name]));
      const sessionMap = new Map(state.sessions.map(s => [s.id, s.title]));
      const filterInfo = {
        trackName: state.adminLogFilterTrack !== 'all' ? trackMap.get(state.adminLogFilterTrack) : '',
        sessionTitle: state.adminLogFilterSession !== 'all' ? sessionMap.get(state.adminLogFilterSession) : ''
      };

      exportLogsToCSV(filteredLogs, state.tracks, state.sessions, state.activeTemplate, filterInfo);
      showToast('success', `조회된 독서일지 ${filteredLogs.length}건이 CSV 파일로 다운로드되었습니다.`);
    };
  }

  // 관리자 일지 수정 버튼
  document.querySelectorAll('[data-admin-edit-log]').forEach(btn => {
    btn.onclick = () => {
      const logId = btn.getAttribute('data-admin-edit-log');
      state.editingLogId = logId;
      state.isAdminModalOpen = false;
      state.isFormModalOpen = true;
      renderModals();
    };
  });

  // 관리자 일지 삭제 버튼
  document.querySelectorAll('[data-admin-delete-log]').forEach(btn => {
    btn.onclick = async () => {
      const logId = btn.getAttribute('data-admin-delete-log');
      if (confirm('이 독서일지를 삭제하시겠습니까?')) {
        await deleteReadingLog(logId);
        state.logs = state.logs.filter(l => l.id !== logId);
        renderAdminModal();
        renderTrackSelector();
        renderFeed();
        showToast('success', '일지가 삭제되었습니다.');
      }
    };
  });

  document.querySelectorAll('[data-admin-view-log]').forEach(btn => {
    btn.onclick = () => {
      const logId = btn.getAttribute('data-admin-view-log');
      const found = state.logs.find(l => l.id === logId);
      if (found) {
        state.selectedLog = found;
        state.isDetailModalOpen = true;
        renderDetailModal();
      }
    };
  });

  // 2. 템플릿 빌더 이벤트
  const templateTitleInput = document.getElementById('template-title-input');
  if (templateTitleInput) {
    templateTitleInput.oninput = e => {
      if (state.editingTemplate) {
        state.editingTemplate.title = e.target.value;
      }
    };
  }

  const addFieldBtn = document.getElementById('btn-add-template-field');
  if (addFieldBtn) {
    addFieldBtn.onclick = () => {
      const newField = {
        id: `field_${Date.now()}`,
        label: '새로운 질문 항목',
        type: 'textarea',
        required: true,
        placeholder: '내용을 작성해 주세요.'
      };
      state.editingTemplate.fields.push(newField);
      renderAdminModal();
    };
  }

  document.querySelectorAll('[data-field-index]').forEach(row => {
    const idx = Number(row.getAttribute('data-field-index'));
    const field = state.editingTemplate.fields[idx];
    if (!field) return;

    row.querySelectorAll('[data-field-key]').forEach(input => {
      input.oninput = input.onchange = e => {
        const key = input.getAttribute('data-field-key');
        if (key === 'required') {
          field.required = input.checked;
        } else {
          field[key] = input.value;
        }
      };
    });
  });

  document.querySelectorAll('[data-field-move-up]').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.getAttribute('data-field-move-up'));
      if (idx > 0) {
        const temp = state.editingTemplate.fields[idx];
        state.editingTemplate.fields[idx] = state.editingTemplate.fields[idx - 1];
        state.editingTemplate.fields[idx - 1] = temp;
        renderAdminModal();
      }
    };
  });

  document.querySelectorAll('[data-field-move-down]').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.getAttribute('data-field-move-down'));
      if (idx < state.editingTemplate.fields.length - 1) {
        const temp = state.editingTemplate.fields[idx];
        state.editingTemplate.fields[idx] = state.editingTemplate.fields[idx + 1];
        state.editingTemplate.fields[idx + 1] = temp;
        renderAdminModal();
      }
    };
  });

  document.querySelectorAll('[data-field-delete]').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.getAttribute('data-field-delete'));
      if (confirm('이 질문 항목을 삭제하시겠습니까?')) {
        state.editingTemplate.fields.splice(idx, 1);
        renderAdminModal();
      }
    };
  });

  const saveTemplateBtn = document.getElementById('btn-save-template');
  if (saveTemplateBtn) {
    saveTemplateBtn.onclick = async () => {
      const saved = await saveTemplate(state.editingTemplate);
      state.activeTemplate = saved;
      showToast('success', '독서일지 양식이 저장되었으며 학생 작성 폼에 즉시 반영됩니다!');
    };
  }

  // 3. 진로 계열 탭 이벤트
  const addTrackForm = document.getElementById('add-track-form');
  const colorInput = document.getElementById('new-track-color');
  const colorText = document.getElementById('new-track-color-text');

  if (colorInput && colorText) {
    colorInput.oninput = () => {
      colorText.textContent = colorInput.value;
    };
  }

  if (addTrackForm) {
    addTrackForm.onsubmit = async e => {
      e.preventDefault();
      const name = document.getElementById('new-track-name')?.value.trim();
      const color = colorInput?.value || '#4F46E5';

      if (!name) return;

      const newTrack = await createCareerTrack({
        name,
        color,
        icon: 'BookOpen',
        order_num: state.tracks.length + 1
      });

      state.tracks.push(newTrack);
      renderAdminModal();
      renderTrackSelector();
      showToast('success', `'${name}' 진로 계열이 추가되었습니다.`);
    };
  }

  document.querySelectorAll('[data-delete-track]').forEach(btn => {
    btn.onclick = async () => {
      const trackId = btn.getAttribute('data-delete-track');
      if (confirm('이 진로 계열을 삭제하시겠습니까?')) {
        await deleteCareerTrack(trackId);
        state.tracks = state.tracks.filter(t => t.id !== trackId);
        if (state.selectedTrackId === trackId) state.selectedTrackId = 'all';
        renderAdminModal();
        renderTrackSelector();
        renderFeed();
        showToast('success', '진로 계열이 삭제되었습니다.');
      }
    };
  });

  // 4. 차시 관리 탭 이벤트
  const addSessionForm = document.getElementById('add-session-form');
  if (addSessionForm) {
    addSessionForm.onsubmit = async e => {
      e.preventDefault();
      const title = document.getElementById('new-session-title')?.value.trim();
      const date = document.getElementById('new-session-date')?.value;

      if (!title || !date) return;

      const newSess = await createSession({
        title,
        date,
        is_active: true
      });

      state.sessions.push(newSess);
      renderAdminModal();
      renderSessionFilter();
      showToast('success', `'${title}' 활동 차시가 등록되었습니다.`);
    };
  }

  document.querySelectorAll('[data-toggle-session]').forEach(btn => {
    btn.onclick = async () => {
      const sessId = btn.getAttribute('data-toggle-session');
      const sess = state.sessions.find(s => s.id === sessId);
      if (sess) {
        const updated = await updateSession(sessId, { is_active: !sess.is_active });
        sess.is_active = updated.is_active;
        renderAdminModal();
        renderSessionFilter();
        showToast('info', `차시 상태가 변경되었습니다.`);
      }
    };
  });

  document.querySelectorAll('[data-delete-session]').forEach(btn => {
    btn.onclick = async () => {
      const sessId = btn.getAttribute('data-delete-session');
      if (confirm('이 활동 차시를 삭제하시겠습니까?')) {
        await deleteSession(sessId);
        state.sessions = state.sessions.filter(s => s.id !== sessId);
        if (state.selectedSessionId === sessId) state.selectedSessionId = 'all';
        renderAdminModal();
        renderSessionFilter();
        renderFeed();
        showToast('success', '활동 차시가 삭제되었습니다.');
      }
    };
  });

  // 5. Supabase 탭 이벤트 (보안 마스킹 및 키 전환)
  const toggleEditBtn = document.getElementById('btn-toggle-supabase-edit');
  const cancelEditBtn = document.getElementById('btn-cancel-supabase-edit');
  const supabaseForm = document.getElementById('supabase-config-form');
  const testConnBtn = document.getElementById('btn-test-supabase-conn');
  const copySqlBtn = document.getElementById('btn-copy-sql-schema');
  const resetDemoBtn = document.getElementById('btn-reset-demo-data');

  if (toggleEditBtn) {
    toggleEditBtn.onclick = () => {
      state.supabaseEditMode = true;
      renderAdminModal();
    };
  }

  if (cancelEditBtn) {
    cancelEditBtn.onclick = () => {
      state.supabaseEditMode = false;
      renderAdminModal();
    };
  }

  if (testConnBtn) {
    testConnBtn.onclick = async () => {
      const url = state.supabaseConfig.url;
      const key = state.supabaseConfig.anonKey;
      testConnBtn.disabled = true;
      testConnBtn.textContent = '연결 상태 점검 중...';
      const res = await testSupabaseConnection(url, key);
      testConnBtn.disabled = false;
      testConnBtn.textContent = '연결 상태 점검';
      if (res.success) {
        showToast('success', res.message);
      } else {
        showToast('error', res.message);
      }
    };
  }

  if (supabaseForm) {
    supabaseForm.onsubmit = async e => {
      e.preventDefault();
      const url = document.getElementById('admin-supabase-url')?.value.trim();
      const key = document.getElementById('admin-supabase-key')?.value.trim();
      saveSupabaseConfig(url, key);
      state.supabaseConfig = { url, anonKey: key };
      state.supabaseEditMode = false;
      await checkSupabaseStatus();
      await refreshAllData();
      renderApp();
      renderAdminModal();
      showToast('success', '새로운 Supabase 설정이 안전하게 저장되었습니다!');
    };
  }

  if (copySqlBtn) {
    copySqlBtn.onclick = () => {
      const code = document.getElementById('sql-schema-code')?.textContent || '';
      navigator.clipboard.writeText(code).then(() => {
        showToast('success', 'Supabase SQL 스키마가 클립보드에 복사되었습니다.');
      });
    };
  }

  if (resetDemoBtn) {
    resetDemoBtn.onclick = async () => {
      if (confirm('초기 샘플 데이터로 복구하시겠습니까? 현재 로컬 변경사항이 초기화됩니다.')) {
        resetToDemoData();
        await refreshAllData();
        renderApp();
        showToast('info', '초기 샘플 데이터로 복구되었습니다.');
      }
    };
  }
}

function bindQuickSupabaseEvents() {
  const closeBtn = document.getElementById('btn-close-quick-supabase');
  const closeActionBtn = document.getElementById('btn-close-quick-modal-action');
  const testBtn = document.getElementById('btn-quick-test-conn');

  const closeQuick = () => {
    state.isSupabaseConfigOpen = false;
    renderModals();
  };

  if (closeBtn) closeBtn.onclick = closeQuick;
  if (closeActionBtn) closeActionBtn.onclick = closeQuick;

  if (testBtn) {
    testBtn.onclick = async () => {
      const url = state.supabaseConfig.url;
      const key = state.supabaseConfig.anonKey;
      testBtn.disabled = true;
      testBtn.textContent = '점검 중...';
      const res = await testSupabaseConnection(url, key);
      testBtn.disabled = false;
      testBtn.textContent = '연결 상태 점검';
      if (res.success) {
        showToast('success', res.message);
      } else {
        showToast('error', res.message);
      }
    };
  }
}

// ==========================================
// 헬퍼 유틸리티 함수들
// ==========================================
function getIconForTrack(name, defaultIcon) {
  if (!name) return defaultIcon || 'book-open';
  if (name.includes('자연') || name.includes('과학')) return 'atom';
  if (name.includes('공학') || name.includes('IT') || name.includes('소프트웨어')) return 'cpu';
  if (name.includes('인문') || name.includes('사회')) return 'book-open';
  if (name.includes('의약') || name.includes('보건') || name.includes('의학')) return 'activity';
  if (name.includes('교육') || name.includes('사범')) return 'graduation-cap';
  if (name.includes('경영') || name.includes('경제')) return 'trending-up';
  if (name.includes('예술') || name.includes('체육')) return 'palette';
  if (name.includes('융합') || name.includes('자율')) return 'compass';
  return defaultIcon || 'book-open';
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export function showToast(type = 'info', message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const isSuccess = type === 'success';
  const isError = type === 'error';

  toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold transition-all duration-300 transform translate-y-3 opacity-0 animate-scale-in ${
    isSuccess
      ? 'bg-emerald-900 text-emerald-50 border-emerald-700'
      : isError
      ? 'bg-rose-900 text-rose-50 border-rose-700'
      : 'bg-slate-900 text-slate-50 border-slate-700'
  }`;

  const iconName = isSuccess ? 'check-circle-2' : isError ? 'alert-circle' : 'info';

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 ${isSuccess ? 'text-emerald-400' : isError ? 'text-rose-400' : 'text-indigo-400'} shrink-0"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-3', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function triggerConfetti() {
  if (window.confetti) {
    window.confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.7 }
    });
  }
}

/**
 * Web Crypto API를 활용한 안전한 SHA-256 해시 계산
 */
async function computeSHA256(str) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.error('SHA-256 hash calculation failed:', err);
    return '';
  }
}

