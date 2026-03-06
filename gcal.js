/* ══════════════════════════════════════════════════════════════
   PlayTag — Google Calendar 연동 모듈
   gcal.js

   ┌─────────────────────────────────────────────────────┐
   │  사용 전 반드시 설정:                                │
   │  1. Google Cloud Console에서 프로젝트 생성           │
   │  2. Google Calendar API 활성화                       │
   │  3. OAuth 2.0 클라이언트 ID 발급                     │
   │  4. 아래 GCAL_CLIENT_ID 에 붙여넣기                 │
   │  (설정 가이드는 README 또는 설정 패널 참조)          │
   └─────────────────────────────────────────────────────┘
══════════════════════════════════════════════════════════════ */

'use strict';

// ════════════════════════════════════════
// ⚙️  설정값 — 여기에 본인 값을 입력하세요
// ════════════════════════════════════════
const GCAL_CONFIG = {
  // Google Cloud Console > API 및 서비스 > 사용자 인증 정보 > OAuth 2.0 클라이언트 ID
  CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',

  // Google Calendar API 전체 읽기/쓰기 권한
  SCOPES: 'https://www.googleapis.com/auth/calendar',

  // 연동할 캘린더 ID ('primary' = 기본 캘린더)
  CALENDAR_ID: 'primary',

  // PlayTag 이벤트 색상 (Google Calendar 색상 코드 1~11)
  COLOR_MAP: {
    '교사교육': '1',  // 파랑
    '부모교육': '2',  // 초록
    'OT':       '3',  // 보라
    '설명회':   '5',  // 노랑
  },

  // 이벤트 기본 길이 (분)
  DEFAULT_DURATION_MIN: 120,
};

// ════════════════════════════════════════
// 내부 상태
// ════════════════════════════════════════
const gcal = {
  tokenClient:   null,   // Google Identity Services 토큰 클라이언트
  accessToken:   null,   // 현재 액세스 토큰
  gapiReady:     false,  // gapi 라이브러리 로드 완료 여부
  gisReady:      false,  // GIS 라이브러리 로드 완료 여부
  isConnected:   false,  // 현재 연결 상태
  userEmail:     '',     // 연결된 구글 계정 이메일
  syncedIds:     {},     // { appId: googleEventId } 동기화 매핑 테이블
};

// ════════════════════════════════════════
// 라이브러리 초기화
// ════════════════════════════════════════

/** gapi 스크립트 로드 후 콜백으로 호출됨 */
window.gapiLoaded = function () {
  gapi.load('client', async () => {
    await gapi.client.init({
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
    });
    gcal.gapiReady = true;
    _checkBothReady();
  });
};

/** GIS(Google Identity Services) 스크립트 로드 후 콜백으로 호출됨 */
window.gisLoaded = function () {
  if (GCAL_CONFIG.CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
    // Client ID 미설정 시 → 설정 안내만 표시, 초기화 중단
    gcal.gisReady = false;
    return;
  }
  gcal.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GCAL_CONFIG.CLIENT_ID,
    scope:     GCAL_CONFIG.SCOPES,
    callback:  _handleTokenResponse,
  });
  gcal.gisReady = true;
  _checkBothReady();
};

function _checkBothReady() {
  if (gcal.gapiReady && gcal.gisReady) {
    _updateGcalUI();
  }
}

// ════════════════════════════════════════
// OAuth 인증 흐름
// ════════════════════════════════════════

/** 구글 캘린더 연결 버튼 클릭 */
function gcalConnect() {
  if (GCAL_CONFIG.CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
    openModal('modal-gcal-setup');
    return;
  }
  if (!gcal.tokenClient) {
    showNotif('Google 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.', 'danger');
    return;
  }
  const existing = gapi.client.getToken();
  gcal.tokenClient.requestAccessToken({ prompt: existing ? '' : 'consent' });
}

/** 구글 캘린더 연결 해제 */
function gcalDisconnect() {
  const token = gapi.client.getToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token, () => {});
    gapi.client.setToken('');
  }
  gcal.accessToken  = null;
  gcal.isConnected  = false;
  gcal.userEmail    = '';
  _updateGcalUI();
  showNotif('Google 캘린더 연결이 해제되었습니다.', 'danger');
}

/** 토큰 발급 콜백 */
async function _handleTokenResponse(resp) {
  if (resp.error) {
    showNotif(`Google 인증 오류: ${resp.error}`, 'danger');
    return;
  }
  gcal.accessToken = gapi.client.getToken().access_token;
  gcal.isConnected = true;

  // 연결된 계정 이메일 조회
  try {
    const res = await gapi.client.request({
      path: 'https://www.googleapis.com/oauth2/v3/userinfo',
    });
    gcal.userEmail = res.result.email || '';
  } catch (_) {}

  _updateGcalUI();
  showNotif(`✅ Google 캘린더 연결 완료! (${gcal.userEmail})`, 'success');

  // 연결 직후 → 기존 확정 일정들을 구글 캘린더와 동기화
  await gcalSyncAll();
}

// ════════════════════════════════════════
// UI 상태 갱신
// ════════════════════════════════════════
function _updateGcalUI() {
  const statusDot  = el('gcal-status-dot');
  const statusText = el('gcal-status-text');
  const connectBtn = el('gcal-connect-btn');
  const disconnBtn = el('gcal-disconn-btn');
  const emailEl    = el('gcal-email');
  const syncBtn    = el('gcal-sync-btn');

  if (!statusDot) return; // 아직 DOM 미준비

  if (gcal.isConnected) {
    statusDot.style.background  = 'var(--pt-success)';
    statusText.textContent      = '연결됨';
    emailEl.textContent         = gcal.userEmail;
    connectBtn.style.display    = 'none';
    disconnBtn.style.display    = '';
    syncBtn.style.display       = '';
  } else {
    const configured = GCAL_CONFIG.CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
    statusDot.style.background  = configured ? '#94A3B8' : '#FCA5A5';
    statusText.textContent      = configured ? '미연결' : 'API 키 미설정';
    emailEl.textContent         = '';
    connectBtn.style.display    = '';
    disconnBtn.style.display    = 'none';
    syncBtn.style.display       = 'none';
  }
}

// ════════════════════════════════════════
// 이벤트 생성
// ════════════════════════════════════════

/**
 * 배정 확정된 신청 1건을 구글 캘린더에 추가
 * @param {Object} app - applications 배열의 항목
 * @returns {string|null} 생성된 구글 이벤트 ID
 */
async function gcalCreateEvent(app) {
  if (!gcal.isConnected || !gcal.gapiReady) return null;

  const staff = STAFF.find(s => s.id === app.assignedStaff);
  const start = new Date(app.assignedDate);
  const end   = new Date(start.getTime() + GCAL_CONFIG.DEFAULT_DURATION_MIN * 60 * 1000);

  const attendees = [];
  if (staff?.email) attendees.push({ email: staff.email, displayName: staff.name });

  const event = {
    summary:     `[PlayTag] ${app.program} — ${app.branch}`,
    location:    `${app.addr}${app.addrDetail ? ' ' + app.addrDetail : ''}`,
    description: _buildDescription(app, staff),
    start:  { dateTime: start.toISOString(), timeZone: 'Asia/Seoul' },
    end:    { dateTime: end.toISOString(),   timeZone: 'Asia/Seoul' },
    colorId: GCAL_CONFIG.COLOR_MAP[app.program] || '1',
    attendees,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email',  minutes: 24 * 60 }, // 1일 전 이메일
        { method: 'popup',  minutes: 60 },       // 1시간 전 팝업
      ],
    },
    extendedProperties: {
      private: {
        playtag_app_id: app.id,
        playtag_prog:   app.program,
      },
    },
  };

  try {
    const res = await gapi.client.calendar.events.insert({
      calendarId: GCAL_CONFIG.CALENDAR_ID,
      resource:   event,
      sendUpdates: 'all', // 참석자에게 초대 이메일 발송
    });
    gcal.syncedIds[app.id] = res.result.id;
    _saveSyncMap();
    return res.result.id;
  } catch (err) {
    console.error('[gcal] 이벤트 생성 실패:', err);
    return null;
  }
}

/**
 * 기존 구글 이벤트를 수정 (재배정 시)
 * @param {Object} app
 */
async function gcalUpdateEvent(app) {
  if (!gcal.isConnected || !gcal.gapiReady) return;
  const googleId = gcal.syncedIds[app.id];
  if (!googleId) { return gcalCreateEvent(app); } // 없으면 새로 생성

  const staff = STAFF.find(s => s.id === app.assignedStaff);
  const start = new Date(app.assignedDate);
  const end   = new Date(start.getTime() + GCAL_CONFIG.DEFAULT_DURATION_MIN * 60 * 1000);

  const patch = {
    summary:     `[PlayTag] ${app.program} — ${app.branch}`,
    location:    `${app.addr}${app.addrDetail ? ' ' + app.addrDetail : ''}`,
    description: _buildDescription(app, staff),
    start:  { dateTime: start.toISOString(), timeZone: 'Asia/Seoul' },
    end:    { dateTime: end.toISOString(),   timeZone: 'Asia/Seoul' },
    colorId: GCAL_CONFIG.COLOR_MAP[app.program] || '1',
  };

  try {
    await gapi.client.calendar.events.patch({
      calendarId: GCAL_CONFIG.CALENDAR_ID,
      eventId:    googleId,
      resource:   patch,
    });
  } catch (err) {
    // 이벤트가 구글 캘린더에서 삭제됐을 수 있음 → 재생성
    delete gcal.syncedIds[app.id];
    await gcalCreateEvent(app);
  }
}

/**
 * 구글 캘린더에서 이벤트 삭제 (반려 시)
 * @param {string} appId
 */
async function gcalDeleteEvent(appId) {
  if (!gcal.isConnected || !gcal.gapiReady) return;
  const googleId = gcal.syncedIds[appId];
  if (!googleId) return;

  try {
    await gapi.client.calendar.events.delete({
      calendarId: GCAL_CONFIG.CALENDAR_ID,
      eventId:    googleId,
    });
    delete gcal.syncedIds[appId];
    _saveSyncMap();
  } catch (err) {
    console.error('[gcal] 이벤트 삭제 실패:', err);
  }
}

// ════════════════════════════════════════
// 전체 동기화
// ════════════════════════════════════════

/**
 * 확정(confirmed) 상태인 모든 신청을 구글 캘린더에 동기화
 * - 이미 동기화된 건은 업데이트, 새 건은 신규 생성
 */
async function gcalSyncAll() {
  if (!gcal.isConnected) {
    showNotif('먼저 Google 캘린더를 연결해주세요.', 'danger');
    return;
  }

  const confirmed = applications.filter(a => a.status === 'confirmed');
  if (!confirmed.length) {
    showNotif('동기화할 확정 일정이 없습니다.', 'danger');
    return;
  }

  _showSyncProgress(true);
  let success = 0, failed = 0;

  for (const app of confirmed) {
    const existing = gcal.syncedIds[app.id];
    const result   = existing ? await gcalUpdateEvent(app) : await gcalCreateEvent(app);
    if (result !== null || existing) success++; else failed++;

    // 진행률 표시
    _setSyncProgress(Math.round(((success + failed) / confirmed.length) * 100));
    await _sleep(200); // API rate limit 방지
  }

  _showSyncProgress(false);
  _saveSyncMap();

  const msg = `동기화 완료 — ${success}건 성공${failed ? `, ${failed}건 실패` : ''}`;
  showNotif(msg, failed > 0 ? 'danger' : 'success');
  _updateSyncStatusUI();
}

/**
 * 구글 캘린더에서 이벤트 목록을 읽어와 캘린더에 표시
 * (외부에서 추가된 일정 포함)
 */
async function gcalFetchEvents() {
  if (!gcal.isConnected || !gcal.gapiReady) return [];

  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 3, 0);

  try {
    const res = await gapi.client.calendar.events.list({
      calendarId:   GCAL_CONFIG.CALENDAR_ID,
      timeMin:      start.toISOString(),
      timeMax:      end.toISOString(),
      singleEvents: true,
      orderBy:      'startTime',
      maxResults:   250,
      q:            '[PlayTag]',  // PlayTag 이벤트만 필터
    });
    return res.result.items || [];
  } catch (err) {
    console.error('[gcal] 이벤트 조회 실패:', err);
    return [];
  }
}

// ════════════════════════════════════════
// 동기화 맵 영속성 (localStorage)
// ════════════════════════════════════════
function _saveSyncMap() {
  try {
    localStorage.setItem('pt_gcal_sync', JSON.stringify(gcal.syncedIds));
  } catch (_) {}
}

function _loadSyncMap() {
  try {
    const raw = localStorage.getItem('pt_gcal_sync');
    if (raw) gcal.syncedIds = JSON.parse(raw);
  } catch (_) {}
}
_loadSyncMap();

// ════════════════════════════════════════
// 헬퍼
// ════════════════════════════════════════
function _buildDescription(app, staff) {
  return [
    `📋 프로그램: ${app.program}`,
    `🏢 지사: ${app.branch}`,
    `📍 장소: ${app.addr}${app.addrDetail ? ' ' + app.addrDetail : ''}`,
    `👥 예상 인원: ${app.count}명`,
    `👤 담당자: ${staff ? staff.name + ' (' + staff.tel + ')' : '미배정'}`,
    app.note ? `📝 특이사항: ${app.note}` : '',
    '',
    '— PlayTag 교육·설명회 신청 관리 시스템에서 자동 생성',
  ].filter(Boolean).join('\n');
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 동기화 진행 바 ──
function _showSyncProgress(show) {
  const bar = el('gcal-sync-progress');
  if (bar) bar.style.display = show ? '' : 'none';
}
function _setSyncProgress(pct) {
  const fill = el('gcal-sync-progress-fill');
  const txt  = el('gcal-sync-progress-text');
  if (fill) fill.style.width   = pct + '%';
  if (txt)  txt.textContent    = `동기화 중... ${pct}%`;
}
function _updateSyncStatusUI() {
  const cnt = el('gcal-synced-count');
  if (cnt) cnt.textContent = Object.keys(gcal.syncedIds).length;
}

// ── 구글 캘린더 열기 ──
function gcalOpenInBrowser() {
  window.open('https://calendar.google.com', '_blank');
}
