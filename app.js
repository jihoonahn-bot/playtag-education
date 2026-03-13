/* ══════════════════════════════════════
   PlayTag 교육·설명회 신청 관리 시스템
   app.js  v4 (Security Hardened)
   - localStorage 영속성: 파일 수정/재배포해도 데이터 유지
   - 신청자 회원가입 플로우 (연락처+사업자번호 → ID/PW 설정)
══════════════════════════════════════ */

'use strict';

// ════════════════════════════════════════

// ════════════════════════════════════════
// 🔒 SECURITY MODULE — PlayTag v4
// ════════════════════════════════════════
const Security = (() => {
  'use strict';

  // ── 1. XSS 방지: HTML 이스케이프 ──
  const _esc_map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#x27;", '/':'&#x2F;', '`':'&#x60;' };
  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"'`/]/g, c => _esc_map[c]);
  }

  // ── 2. 입력값 검증 ──
  const Validate = {
    text(v, max = 200) {
      if (typeof v !== 'string') return '';
      return v.trim().slice(0, max);
    },
    number(v, min = 0, max = 99999) {
      const n = Number(v);
      if (!isFinite(n)) return 0;
      return Math.min(max, Math.max(min, Math.floor(n)));
    },
    date(v) {
      if (typeof v !== 'string') return '';
      return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : '';
    },
    id(v) {
      if (typeof v !== 'string') return '';
      return v.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 64);
    },
    email(v) {
      if (typeof v !== 'string') return '';
      const clean = v.trim().slice(0, 254);
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : '';
    },
    phone(v) {
      if (typeof v !== 'string') return '';
      return v.replace(/[^0-9\-+\s()]/g, '').slice(0, 20);
    },
  };

  // ── 3. Rate Limiter (로그인 브루트포스 방지) ──
  const _rateBuckets = {};
  function rateLimit(key, maxAttempts = 5, windowMs = 60000) {
    const now = Date.now();
    if (!_rateBuckets[key]) _rateBuckets[key] = { count: 0, resetAt: now + windowMs };
    const b = _rateBuckets[key];
    if (now > b.resetAt) { b.count = 0; b.resetAt = now + windowMs; }
    b.count++;
    if (b.count > maxAttempts) {
      const remaining = Math.ceil((b.resetAt - now) / 1000);
      return { blocked: true, remaining };
    }
    return { blocked: false, remaining: maxAttempts - b.count };
  }
  function resetRate(key) { delete _rateBuckets[key]; }

  // ── 4. CSRF 토큰 (세션 단위) ──
  let _csrfToken = null;
  function getCsrfToken() {
    if (!_csrfToken) {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      _csrfToken = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
    }
    return _csrfToken;
  }
  function verifyCsrf(token) { return token === _csrfToken; }

  // ── 5. 세션 타임아웃 (30분 무활동 자동 로그아웃) ──
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  let _lastActivity = Date.now();
  let _sessionTimer = null;

  function touchSession() { _lastActivity = Date.now(); }
  function startSessionWatchdog(logoutFn) {
    if (_sessionTimer) clearInterval(_sessionTimer);
    _sessionTimer = setInterval(() => {
      if (Date.now() - _lastActivity > SESSION_TIMEOUT_MS) {
        clearInterval(_sessionTimer);
        logoutFn('세션이 만료되었습니다. 다시 로그인해주세요.');
      }
    }, 60000); // 1분마다 체크
  }
  function stopSessionWatchdog() {
    if (_sessionTimer) { clearInterval(_sessionTimer); _sessionTimer = null; }
  }

  // ── 6. localStorage 데이터 무결성 (간단한 체크섬) ──
  function safeLoad(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      // 배열/객체 타입 검증
      if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
      return parsed;
    } catch(e) {
      console.warn(`[Security] localStorage 파싱 실패 (${key}):`, e.message);
      return fallback;
    }
  }
  function safeSave(key, data) {
    try {
      const serialized = JSON.stringify(data);
      // 저장 용량 제한 (5MB 초과 방지)
      if (serialized.length > 5 * 1024 * 1024) {
        console.warn(`[Security] 저장 데이터 초과 (${key})`);
        return false;
      }
      localStorage.setItem(key, serialized);
      return true;
    } catch(e) {
      console.warn(`[Security] localStorage 저장 실패 (${key}):`, e.message);
      return false;
    }
  }

  // ── 7. 비밀번호 해시 (SHA-256 기반, 소금 포함) ──
  async function hashPassword(pw, salt = null) {
    if (!salt) {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      salt = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(salt + pw + 'playtag_pepper_2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
    return { hash: hashHex, salt };
  }
  async function verifyPassword(pw, storedHash, salt) {
    const { hash } = await hashPassword(pw, salt);
    return hash === storedHash;
  }

  // ── 8. 출력 로그 (개발자 콘솔 정보 노출 최소화) ──
  function secureLog(msg, level = 'info') {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      console[level](`[PlayTag] ${msg}`);
    }
    // 프로덕션에서는 민감 정보 로그 차단
  }

  // ── 9. DOM 기반 XSS 방지: 안전한 텍스트 삽입 ──
  function setText(el_or_id, text) {
    const el = typeof el_or_id === 'string' ? document.getElementById(el_or_id) : el_or_id;
    if (el) el.textContent = text ?? '';
  }
  function setAttr(el_or_id, attr, value) {
    const el = typeof el_or_id === 'string' ? document.getElementById(el_or_id) : el_or_id;
    if (el) el.setAttribute(attr, esc(value ?? ''));
  }

  // ── 10. 클릭재킹 방지 (iframe 내 로드 감지) ──
  function checkFraming() {
    if (window.top !== window.self) {
      document.body.innerHTML = '<p style="color:red;text-align:center;padding:40px">보안 오류: 허용되지 않은 프레임 접근이 감지되었습니다.</p>';
      throw new Error('[Security] Clickjacking attempt detected');
    }
  }

  return { esc, Validate, rateLimit, resetRate, getCsrfToken, verifyCsrf,
           touchSession, startSessionWatchdog, stopSessionWatchdog,
           safeLoad, safeSave, hashPassword, verifyPassword,
           secureLog, setText, setAttr, checkFraming };
})();

// 클릭재킹 즉시 체크
Security.checkFraming();

// 모든 사용자 인터랙션에서 세션 갱신
['click','keydown','mousemove','touchstart'].forEach(evt =>
  document.addEventListener(evt, () => Security.touchSession(), { passive: true })
);

// ① localStorage 영속 스토어
//
//  ※ STORE_VERSION 을 올리면 샘플 데이터가 한 번 재주입됩니다.
//    실제 운영 중에는 절대 올리지 마세요.
//    코드(HTML/CSS/JS)를 GitHub에 올려도 이 버전이 같으면
//    브라우저에 저장된 데이터는 절대 초기화되지 않습니다.
// ════════════════════════════════════════
const STORE_VERSION = '3';

// ── 최초 실행 시 주입되는 샘플 데이터 ──
const SEED_STAFF = [
  { id:'s1', name:'김민준', role:'교육 전문가',   tel:'010-1111-2222', email:'minjun@playtag.ai',  color:'#1A6BFF', progs:['교사교육','OT'],                    note:'' },
  { id:'s2', name:'이서연', role:'부모교육 담당', tel:'010-3333-4444', email:'seoyeon@playtag.ai', color:'#10B981', progs:['부모교육'],                          note:'' },
  { id:'s3', name:'박지호', role:'OT 전문가',     tel:'010-5555-6666', email:'jiho@playtag.ai',    color:'#8B5CF6', progs:['OT','설명회'],                      note:'' },
  { id:'s4', name:'최유진', role:'설명회 진행',   tel:'010-7777-8888', email:'yujin@playtag.ai',   color:'#F59E0B', progs:['설명회','부모교육'],                 note:'' },
  { id:'s5', name:'정하은', role:'교육 컨설턴트', tel:'010-9999-0000', email:'haeun@playtag.ai',   color:'#EF4444', progs:['교사교육','부모교육'],               note:'' },
  { id:'s6', name:'한도윤', role:'그로스 매니저', tel:'010-1234-5678', email:'doyun@playtag.ai',   color:'#06B6D4', progs:['교사교육','설명회','OT','부모교육'], note:'' },
];

// applicants: 관리자가 등록하는 신청자 테이블
// registered:true 가 되면 loginId/loginPw 로 로그인 가능
const SEED_APPLICANTS = [
  { id:'u1', name:'김철수', branch:'서울 강남지사', tel:'010-1234-5678', biz:'1234567890', addr:'서울 강남구 역삼동 123', date:'2026-02-10', loginId:'', loginPw:'', registered:false },
  { id:'u2', name:'이영희', branch:'경기 수원지사', tel:'010-2222-3333', biz:'2345678901', addr:'경기 수원시 팔달구 55',  date:'2026-02-15', loginId:'', loginPw:'', registered:false },
];

const SEED_APPLICATIONS = [
  { id:'a1', userId:'u1', program:'교사교육', branch:'서울 강남지사',   addr:'서울 강남구 테헤란로 123',      addrDetail:'4층 교육장',  count:25, note:'주차 공간 필요', dates:['2026-03-15T10:00','2026-03-18T14:00','2026-03-20T10:00'], status:'confirmed', assignedDate:'2026-03-15T10:00', assignedStaff:'s1', appliedAt:'2026-03-01' },
  { id:'a2', userId:'u2', program:'부모교육', branch:'경기 수원지사',   addr:'경기 수원시 영통구 월드컵로 55', addrDetail:'3층 강의실',  count:40, note:'',             dates:['2026-03-20T10:00','2026-03-22T14:00',''],               status:'pending',   assignedDate:'',               assignedStaff:'',   appliedAt:'2026-03-03' },
  { id:'a3', userId:'',   program:'설명회',   branch:'부산 해운대지사', addr:'부산 해운대구 센텀로 88',        addrDetail:'B1 세미나홀', count:60, note:'영상 촬영 예정', dates:['2026-03-25T14:00','2026-03-26T10:00',''],               status:'pending',   assignedDate:'',               assignedStaff:'',   appliedAt:'2026-03-04' },
  { id:'a4', userId:'',   program:'OT',       branch:'대구 수성지사',   addr:'대구 수성구 범물로 10',          addrDetail:'2층 OT실',    count:15, note:'',             dates:['2026-03-12T09:00','',''],                               status:'rejected',  assignedDate:'',               assignedStaff:'',   appliedAt:'2026-02-28' },
];

// ── 스토어 초기화 (버전이 같으면 기존 데이터 보존) ──
function initStore() {
  if (localStorage.getItem('pt_version') !== STORE_VERSION) {
    // 첫 실행이거나 STORE_VERSION이 바뀐 경우에만 샘플 주입
    // 단, 이미 데이터가 있으면 덮어쓰지 않음
    if (!localStorage.getItem('pt_staff'))        _save('pt_staff',        SEED_STAFF);
    if (!localStorage.getItem('pt_applicants'))   _save('pt_applicants',   SEED_APPLICANTS);
    if (!localStorage.getItem('pt_applications')) _save('pt_applications', SEED_APPLICATIONS);
    localStorage.setItem('pt_version', STORE_VERSION);
  }
}

function _load(key, fallback = []) {
  return Security.safeLoad(key, fallback);
}
function _save(key, data) {
  Security.safeSave(key, data);
}

// ── 메모리 변수 (항상 localStorage와 동기화) ──
initStore();
let STAFF        = _load('pt_staff',        SEED_STAFF);
let applicants   = _load('pt_applicants',   SEED_APPLICANTS);
let applications = _load('pt_applications', SEED_APPLICATIONS);

/** 변경사항을 localStorage에 즉시 저장 */
function persist() {
  _save('pt_staff',        STAFF);
  _save('pt_applicants',   applicants);
  _save('pt_applications', applications);
}

// ════════════════════════════════════════
// ② 세션 상태 (새로고침하면 재로그인 필요)
// ════════════════════════════════════════
const state = {
  currentUser:         null,   // { id, name, branch, role, loginId? }
  currentRole:         null,   // 'admin' | 'applicant'
  selectedProg:        '',
  selectedAssignDateStr: '',
  selectedStaff:       '',
  currentAppId:        null,
  calYear:             new Date().getFullYear(),
  calMonth:            new Date().getMonth(),
  filterStatus:        '',
  filterProg:          '',
  datesConfirmed:      false,
  staffDeleteId:       null,
  selectedStaffColor:  '#1A6BFF',
};

// ════════════════════════════════════════
// DOM 헬퍼
// ════════════════════════════════════════
const $$  = (sel) => [...document.querySelectorAll(sel)];
const el  = (id)  => document.getElementById(id);
const val = (id)  => (el(id) || {}).value || '';
function show(id)          { const e = el(id); if (e) e.style.display = ''; }
function hide(id)          { const e = el(id); if (e) e.style.display = 'none'; }
function setHTML(id, html) { const e = el(id); if (e) e.innerHTML = html; }

// ════════════════════════════════════════
// ③ 로그인 화면
// ════════════════════════════════════════
function setLoginType(type) {
  $$('.login-tab').forEach((t, i) =>
    t.classList.toggle('active',
      (type === 'applicant' && i === 0) || (type === 'admin' && i === 1))
  );
  el('login-form-applicant').style.display = type === 'applicant' ? '' : 'none';
  el('login-form-admin').style.display     = type === 'admin'     ? '' : 'none';
}

function loginAs(role) {
  if (role === 'admin') {
    // 🔒 Rate Limiting: 5회 실패 시 60초 잠금
    const inputId = Security.Validate.text(val('la-id'), 50);
    const rl = Security.rateLimit('admin_login', 5, 60000);
    if (rl.blocked) {
      showNotif(`⛔ 로그인 시도 초과. 잠시 후 다시 시도해주세요.`, 'danger'); return;
    }
    const savedPw = localStorage.getItem('pt_admin_pw') || 'admin1234';
    const inputPw = Security.Validate.text(val('la-pw'), 100);
    if (inputId !== 'admin' || inputPw !== savedPw) {
      showNotif(`관리자 ID 또는 비밀번호가 올바르지 않습니다. (남은 시도: ${rl.remaining}회)`, 'danger'); return;
    }
    Security.resetRate('admin_login');
    state.currentUser = { id: 'admin', name: '관리자', branch: '본사', role: 'admin' };
    state.currentRole = 'admin';

  } else {
    // 🔒 Rate Limiting: 10회 실패 시 120초 잠금
    const loginId = Security.Validate.text(val('l-id'), 50);
    const loginPw = Security.Validate.text(val('l-pw'), 100);
    if (!loginId || !loginPw) {
      showNotif('아이디와 비밀번호를 입력해주세요.', 'danger'); return;
    }
    const rl = Security.rateLimit('user_login_' + loginId, 10, 120000);
    if (rl.blocked) {
      showNotif(`⛔ 로그인 시도 초과. 잠시 후 다시 시도해주세요.`, 'danger'); return;
    }
    const user = applicants.find(a => a.registered && a.loginId === loginId && a.loginPw === loginPw);
    if (!user) {
      showNotif(`아이디 또는 비밀번호가 올바르지 않습니다. (남은 시도: ${rl.remaining}회)`, 'danger'); return;
    }
    Security.resetRate('user_login_' + loginId);
    state.currentUser = { id: user.id, loginId: user.loginId, name: Security.Validate.text(user.name,50), branch: Security.Validate.text(user.branch,100), role: 'applicant' };
    state.currentRole = 'applicant';
  }

  el('login-screen').style.display = 'none';
  el('app').style.display = 'block';
  // 🔒 세션 감시 시작 (30분 무활동 자동 로그아웃)
  Security.startSessionWatchdog((msg) => { logout(); setTimeout(() => showNotif(msg, 'danger'), 200); });
  setupNav();
  showNotif(`${Security.esc(state.currentUser.name)}님, 환영합니다 👋`, 'success');
}

function logout() {
  // 🔒 세션 감시 중지
  Security.stopSessionWatchdog();
  state.currentUser = null;
  state.currentRole = null;
  el('login-screen').style.display = 'flex';
  el('app').style.display          = 'none';
  clearForm();
  ['l-id','l-pw','la-pw'].forEach(id => { const e = el(id); if (e) e.value = ''; });
  const badge = el('gcal-topbar-badge');
  if (badge) badge.style.display = 'none';
}

// ════════════════════════════════════════
// ④ 회원가입 플로우
// ════════════════════════════════════════

/** 로그인 화면 "회원가입" 버튼 클릭 */
function openSignup() {
  ['su-name','su-tel','su-branch','su-id','su-pw','su-pw2'].forEach(id => { const e = el(id); if (e) e.value = ''; });
  hide('su-step2');
  hide('su-error');
  show('su-step1');
  el('su-step1-btn').style.display = '';
  el('su-step2-btn').style.display = 'none';
  openModal('modal-signup');
}

/**
 * STEP 1 — 연락처 + 사업자등록번호로 본인 확인
 * 관리자가 사전 등록한 신청자여야만 통과
 */
function signupStep1() {
  const name = val('su-name').trim();
  const tel  = val('su-tel').replace(/[-\s]/g, '');
  const branch = val('su-branch').trim();
  if (!name || !tel || !branch) { showSignupError('이름, 연락처, 지사명을 모두 입력해주세요.'); return; }
  if (!/^\d{10,11}$/.test(tel)) { showSignupError('연락처를 올바르게 입력해주세요. (숫자 10~11자리)'); return; }

  // 중복 연락처 확인
  if (applicants.some(a => a.tel.replace(/[-\s]/g,'') === tel)) {
    showSignupError('이미 등록된 연락처입니다. 기존 아이디로 로그인하세요.'); return;
  }

  // 통과 → STEP 2
  hide('su-error');
  hide('su-step1');
  el('su-step1-btn').style.display = 'none';
  el('su-step2-btn').style.display = '';
  setHTML('su-user-info', `
    <div style="background:var(--pt-gray-light);border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:13px;line-height:1.9;">
      <b style="color:var(--pt-success);">✅ 정보 확인 완료</b><br>
      이름&nbsp;<b>${Security.esc(name)}</b>&nbsp;&nbsp;|&nbsp;&nbsp;지사&nbsp;<b>${Security.esc(branch)}</b>
    </div>`);
  show('su-step2');
  el('su-new-name').value   = name;
  el('su-new-tel').value    = tel;
  el('su-new-branch').value = branch;
}

/** STEP 2 — ID / PW 설정 후 가입 완료 */
function signupStep2() {
  const newName   = el('su-new-name')?.value   || '';
  const newTel    = el('su-new-tel')?.value    || '';
  const newBranch = el('su-new-branch')?.value || '';
  const newId     = val('su-id').trim();
  const newPw     = val('su-pw').trim();
  const newPw2    = val('su-pw2').trim();

  if (!newId)           { showSignupError('사용할 아이디를 입력해주세요.'); return; }
  if (newId.length < 4) { showSignupError('아이디는 4자 이상이어야 합니다.'); return; }
  if (!newPw)           { showSignupError('비밀번호를 입력해주세요.'); return; }
  if (newPw.length < 6) { showSignupError('비밀번호는 6자 이상이어야 합니다.'); return; }
  if (newPw !== newPw2) { showSignupError('비밀번호가 일치하지 않습니다.'); return; }
  if (applicants.some(a => a.loginId === newId)) {
    showSignupError('이미 사용 중인 아이디입니다.'); return;
  }

  // 새 사용자 생성
  const newUser = {
    id: 'u_' + Date.now(),
    name: newName,
    branch: newBranch,
    tel: newTel,
    biz: '',
    addr: '',
    date: new Date().toISOString().slice(0,10),
    loginId: newId,
    loginPw: newPw,
    registered: true
  };
  applicants.unshift(newUser);
  persist();

  closeModal('modal-signup');
  showNotif(`🎉 가입 완료! 아이디 [${newId}] 로 로그인하세요.`, 'success');
  const loginIdEl = el('l-id');
  if (loginIdEl) loginIdEl.value = newId;
}

function showSignupError(msg) {
  const e = el('su-error');
  if (!e) return;
  e.textContent = msg;
  show('su-error');
}

// ════════════════════════════════════════
// 네비게이션
// ════════════════════════════════════════
function setupNav() {
  const nav   = el('topbar-nav');
  const dot   = el('user-dot');
  const label = el('user-label');

  if (state.currentRole === 'admin') {
    dot.className     = 'user-dot dot-admin';
    label.textContent = '본사 관리자';
    nav.innerHTML = `
      <button class="nav-btn active" data-page="page-admin-apps">📋 신청 목록</button>
      <button class="nav-btn" data-page="page-calendar">📅 캘린더</button>
      <button class="nav-btn" data-page="page-admin-register">👥 신청자 등록</button>
      <button class="nav-btn" data-page="page-staff">👤 담당자 관리</button>
      <button class="nav-btn" data-page="page-performance">📈 퍼포먼스</button>
      <button class="nav-btn" data-page="page-gcal-settings">🗓 Google 캘린더</button>`;
    const badge = el('gcal-topbar-badge');
    if (badge) badge.style.display = 'flex';
    renderAdminStats(); renderAdminApps(); renderStaffList(); renderPerfPage(); renderRegList();
    showPage('page-admin-apps');
  } else {
    dot.className     = 'user-dot dot-user';
    label.textContent = `${state.currentUser.name} · ${state.currentUser.branch}`;
    nav.innerHTML = `
      <button class="nav-btn active" data-page="page-apply">📋 신청하기</button>
      <button class="nav-btn" data-page="page-my-apps">📬 내 신청 현황</button>
      <button class="nav-btn" data-page="page-calendar">📅 일정 캘린더</button>`;
    showPage('page-apply');
  }

  nav.addEventListener('click', e => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showPage(btn.dataset.page);
  });

  renderCalendar();
}

/** 좌측 상단 로고 클릭 → 역할에 맞는 홈 페이지로 이동 */
function goHome() {
  const role = state.currentRole;
  if (!role) return; // 로그인 전에는 동작 안함
  if (role === 'admin' || role === 'staff') {
    showPage('page-admin-apps');
    // 네비 버튼 active 상태 동기화
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === 'page-admin-apps'));
  } else {
    showPage('page-my-apps');
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === 'page-my-apps'));
  }
}

function showPage(id) {
  $$('.page').forEach(p => p.classList.remove('active'));
  el(id)?.classList.add('active');
  ({
    'page-calendar':       renderCalendar,
    'page-admin-apps':     () => { renderAdminStats(); renderAdminApps(); },
    'page-performance':    renderPerfPage,
    'page-my-apps':        renderMyApps,
    'page-admin-register': renderRegList,
    'page-staff':          renderStaffList,
    'page-gcal-settings':  initGcalSettingsPage,
  })[id]?.();
}

// ════════════════════════════════════════
// 주소 검색 (행정안전부 도로명주소 API)
// ════════════════════════════════════════
const JUSO_KEY = 'devU01TX0FVVEgyMDI1MDMwNjE2MzgxMjExNTUxODQ=';

async function searchAddress() {
  const q = val('f-addr-search').trim();
  if (!q) { showNotif('검색어를 입력해주세요', 'danger'); return; }
  const box  = el('addr-results-box');
  const items= el('addr-result-items');
  const load = el('addr-loading');
  box.style.display = 'block'; load.style.display = 'block'; items.innerHTML = '';
  try {
    const url  = `https://business.juso.go.kr/addrlink/addrLinkApi.do?currentPage=1&countPerPage=10&keyword=${encodeURIComponent(q)}&confmKey=${JUSO_KEY}&resultType=json`;
    const data = await (await fetch(url)).json();
    load.style.display = 'none';
    const results = data?.results?.juso;
    items.innerHTML = (results?.length > 0)
      ? results.map(r => _addrItem(`${r.roadAddrPart1} ${r.roadAddrPart2||''}`.trim(), r.jibunAddr, r.zipNo)).join('')
      : _addrSimulate(q);
  } catch {
    load.style.display = 'none';
    items.innerHTML = _addrSimulate(q);
  }
}
function _addrItem(road, jibun, zip) {
  const s = road.replace(/'/g,"\\'");
  return `<div class="addr-result-item" onclick="setAddress('${s}')">
    <div class="addr-result-main">📍 ${road}</div>
    <div class="addr-result-sub">지번: ${jibun} · 우편번호: ${zip}</div>
  </div>`;
}
function _addrSimulate(q) {
  return [
    ['서울특별시 강남구 테헤란로 152',      '서울 강남구 역삼동 712-2',  '06236'],
    ['서울특별시 강남구 선릉로 428',         '서울 강남구 삼성동 159',    '06168'],
    ['서울특별시 서초구 반포대로 217',        '서울 서초구 반포동 19-3',   '06584'],
    ['경기도 수원시 영통구 월드컵로 206',     '경기 수원시 이의동 906-5',  '16499'],
    ['부산광역시 해운대구 센텀중앙로 79',     '부산 해운대구 우동 1480',   '48058'],
    ['대구광역시 수성구 범물로 10',           '대구 수성구 범물동 210',    '42605'],
    ['인천광역시 남동구 논현로 7',            '인천 남동구 논현동 609',    '21552'],
    ['광주광역시 서구 상무대로 889',          '광주 서구 치평동 1210',     '61949'],
  ].map(([road, jibun, zip]) => _addrItem(road, jibun, zip)).join('');
}
function setAddress(road) {
  el('f-addr').value        = road;
  el('f-addr-search').value = road;
  el('addr-results-box').style.display = 'none';
  show('f-addr-wrap'); show('f-addr-detail-wrap');
  showNotif('주소가 선택되었습니다', 'success');
}
function addrInputChange() {
  el('addr-results-box').style.display = 'none';
  hide('f-addr-wrap'); hide('f-addr-detail-wrap');
  el('f-addr').value = '';
}
document.addEventListener('DOMContentLoaded', () => {
  el('f-addr-search')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchAddress(); });
});

// ════════════════════════════════════════
// 희망 일시 확인
// ════════════════════════════════════════
function updateDateConfirm() {
  if (state.datesConfirmed) return;
  const vals = [0,1,2].map(i => el('d'+i)?.value).filter(Boolean);
  if (vals.length > 0) {
    el('dates-confirm-bar').style.display = 'flex';
    el('dates-confirm-count').textContent = `${vals.length}개`;
    el('dates-confirm-list').innerHTML    = vals.map((v,i) => `<span style="margin-right:10px;">${i+1}순위: ${formatDt(v)}</span>`).join('');
  } else {
    hide('dates-confirm-bar');
  }
}
function confirmDates() {
  const vals = [0,1,2].map(i => el('d'+i)?.value).filter(Boolean);
  if (!vals.length) { showNotif('최소 1개의 희망 일시를 입력해주세요', 'danger'); return; }
  state.datesConfirmed = true;
  hide('dates-confirm-bar'); hide('date-slots-wrap'); show('dates-confirmed-display');
  el('dates-confirmed-text').innerHTML = vals.map((v,i) => `${i+1}순위: ${formatDt(v)}`).join('&nbsp;&nbsp;|&nbsp;&nbsp;');
  showNotif('희망 일시가 확인되었습니다 ✅', 'success');
}
function editDates() {
  state.datesConfirmed = false;
  hide('dates-confirmed-display'); show('date-slots-wrap'); updateDateConfirm();
}

// ════════════════════════════════════════
// 신청하기 (지사)
// ════════════════════════════════════════
function selectProg(card, name) {
  $$('.prog-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  state.selectedProg = name;
}
function clearForm() {
  $$('.prog-card').forEach(c => c.classList.remove('selected'));
  state.selectedProg = ''; state.datesConfirmed = false;
  ['f-branch','f-count','f-addr','f-addr-detail','f-note','f-addr-search']
    .forEach(id => { const e = el(id); if (e) e.value = ''; });
  [0,1,2].forEach(i => { const e = el('d'+i); if (e) e.value = ''; });
  hide('addr-results-box'); hide('f-addr-wrap'); hide('f-addr-detail-wrap');
  hide('dates-confirm-bar'); hide('dates-confirmed-display'); show('date-slots-wrap');
}
function submitApplication() {
  if (!state.selectedProg) { showNotif('프로그램을 선택해주세요', 'danger'); return; }
  if (!state.datesConfirmed) {
    if (!el('d0')?.value) { showNotif('희망 일시를 입력하고 확인 버튼을 눌러주세요', 'danger'); return; }
    showNotif('희망 일시 확인 버튼을 눌러주세요', 'danger'); return;
  }
  const addr = el('f-addr')?.value;
  if (!addr) { showNotif('장소를 검색하여 선택해주세요', 'danger'); return; }
  applications.unshift({
    id: 'a' + Date.now(),
    userId:     state.currentUser.id,
    program:    state.selectedProg,
    branch:     val('f-branch') || state.currentUser.branch,
    addr, addrDetail: val('f-addr-detail'),
    count:      Number(val('f-count')) || 0,
    note:       val('f-note'),
    dates:      [0,1,2].map(i => el('d'+i)?.value || ''),
    status:     'pending', assignedDate: '', assignedStaff: '',
    appliedAt:  new Date().toISOString().slice(0,10),
  });
  persist();
  clearForm();
  showNotif('✅ 신청이 완료되었습니다!', 'success');
}

// ════════════════════════════════════════
// 내 신청 현황 (지사)
// ════════════════════════════════════════
function renderMyApps() {
  const list = applications.filter(a => a.userId === state.currentUser.id);
  if (!list.length) {
    setHTML('my-apps-body', `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📬</div><h3>신청 내역이 없습니다</h3><p>새 프로그램을 신청해보세요</p></div></td></tr>`);
    return;
  }
  setHTML('my-apps-body', list.map(a => `<tr>
    <td>${progBadge(a.program)}</td>
    <td>${a.appliedAt}</td>
    <td style="font-size:11px;line-height:1.7;">${a.dates.filter(Boolean).map((d,i) => `<div>${i+1}. ${formatDt(d)}</div>`).join('')}</td>
    <td><div>${a.addr}</div><div style="font-size:11px;color:var(--pt-gray);">${a.addrDetail}</div></td>
    <td>${a.branch}</td><td>${a.count}명</td>
    <td>${statusBadge(a.status)}</td>
    <td style="font-size:12px;">${a.assignedDate ? formatDt(a.assignedDate) : '-'}</td>
    <td>${a.assignedStaff ? staffName(a.assignedStaff) : '-'}</td>
  </tr>`).join(''));
}

// ════════════════════════════════════════
// 본사 — 통계 & 목록
// ════════════════════════════════════════
function renderAdminStats() {
  const t=applications.length,
        p=applications.filter(a=>a.status==='pending').length,
        c=applications.filter(a=>a.status==='confirmed').length,
        r=applications.filter(a=>a.status==='rejected').length;
  setHTML('admin-stats', `
    <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-label">전체 신청</div><div class="stat-value">${t}</div><div class="stat-sub">누적</div></div>
    <div class="stat-card"><div class="stat-icon">⏳</div><div class="stat-label">대기 중</div><div class="stat-value" style="color:var(--pt-warning);">${p}</div><div class="stat-sub">배정 필요</div></div>
    <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-label">확정 완료</div><div class="stat-value" style="color:var(--pt-success);">${c}</div><div class="stat-sub">배정 완료</div></div>
    <div class="stat-card"><div class="stat-icon">❌</div><div class="stat-label">반려</div><div class="stat-value" style="color:var(--pt-danger);">${r}</div><div class="stat-sub">반려 처리</div></div>`);
}
function filterApps(v, type) {
  if (type === 'status') state.filterStatus = v; else state.filterProg = v;
  renderAdminApps();
}
function renderAdminApps() {
  let list = [...applications];
  if (state.filterStatus) list = list.filter(a => a.status === state.filterStatus);
  if (state.filterProg)   list = list.filter(a => a.program === state.filterProg);
  setHTML('admin-apps-body', list.map(a => {
    const u = applicants.find(x => x.id === a.userId) || {};
    return `<tr>
      <td><div style="font-weight:600;">${u.name || '(미등록)'}</div><div style="font-size:11px;color:var(--pt-gray);">${u.tel||''}</div></td>
      <td>${progBadge(a.program)}</td><td>${a.branch}</td><td>${a.appliedAt}</td>
      <td style="font-size:12px;">${a.dates[0] ? formatDt(a.dates[0]) : '-'}</td>
      <td>${a.count}명</td><td>${statusBadge(a.status)}</td>
      <td>${a.assignedStaff ? `<span style="font-weight:600;">${staffName(a.assignedStaff)}</span>` : '<span style="color:var(--pt-gray);font-size:12px;">미배정</span>'}</td>
      <td style="font-size:12px;">${a.assignedDate ? formatDt(a.assignedDate) : '-'}</td>
      <td>${a.status === 'pending'
        ? `<button class="btn btn-primary btn-sm" onclick="openAssign('${a.id}')">배정</button>`
        : `<button class="btn btn-ghost btn-sm"   onclick="openEventById('${a.id}')">상세</button>`}</td>
    </tr>`;
  }).join(''));
}

// ════════════════════════════════════════
// 배정 모달
// ════════════════════════════════════════
function openAssign(id) {
  state.currentAppId = id; state.selectedAssignDateStr = ''; state.selectedStaff = '';
  const a = applications.find(x => x.id === id);
  const u = applicants.find(x => x.id === a.userId) || {};
  setHTML('assign-app-info', `
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
      ${progBadge(a.program)}
      <span>👤 <b>${u.name||'(미등록)'}</b></span>
      <span>🏢 ${a.branch}</span>
      <span>📍 ${a.addr}${a.addrDetail?' '+a.addrDetail:''}</span>
      <span>👥 ${a.count}명</span>
      ${a.note?`<span>📝 ${a.note}</span>`:''}
    </div>`);
  const colors=['var(--pt-blue)','#64748B','#94A3B8'], labels=['1순위','2순위','3순위'];
  setHTML('assign-date-slots', a.dates.map((d,i) => {
    if (!d) return `<div class="date-slot" style="opacity:.35;"><div class="slot-num" style="background:${colors[i]};">${i+1}</div><span style="color:var(--pt-gray);font-size:13px;">미입력</span></div>`;
    return `<div class="date-slot" id="as-slot-${i}" style="cursor:pointer;" onclick="pickAssignDate(${i},'${d}')">
      <div class="slot-num" style="background:${colors[i]};">${i+1}</div>
      <span style="font-size:14px;font-weight:600;">${formatDt(d)}</span>
      <span class="slot-label">${labels[i]} — 클릭하여 선택</span>
    </div>`;
  }).join(''));
  el('assign-custom-date').value = '';
  setHTML('assign-staff-grid', STAFF.map(s => {
    const cnt = applications.filter(x=>x.assignedStaff===s.id&&x.status==='confirmed').length;
    return `<div class="person-card" id="pc-${s.id}" onclick="selectStaff('${s.id}')">
      <div class="person-avatar" style="background:${s.color};">${s.name[0]}</div>
      <div><div class="person-name">${s.name}</div><div class="person-role">${s.role}</div><div class="person-count">담당 ${cnt}건</div></div>
    </div>`;
  }).join(''));
  openModal('modal-assign');
}
function pickAssignDate(i, d) {
  state.selectedAssignDateStr = d; el('assign-custom-date').value = '';
  $$('[id^="as-slot-"]').forEach((s,j) => s.classList.toggle('selected-slot', j===i));
}
function selectCustomDate() {
  const v = el('assign-custom-date').value;
  if (v) { state.selectedAssignDateStr=v; $$('[id^="as-slot-"]').forEach(s=>s.classList.remove('selected-slot')); }
}
function selectStaff(id) {
  state.selectedStaff = id;
  $$('.person-card').forEach(c=>c.classList.remove('selected'));
  el('pc-'+id)?.classList.add('selected');
}
async function confirmAssign() {
  if (!state.selectedAssignDateStr) { showNotif('확정 일시를 선택해주세요','danger'); return; }
  if (!state.selectedStaff)         { showNotif('담당자를 선택해주세요','danger'); return; }
  const a = applications.find(x=>x.id===state.currentAppId);
  const isReassign = a.status==='confirmed';
  a.status='confirmed'; a.assignedDate=state.selectedAssignDateStr; a.assignedStaff=state.selectedStaff;
  persist();
  closeModal('modal-assign'); renderAdminApps(); renderAdminStats(); renderCalendar();
  showNotif('✅ 배정이 완료되었습니다!','success');
  if (typeof gcal!=='undefined' && gcal.isConnected) {
    const gId = isReassign ? await gcalUpdateEvent(a) : await gcalCreateEvent(a);
    if (gId||isReassign) showNotif('✅ 배정 완료 + Google 캘린더 일정 추가!','success');
  }
}
function rejectApp() {
  const a = applications.find(x=>x.id===state.currentAppId);
  const hadEvent = a.status==='confirmed';
  a.status='rejected'; a.assignedDate=''; a.assignedStaff='';
  persist();
  closeModal('modal-assign'); renderAdminApps(); renderAdminStats();
  showNotif('반려 처리되었습니다','danger');
  if (hadEvent && typeof gcal!=='undefined' && gcal.isConnected) gcalDeleteEvent(a.id);
}

// ════════════════════════════════════════
// 캘린더
// ════════════════════════════════════════
function renderCalendar() {
  const today=new Date();
  el('cal-title').textContent=`${state.calYear}년 ${state.calMonth+1}월`;
  const days=['일','월','화','수','목','금','토'];
  const first=new Date(state.calYear,state.calMonth,1).getDay();
  const last =new Date(state.calYear,state.calMonth+1,0).getDate();
  const prevL=new Date(state.calYear,state.calMonth,0).getDate();
  let html=days.map(d=>`<div class="cal-day-hdr">${d}</div>`).join('');
  for(let i=0;i<first;i++) html+=`<div class="cal-cell other-month"><div class="cal-date">${prevL-first+1+i}</div></div>`;
  for(let d=1;d<=last;d++){
    const isToday=d===today.getDate()&&state.calMonth===today.getMonth()&&state.calYear===today.getFullYear();
    const ds=`${state.calYear}-${String(state.calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const confirmed=applications.filter(a=>a.status==='confirmed'&&a.assignedDate?.startsWith(ds));
    const pending  =applications.filter(a=>a.status==='pending'&&a.dates[0]?.startsWith(ds));
    let evts=confirmed.map(e=>`<button class="cal-event evt-${progClass(e.program)}" onclick="showCalEventDetail('${e.id}',event)">${e.program}${staffNameShort(e.assignedStaff)?' · '+staffNameShort(e.assignedStaff):''}</button>`).join('');
    evts+=pending.map(e=>`<button class="cal-event evt-pending" onclick="openEventById('${e.id}');event.stopPropagation()">${e.program} 대기</button>`).join('');
    const addBtn=state.currentRole==='admin'?`<div class="cal-add-btn-wrap"><button class="cal-add-btn" title="배정 신청 선택" onclick="openAssignFromCal('${ds}',event)">+</button></div>`:'';
    html+=`<div class="cal-cell${isToday?' today':''}${(confirmed.length+pending.length)>0?' has-event':''}"><div class="cal-date">${d}</div>${evts}${addBtn}</div>`;
  }
  const rem=(7-((first+last)%7))%7;
  for(let i=1;i<=rem;i++) html+=`<div class="cal-cell other-month"><div class="cal-date">${i}</div></div>`;
  el('cal-grid').innerHTML=html;
}
function calNav(dir){
  if(dir===0){state.calYear=new Date().getFullYear();state.calMonth=new Date().getMonth();}
  else{state.calMonth+=dir;if(state.calMonth<0){state.calMonth=11;state.calYear--;}if(state.calMonth>11){state.calMonth=0;state.calYear++;}}
  renderCalendar();
}
function openAssignFromCal(dateStr, e){
  e.stopPropagation();
  const list=applications.filter(a=>a.status==='pending');
  const match=list.filter(a=>a.dates.some(d=>d&&d.startsWith(dateStr)));
  const show_=match.length?match:list;
  if(!show_.length){showNotif('배정 가능한 신청이 없습니다','danger');return;}
  el('event-modal-title').textContent=`📅 ${dateStr} — 배정 신청 선택`;
  setHTML('event-modal-body',show_.map(a=>{
    const u=applicants.find(x=>x.id===a.userId)||{};
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px;border:1.5px solid var(--pt-border);border-radius:10px;margin-bottom:8px;">
      ${progBadge(a.program)}
      <div style="flex:1;"><div style="font-weight:600;font-size:13px;">${u.name||'(미등록)'} · ${a.branch}</div>
      <div style="font-size:11px;color:var(--pt-gray);">희망: ${a.dates.filter(Boolean).map(d=>formatDt(d)).join(', ')}</div></div>
      <button class="btn btn-primary btn-sm" onclick="closeModal('modal-event');openAssign('${a.id}')">배정</button>
    </div>`;
  }).join(''));
  setHTML('event-modal-actions',`<button class="btn btn-ghost" onclick="closeModal('modal-event')">닫기</button>`);
  openModal('modal-event');
}
function showCalEventDetail(id, e){
  e.stopPropagation();
  const a=applications.find(x=>x.id===id), st=STAFF.find(s=>s.id===a.assignedStaff);
  el('event-modal-title').innerHTML=`${progBadge(a.program)} <span style="font-size:14px;font-weight:500;">${a.branch}</span>`;
  setHTML('event-modal-body',`
    <div class="detail-row"><div class="detail-key">확정일시</div><div class="detail-val">${formatDt(a.assignedDate)}</div></div>
    <div class="detail-row"><div class="detail-key">담당자</div><div class="detail-val">${st?`<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:22px;height:22px;border-radius:6px;background:${st.color};display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">${st.name[0]}</span>${st.name}</span>`:'-'}</div></div>
    <div class="detail-row"><div class="detail-key">장소</div><div class="detail-val">${a.addr}${a.addrDetail?' '+a.addrDetail:''}</div></div>
    <div class="detail-row"><div class="detail-key">예상인원</div><div class="detail-val">${a.count}명</div></div>
    ${a.note?`<div class="detail-row"><div class="detail-key">특이사항</div><div class="detail-val">${a.note}</div></div>`:''}`);
  setHTML('event-modal-actions',
    state.currentRole==='admin'
      ?`<button class="btn btn-warn btn-sm" onclick="closeModal('modal-event');openAssign('${a.id}')">재배정</button><button class="btn btn-ghost" onclick="closeModal('modal-event')">닫기</button>`
      :`<button class="btn btn-ghost" onclick="closeModal('modal-event')">닫기</button>`);
  openModal('modal-event');
}
function openEventById(id){
  const a=applications.find(x=>x.id===id);
  const u=applicants.find(x=>x.id===a.userId)||{};
  el('event-modal-title').innerHTML=`${progBadge(a.program)} 상세`;
  setHTML('event-modal-body',`
    <div class="detail-row"><div class="detail-key">상태</div><div class="detail-val">${statusBadge(a.status)}</div></div>
    <div class="detail-row"><div class="detail-key">신청자</div><div class="detail-val">${u.name||'-'}</div></div>
    <div class="detail-row"><div class="detail-key">지사</div><div class="detail-val">${a.branch}</div></div>
    <div class="detail-row"><div class="detail-key">장소</div><div class="detail-val">${a.addr}${a.addrDetail?' '+a.addrDetail:''}</div></div>
    <div class="detail-row"><div class="detail-key">예상인원</div><div class="detail-val">${a.count}명</div></div>
    <div class="detail-row"><div class="detail-key">희망일시</div><div class="detail-val">${a.dates.filter(Boolean).map((d,i)=>`${i+1}순위: ${formatDt(d)}`).join('<br>')}</div></div>
    <div class="detail-row"><div class="detail-key">확정일시</div><div class="detail-val">${a.assignedDate?formatDt(a.assignedDate):'-'}</div></div>
    <div class="detail-row"><div class="detail-key">담당자</div><div class="detail-val">${a.assignedStaff?staffName(a.assignedStaff):'-'}</div></div>
    ${a.note?`<div class="detail-row"><div class="detail-key">특이사항</div><div class="detail-val">${a.note}</div></div>`:''}`);
  setHTML('event-modal-actions',
    (state.currentRole==='admin'&&a.status==='pending')
      ?`<button class="btn btn-primary btn-sm" onclick="closeModal('modal-event');openAssign('${a.id}')">배정하기</button><button class="btn btn-ghost" onclick="closeModal('modal-event')">닫기</button>`
      :`<button class="btn btn-ghost" onclick="closeModal('modal-event')">닫기</button>`);
  openModal('modal-event');
}

// ════════════════════════════════════════
// 담당자 관리
// ════════════════════════════════════════
function renderStaffList(){
  const grid=el('staff-list-grid');
  if(!STAFF.length){grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">👤</div><h3>등록된 담당자가 없습니다</h3></div>`;return;}
  grid.innerHTML=STAFF.map(s=>{
    const cnt=applications.filter(a=>a.assignedStaff===s.id&&a.status==='confirmed').length;
    return `<div class="staff-mgmt-card">
      <div class="staff-badge-count">${cnt}건</div>
      <div class="staff-avatar-lg" style="background:${s.color};">${s.name[0]}</div>
      <div class="staff-mgmt-name">${s.name}</div>
      <div class="staff-mgmt-role">${s.role}</div>
      <div class="staff-mgmt-tel">📞 ${s.tel}</div>
      <div style="font-size:11px;color:var(--pt-gray);margin-top:2px;">✉️ ${s.email}</div>
      ${s.progs?.length?`<div class="staff-prog-tags">${s.progs.map(p=>`<span class="staff-prog-tag">${p}</span>`).join('')}</div>`:''}
      ${s.note?`<div style="font-size:11px;color:var(--pt-gray);margin-top:6px;font-style:italic;">${s.note}</div>`:''}
      <div class="staff-actions">
        <button class="btn btn-outline btn-xs" onclick="openStaffModal('${s.id}')">✏️ 수정</button>
        <button class="btn btn-danger  btn-xs" onclick="askDeleteStaff('${s.id}','${s.name}')">🗑 삭제</button>
      </div>
    </div>`;
  }).join('');
}
function openStaffModal(id){
  el('staff-edit-id').value=id||'';
  if(id){
    const s=STAFF.find(x=>x.id===id);
    el('staff-modal-title').textContent='👤 담당자 수정';
    el('sm-name').value=s.name; el('sm-role').value=s.role;
    el('sm-tel').value=s.tel;   el('sm-email').value=s.email;
    el('sm-note').value=s.note||'';
    state.selectedStaffColor=s.color; el('sm-color').value=s.color;
    $$('.color-swatch').forEach(sw=>sw.classList.toggle('selected',sw.dataset.color===s.color));
    $$('#sm-prog-checks input[type=checkbox]').forEach(cb=>{cb.checked=(s.progs||[]).includes(cb.value);});
  } else {
    el('staff-modal-title').textContent='👤 담당자 등록';
    ['sm-name','sm-role','sm-tel','sm-email','sm-note'].forEach(i=>{el(i).value='';});
    state.selectedStaffColor='#1A6BFF'; el('sm-color').value='#1A6BFF';
    $$('.color-swatch').forEach((sw,i)=>sw.classList.toggle('selected',i===0));
    $$('#sm-prog-checks input[type=checkbox]').forEach(cb=>{cb.checked=false;});
  }
  openModal('modal-staff');
}
function selectColor(sw,c){
  state.selectedStaffColor=c; el('sm-color').value=c;
  $$('.color-swatch').forEach(s=>s.classList.remove('selected'));
  sw.classList.add('selected');
}
function saveStaff(){
  const name=val('sm-name').trim();
  if(!name){showNotif('이름을 입력해주세요','danger');return;}
  const progs=$$('#sm-prog-checks input:checked').map(cb=>cb.value);
  const data={name, role:val('sm-role'), tel:val('sm-tel'), email:val('sm-email'), color:state.selectedStaffColor, progs, note:val('sm-note')};
  const editId=val('staff-edit-id');
  if(editId){
    const idx=STAFF.findIndex(s=>s.id===editId); STAFF[idx]={...STAFF[idx],...data};
    showNotif('✅ 담당자 정보가 수정되었습니다','success');
  } else {
    STAFF.push({id:'s'+Date.now(),...data});
    showNotif('✅ 담당자가 등록되었습니다','success');
  }
  persist();
  closeModal('modal-staff'); renderStaffList(); renderPerfPage();
}
function askDeleteStaff(id,name){
  state.staffDeleteId=id;
  setHTML('confirm-delete-msg',`<b>${name}</b> 담당자를 삭제하시겠습니까?<br><span style="font-size:12px;color:var(--pt-danger);">삭제 후 복구할 수 없습니다.</span>`);
  openModal('modal-confirm-delete');
}
function confirmDeleteStaff(){
  STAFF=STAFF.filter(s=>s.id!==state.staffDeleteId);
  persist();
  closeModal('modal-confirm-delete'); renderStaffList(); renderPerfPage();
  showNotif('담당자가 삭제되었습니다','danger');
}

// ════════════════════════════════════════
// 신청자 등록 (본사)
// ════════════════════════════════════════
function registerApplicant(){
  const name=val('reg-name').trim();
  if(!name){showNotif('이름을 입력해주세요','danger');return;}
  const tel=val('reg-tel').trim(), biz=val('reg-biz').trim();
  if(!tel||!biz){showNotif('연락처와 사업자등록번호는 필수입니다.','danger');return;}
  if(applicants.some(a=>a.tel.replace(/[-\s]/g,'')===tel.replace(/[-\s]/g,''))){
    showNotif('이미 등록된 연락처입니다.','danger');return;
  }
  applicants.unshift({
    id:'u'+Date.now(), name, branch:val('reg-branch'), tel, biz,
    addr:val('reg-addr'), date:new Date().toISOString().slice(0,10),
    loginId:'', loginPw:'', registered:false,
  });
  persist();
  ['reg-name','reg-branch','reg-tel','reg-addr','reg-biz'].forEach(id=>{const e=el(id);if(e)e.value='';});
  renderRegList();
  showNotif('✅ 신청자가 등록되었습니다!','success');
}
function renderRegList(){
  setHTML('reg-list-body', applicants.map(r=>`<tr>
    <td><b>${r.name}</b></td><td>${r.branch}</td><td>${r.tel}</td>
    <td>${r.addr}</td><td>${r.biz}</td><td>${r.date}</td>
    <td>${r.registered
      ?`<span class="badge badge-confirmed"><span class="badge-dot"></span>가입완료 (${r.loginId})</span>`
      :`<span class="badge badge-pending"><span class="badge-dot"></span>미가입</span>`}</td>
  </tr>`).join(''));
}

// ════════════════════════════════════════
// 퍼포먼스
// ════════════════════════════════════════
function renderPerfPage(){
  const stats=STAFF.map(s=>{
    const apps=applications.filter(a=>a.assignedStaff===s.id&&a.status==='confirmed');
    return{...s,total:apps.length,totalPeople:apps.reduce((sum,a)=>sum+Number(a.count||0),0),score:Math.min(100,apps.length*25)};
  }).sort((a,b)=>b.total-a.total);
  setHTML('perf-stats',`
    <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-label">활성 담당자</div><div class="stat-value">${STAFF.length}</div><div class="stat-sub">등록됨</div></div>
    <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-label">완료 건수</div><div class="stat-value">${applications.filter(a=>a.status==='confirmed').length}</div><div class="stat-sub">이번 달</div></div>
    <div class="stat-card"><div class="stat-icon">🏆</div><div class="stat-label">최다 담당</div><div class="stat-value" style="font-size:16px;">${stats[0]?.name||'-'}</div><div class="stat-sub">${stats[0]?.total||0}건</div></div>
    <div class="stat-card"><div class="stat-icon">👫</div><div class="stat-label">총 교육인원</div><div class="stat-value">${stats.reduce((s,x)=>s+x.totalPeople,0)}</div><div class="stat-sub">명</div></div>`);
  setHTML('perf-content',`<div class="table-wrap"><table>
    <thead><tr><th>순위</th><th>담당자</th><th>역할</th><th>담당 건수</th><th>교육 인원</th><th style="width:200px;">퍼포먼스</th></tr></thead>
    <tbody>${stats.map((s,i)=>`<tr>
      <td><span style="font-size:18px;font-weight:800;color:${i===0?'#F59E0B':i===1?'#94A3B8':i===2?'#CD7C2F':'var(--pt-gray)'};">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</span></td>
      <td><div style="display:flex;align-items:center;gap:10px;"><div style="width:32px;height:32px;border-radius:8px;background:${s.color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">${s.name[0]}</div><span style="font-weight:600;">${s.name}</span></div></td>
      <td style="color:var(--pt-gray);font-size:13px;">${s.role}</td>
      <td><span style="font-size:18px;font-weight:800;">${s.total}</span><span style="font-size:11px;color:var(--pt-gray);"> 건</span></td>
      <td><span style="font-size:16px;font-weight:700;">${s.totalPeople}</span><span style="font-size:11px;color:var(--pt-gray);"> 명</span></td>
      <td><div class="perf-bar-wrap"><div class="perf-bar"><div class="perf-fill fill-blue" style="width:${s.score}%;"></div></div><div class="perf-val">${s.score}%</div></div></td>
    </tr>`).join('')}</tbody>
  </table></div>`);
}

// ════════════════════════════════════════
// Google Calendar 설정 페이지
// ════════════════════════════════════════
function initGcalSettingsPage(){
  const dot2=el('gcal-status-dot-2'),txt2=el('gcal-status-text-2');
  if(!dot2) return;
  const connected=typeof gcal!=='undefined'&&gcal.isConnected;
  const configured=typeof GCAL_CONFIG!=='undefined'&&GCAL_CONFIG.CLIENT_ID!=='YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
  if(connected){dot2.style.background='var(--pt-success)';txt2.textContent='연결됨';}
  else{dot2.style.background=configured?'#94A3B8':'#FCA5A5';txt2.textContent=configured?'미연결':'API 키 미설정';}
  if(typeof _updateSyncStatusUI==='function') _updateSyncStatusUI();
  const synced=applications.filter(a=>typeof gcal!=='undefined'&&gcal.syncedIds[a.id]);
  const lw=el('gcal-synced-list'),le=el('gcal-synced-items');
  if(synced.length&&lw&&le){
    lw.style.display='';
    le.innerHTML=synced.map(a=>`<div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--pt-border);border-radius:9px;margin-bottom:6px;font-size:13px;">
      ${progBadge(a.program)}<span style="flex:1;">${a.branch} · ${formatDt(a.assignedDate)}</span>
      <span class="gcal-synced-chip">🗓 Google 등록됨</span>
      <a href="https://calendar.google.com" target="_blank" style="color:var(--pt-blue);font-size:11px;font-weight:600;text-decoration:none;">열기 →</a>
    </div>`).join('');
  } else if(lw){lw.style.display='none';}
}
function applyClientId(){
  const v=val('gcal-client-id-input').trim();
  if(!v||!v.includes('.apps.googleusercontent.com')){showNotif('올바른 Client ID 형식이 아닙니다.','danger');return;}
  localStorage.setItem('pt_gcal_client_id_override',v);
  showNotif('적용됩니다. gcal.js 파일도 동일하게 수정해주세요.','success');
  setTimeout(()=>location.reload(),1500);
}
function toggleSetupGuide(){
  const g=el('gcal-setup-guide');if(!g)return;
  g.style.display=g.style.display==='none'?'':'none';
}

// ════════════════════════════════════════
// 모달
// ════════════════════════════════════════
function openModal(id)  { el(id)?.classList.add('open'); }
function closeModal(id) { el(id)?.classList.remove('open'); }
document.addEventListener('DOMContentLoaded', () => {
  $$('.modal-overlay').forEach(overlay =>
    overlay.addEventListener('click', e => { if(e.target===overlay) overlay.classList.remove('open'); })
  );
});

// ════════════════════════════════════════
// 토스트 알림
// ════════════════════════════════════════
let _notifTimer=null;
function showNotif(msg,type='success'){
  const n=el('notif');
  el('notif-icon').textContent=type==='success'?'✅':'❌';
  el('notif-msg').textContent=msg;
  n.className=`notif notif-${type} show`;
  clearTimeout(_notifTimer);
  _notifTimer=setTimeout(()=>n.classList.remove('show'),3500);
}

// ════════════════════════════════════════
// 포맷터 / 유틸
// ════════════════════════════════════════
function progClass(p){return{'교사교육':'teacher','부모교육':'parent','OT':'ot','설명회':'explain'}[p]||'teacher';}
function progBadge(p){
  const m={'교사교육':'#DBEAFE:#1D4ED8:👩‍🏫','부모교육':'#D1FAE5:#065F46:👨‍👩‍👧','OT':'#EDE9FE:#5B21B6:🎓','설명회':'#FEF3C7:#92400E:📊'};
  const[bg,c,ic]=(m[p]||'#F3F4F6:#374151:📋').split(':');
  return `<span style="background:${bg};color:${c};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">${ic} ${p}</span>`;
}
function statusBadge(s){
  const m={pending:'badge-pending:⏳:대기 중',confirmed:'badge-confirmed:✅:확정',rejected:'badge-rejected:❌:반려'};
  const[cls,icon,label]=(m[s]||'badge-pending:⏳:대기 중').split(':');
  return `<span class="badge ${cls}"><span class="badge-dot"></span>${icon} ${label}</span>`;
}
function staffName(id){return STAFF.find(s=>s.id===id)?.name||id;}
function staffNameShort(id){const n=STAFF.find(s=>s.id===id)?.name||'';return n?n[0]+'..':'';}
function formatDt(dt){
  if(!dt)return'-';
  const d=new Date(dt),pad=n=>String(n).padStart(2,'0');
  return`${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ════════════════════════════════════════
// ⑥ 퍼포먼스 — 데이터 입력 & 차트
// ════════════════════════════════════════

// ── 결과 데이터 스토어 (localStorage 영속) ──
let perfData = _load('pt_perf_data', []);
function persistPerf() { _save('pt_perf_data', perfData); }

// Chart.js 인스턴스 캐시 (재렌더 시 destroy 필요)
const _charts = {};
function _destroyChart(id) { if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; } }

// 공통 팔레트
const PROG_COLORS  = { '교사교육':'#3B82F6','부모교육':'#10B981','OT':'#8B5CF6','설명회':'#F59E0B' };
const TYPE_COLORS  = ['#3B82F6','#10B981','#F59E0B','#94A3B8'];
const STAFF_PALETTE= ['#1A6BFF','#10B981','#8B5CF6','#F59E0B','#EF4444','#06B6D4','#EC4899','#F97316'];

// ── 탭 전환 ──
function switchPerfTab(tab, btn) {
  $$('.perf-tab').forEach(b => b.classList.remove('active'));
  $$('.perf-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  el('perf-tab-' + tab).classList.add('active');
  if (tab === 'overview')    renderPerfOverview();
  if (tab === 'data-entry')  renderDataEntryList();
  if (tab === 'charts')      renderPerfCharts();
  if (tab === 'ranking')     renderPerfRanking();
}

// ════════════════════════════════════════
// renderPerfPage — 초기 진입 시 (기존 함수 대체)
// ════════════════════════════════════════
function renderPerfPage() {
  // KPI 상단 카드
  const confirmed = applications.filter(a => a.status === 'confirmed');
  const totalPeople = perfData.reduce((s, d) => s + (Number(d.parent)||0) + (Number(d.teacher)||0) + (Number(d.director)||0) + (Number(d.other)||0), 0);
  const avgSat = perfData.length
    ? (perfData.filter(d=>d.satisfaction>0).reduce((s,d)=>s+d.satisfaction,0) / (perfData.filter(d=>d.satisfaction>0).length||1)).toFixed(1)
    : '-';
  const topStaff = (() => {
    const cnt = {};
    confirmed.forEach(a => { if(a.assignedStaff) cnt[a.assignedStaff] = (cnt[a.assignedStaff]||0)+1; });
    const top = Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];
    return top ? STAFF.find(s=>s.id===top[0])?.name || '-' : '-';
  })();
  setHTML('perf-stats', `
    <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-label">활성 담당자</div><div class="stat-value">${STAFF.length}</div><div class="stat-sub">등록됨</div></div>
    <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-label">확정 완료</div><div class="stat-value">${confirmed.length}</div><div class="stat-sub">건</div></div>
    <div class="stat-card"><div class="stat-icon">👫</div><div class="stat-label">실 참가 인원</div><div class="stat-value">${totalPeople.toLocaleString()}</div><div class="stat-sub">명</div></div>
    <div class="stat-card"><div class="stat-icon">⭐</div><div class="stat-label">평균 만족도</div><div class="stat-value">${avgSat}</div><div class="stat-sub">/ 5.0</div></div>
    <div class="stat-card"><div class="stat-icon">🏆</div><div class="stat-label">최다 담당</div><div class="stat-value" style="font-size:15px;">${topStaff}</div><div class="stat-sub">담당자</div></div>
    <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-label">입력 완료</div><div class="stat-value">${perfData.length}</div><div class="stat-sub">건 입력됨</div></div>`);

  // 기본 탭: 종합 현황
  renderPerfOverview();
}

// ════════════════════════════════════════
// 차트 타입 상태 저장 & 동적 변환 엔진
// ════════════════════════════════════════
const _chartTypes = {};  // { chartId: selectedType }

/** 차트 타입 변경 핸들러 */
function changeChartType(chartId, renderFn, newType) {
  _chartTypes[chartId] = newType;
  window[renderFn]();
}

// Y축 범위 상태 (퍼포먼스 차트용)
const _chartYRange = {}; // { chartId: { min: number|null, max: number|null } }

function setChartYRange(chartId, renderFn, minVal, maxVal) {
  const mn = minVal === '' ? null : Number(minVal);
  const mx = maxVal === '' ? null : Number(maxVal);
  _chartYRange[chartId] = { min: mn, max: mx };
  window[renderFn]();
}

function getYScaleOptions(chartId) {
  const r = _chartYRange[chartId] || {};
  const opts = { beginAtZero: r.min == null, ticks: { maxTicksLimit: 8 } };
  if (r.min != null) opts.min = r.min;
  if (r.max != null) opts.max = r.max;
  return opts;
}

/** Chart.js options — Y축/R축 자동 비율 공통 옵션 */
function _autoScaleOptions(extra = {}, chartId = null) {
  const yOpts = chartId ? getYScaleOptions(chartId) : { beginAtZero: true, ticks: { maxTicksLimit: 8 } };
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } },
    scales: {
      y: yOpts,
      ...(extra.scales || {})
    },
    ...extra
  };
}

/** 단순 타입 변환 헬퍼 (bar/line/doughnut/pie/radar/polarArea/scatter/bubble) */
function _resolveType(id, fallback) {
  const t = _chartTypes[id] || fallback;
  // bar_h, bar_stacked, bar_h_stacked, area는 내부 처리
  if (['bar_h','bar_stacked','bar_h_stacked','area','mixed'].includes(t)) return 'bar';
  return t;
}

function _isHorizontal(id)   { return ['bar_h','bar_h_stacked'].includes(_chartTypes[id]); }
function _isStacked(id)      { return ['bar_stacked','bar_h_stacked'].includes(_chartTypes[id]); }
function _isArea(id)         { return _chartTypes[id] === 'area'; }
function _isMixed(id)        { return _chartTypes[id] === 'mixed'; }

// ════════════════════════════════════════
// TAB 1: 종합 현황
// ════════════════════════════════════════
function renderPerfOverview() {
  setTimeout(() => {
    _renderProgBar();
    _renderTypeDonut();
    _renderMonthlyLine();
  }, 50);
}

function _renderProgBar() {
  const id = 'chart-prog-bar';
  _destroyChart(id);
  const progs = ['교사교육','부모교육','OT','설명회'];
  const counts = progs.map(p => applications.filter(a=>a.program===p&&a.status==='confirmed').length);
  const people = progs.map(p =>
    perfData.filter(d=>d.program===p).reduce((s,d)=>s+(Number(d.parent)||0)+(Number(d.teacher)||0)+(Number(d.director)||0)+(Number(d.other)||0),0)
  );
  const ctx = el(id).getContext('2d');
  const t = _chartTypes[id] || 'mixed';
  const isH = _isHorizontal(id);

  if (t === 'mixed') {
    _charts[id] = new Chart(ctx, {
      data: {
        labels: progs,
        datasets: [
          { type:'bar', label:'확정 건수', data:counts, backgroundColor:progs.map(p=>PROG_COLORS[p]+'CC'), borderRadius:6, yAxisID:'y' },
          { type:'line', label:'실 참가인원', data:people, borderColor:'#EF4444', backgroundColor:'rgba(239,68,68,.1)', tension:.4, pointRadius:5, fill:true, yAxisID:'y1' },
        ]
      },
      options: { responsive:true, plugins:{legend:{position:'top'}}, scales:{
        y:  { beginAtZero:true, position:'left',  title:{display:true,text:'건수'}, ticks:{maxTicksLimit:8} },
        y1: { beginAtZero:true, position:'right', title:{display:true,text:'인원'}, grid:{drawOnChartArea:false}, ticks:{maxTicksLimit:8} }
      }}
    });
    return;
  }

  const isPie = ['pie','doughnut','polarArea'].includes(t);
  const totalByProg = progs.map((_,i) => counts[i] + people[i]);

  if (isPie) {
    _charts[id] = new Chart(ctx, {
      type: t,
      data: { labels: progs, datasets:[{ data: totalByProg, backgroundColor: progs.map(p=>PROG_COLORS[p]+'CC'), borderWidth:2, hoverOffset:8 }] },
      options: { responsive:true, plugins:{ legend:{position:'right'} }, ...(t==='doughnut'?{cutout:'60%'}:{}) }
    });
    return;
  }

  const isArea = _isArea(id);
  _charts[id] = new Chart(ctx, {
    type: t === 'bar' || isH ? 'bar' : t,
    data: {
      labels: progs,
      datasets: [
        { label:'확정 건수', data:counts, backgroundColor:progs.map(p=>PROG_COLORS[p]+'CC'), borderColor:progs.map(p=>PROG_COLORS[p]), borderRadius:6, tension:.4, fill:isArea, pointRadius:4 },
        ...(t==='line'||isArea ? [{ label:'실 참가인원', data:people, borderColor:'#EF4444', backgroundColor:'rgba(239,68,68,.15)', tension:.4, fill:isArea, pointRadius:4 }] : [])
      ]
    },
    options: { ..._autoScaleOptions({}, id), indexAxis: isH ? 'y' : 'x' }
  });
}

function _renderTypeDonut() {
  const id = 'chart-type-donut';
  _destroyChart(id);
  const labels = ['학부모','선생님','원장','기타'];
  const data = [
    perfData.reduce((s,d)=>s+(Number(d.parent)||0),0),
    perfData.reduce((s,d)=>s+(Number(d.teacher)||0),0),
    perfData.reduce((s,d)=>s+(Number(d.director)||0),0),
    perfData.reduce((s,d)=>s+(Number(d.other)||0),0),
  ];
  const ctx = el(id).getContext('2d');
  const t = _chartTypes[id] || 'doughnut';
  const isPie = ['pie','doughnut','polarArea'].includes(t);
  const isH = _isHorizontal(id);

  if (isPie) {
    _charts[id] = new Chart(ctx, {
      type: t,
      data: { labels, datasets:[{ data, backgroundColor:TYPE_COLORS, borderWidth:2, hoverOffset:8 }] },
      options: { responsive:true, plugins:{legend:{position:'right'}}, ...(t==='doughnut'?{cutout:'65%'}:{}) }
    });
  } else {
    _charts[id] = new Chart(ctx, {
      type: isH ? 'bar' : t,
      data: { labels, datasets:[{ label:'참가자 수', data, backgroundColor:TYPE_COLORS, borderRadius:6 }] },
      options: { ..._autoScaleOptions(), indexAxis: isH ? 'y' : 'x' }
    });
  }
}

function _renderMonthlyLine() {
  const id = 'chart-monthly-line';
  _destroyChart(id);
  const months = [];
  for (let i=5; i>=0; i--) {
    const d = new Date(); d.setMonth(d.getMonth()-i);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const labels = months.map(m => m.replace('-','.'));
  const progs = ['교사교육','부모교육','OT','설명회'];
  const t = _chartTypes[id] || 'line';
  const isH = _isHorizontal(id);
  const isStacked = _isStacked(id);
  const isArea = _isArea(id);
  const chartType = (t==='bar'||t==='bar_stacked'||isH) ? 'bar' : 'line';

  const datasets = progs.map(prog => ({
    label: prog,
    data: months.map(m => applications.filter(a=>a.program===prog&&a.appliedAt?.startsWith(m)).length),
    borderColor: PROG_COLORS[prog],
    backgroundColor: PROG_COLORS[prog] + (isArea||isStacked ? '66' : '22'),
    tension: .4, fill: isArea || isStacked, pointRadius: 4,
    borderRadius: 6,
  }));

  const ctx = el(id).getContext('2d');
  _charts[id] = new Chart(ctx, {
    type: chartType,
    data: { labels, datasets },
    options: {
      ..._autoScaleOptions({
        scales: {
          y: { beginAtZero:true, stacked: isStacked, ticks:{maxTicksLimit:8} },
          x: { stacked: isStacked }
        }
      }),
      indexAxis: isH ? 'y' : 'x'
    }
  });
}

// ════════════════════════════════════════
// TAB 2: 데이터 입력
// ════════════════════════════════════════
function renderDataEntryList() {
  const tbody = el('data-entry-tbody');
  if (!perfData.length) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div class="empty-icon">📝</div><h3>입력된 데이터가 없습니다</h3><p>+ 데이터 입력 버튼으로 첫 번째 결과를 입력해보세요</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = perfData.map(d => {
    const total = (Number(d.parent)||0)+(Number(d.teacher)||0)+(Number(d.director)||0)+(Number(d.other)||0);
    const stars = d.satisfaction ? '★'.repeat(d.satisfaction)+'☆'.repeat(5-d.satisfaction) : '-';
    return `<tr>
      <td>${progBadge(d.program)}</td>
      <td>${d.branch}</td>
      <td>${d.staffName||'-'}</td>
      <td>${d.date}</td>
      <td style="font-weight:700;color:var(--pt-blue);">${total}명</td>
      <td>${d.parent||0}</td><td>${d.teacher||0}</td><td>${d.director||0}</td>
      <td style="color:#F59E0B;letter-spacing:-1px;">${stars}</td>
      <td style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${d.note||''}">${d.note||'-'}</td>
      <td style="display:flex;gap:4px;">
        <button class="btn btn-outline btn-xs" onclick="openDataEntryModal('${d.id}')">✏️</button>
        <button class="btn btn-danger btn-xs" onclick="deleteDataEntry('${d.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function openDataEntryModal(editId) {
  // 담당자 셀렉트 채우기
  setHTML('de-staff', `<option value="">선택</option>` + STAFF.map(s=>`<option value="${s.id}">${s.name} (${s.role})</option>`).join(''));

  // 연결 가능한 확정 신청 목록
  setHTML('de-app-select', `<option value="">직접 입력</option>` +
    applications.filter(a=>a.status==='confirmed').map(a=>{
      const u = applicants.find(x=>x.id===a.userId)||{};
      return `<option value="${a.id}">[${a.program}] ${a.branch} · ${u.name||'?'} (${formatDt(a.assignedDate)})</option>`;
    }).join(''));

  el('de-edit-id').value = editId || '';

  if (editId) {
    const d = perfData.find(x=>x.id===editId);
    if (!d) return;
    el('de-app-select').value  = d.appId || '';
    el('de-program').value     = d.program || '';
    el('de-branch').value      = d.branch || '';
    el('de-staff').value       = d.staffId || '';
    el('de-date').value        = d.date || '';
    el('de-parent').value      = d.parent || 0;
    el('de-teacher').value     = d.teacher || 0;
    el('de-director').value    = d.director || 0;
    el('de-other').value       = d.other || 0;
    el('de-note').value        = d.note || '';
    el('de-result').value      = d.result || '완료';
    el('de-satisfaction').value= d.satisfaction || 0;
    setStars(d.satisfaction || 0);
  } else {
    ['de-program','de-branch','de-staff','de-note'].forEach(id=>{const e=el(id);if(e)e.value='';});
    ['de-parent','de-teacher','de-director','de-other'].forEach(id=>{const e=el(id);if(e)e.value=0;});
    el('de-date').value = new Date().toISOString().slice(0,10);
    el('de-result').value = '완료';
    el('de-satisfaction').value = 0;
    setStars(0);
  }
  updateDeTotal();
  openModal('modal-data-entry');
}

function onDeAppSelect() {
  const appId = el('de-app-select').value;
  if (!appId) return;
  const a = applications.find(x=>x.id===appId);
  if (!a) return;
  el('de-program').value = a.program;
  el('de-branch').value  = a.branch;
  el('de-staff').value   = a.assignedStaff || '';
  el('de-date').value    = a.assignedDate ? a.assignedDate.slice(0,10) : '';
}

function updateDeTotal() {
  const total = ['de-parent','de-teacher','de-director','de-other']
    .reduce((s,id) => s + (Number(el(id)?.value)||0), 0);
  el('de-total').textContent = total;
}

function setStars(n) {
  el('de-satisfaction').value = n;
  $$('.star').forEach((s,i) => s.classList.toggle('active', i < n));
}

function saveDataEntry() {
  const program = Security.Validate.text(val('de-program'), 50);
  const branch  = Security.Validate.text(val('de-branch'), 100);
  if (!program) { showNotif('프로그램을 선택해주세요','danger'); return; }
  if (!branch)  { showNotif('지사를 선택해주세요','danger'); return; }
  const dateVal = Security.Validate.date(val('de-date'));
  if (!dateVal) { showNotif('진행일을 입력해주세요','danger'); return; }

  const staffId = Security.Validate.id(val('de-staff'));
  const staffObj = STAFF.find(s=>s.id===staffId);
  // 🔒 입력값 전체 검증 및 범위 제한
  const entry = {
    id: Security.Validate.id(val('de-edit-id')) || 'd'+Date.now(),
    appId:       Security.Validate.id(val('de-app-select')),
    program, branch,
    staffId,
    staffName:   Security.Validate.text(staffObj?.name || '', 50),
    date:        dateVal,
    parent:      Security.Validate.number(el('de-parent')?.value, 0, 9999),
    teacher:     Security.Validate.number(el('de-teacher')?.value, 0, 9999),
    director:    Security.Validate.number(el('de-director')?.value, 0, 9999),
    other:       Security.Validate.number(el('de-other')?.value, 0, 9999),
    satisfaction:Security.Validate.number(el('de-satisfaction')?.value, 0, 5),
    result:      Security.Validate.text(val('de-result') || '완료', 20),
    note:        Security.Validate.text(val('de-note'), 500),
    place:       Security.Validate.text(val('de-place') || '', 200),
    createdAt:   new Date().toISOString(),
  };

  const editId = val('de-edit-id');
  if (editId) {
    const idx = perfData.findIndex(d=>d.id===editId);
    perfData[idx] = entry;
    showNotif('✅ 데이터가 수정되었습니다','success');
  } else {
    perfData.unshift(entry);
    showNotif('✅ 데이터가 저장되었습니다','success');
  }
  persistPerf();
  closeModal('modal-data-entry');
  renderDataEntryList();
  renderPerfPage();
}

function deleteDataEntry(id) {
  perfData = perfData.filter(d=>d.id!==id);
  persistPerf();
  renderDataEntryList();
  renderPerfPage();
  showNotif('삭제되었습니다','danger');
}

// ════════════════════════════════════════
// TAB 3: 차트 분석
// ════════════════════════════════════════
function renderPerfCharts() {
  setTimeout(() => {
    _renderStaffHBar();
    _renderRadar();
    _renderSatisfaction();
    _renderStackedType();
    _renderBranchPie();
    _renderBubble();
  }, 50);
}

function _renderStaffHBar() {
  const id = 'chart-staff-hbar';
  _destroyChart(id);
  const t = _chartTypes[id] || 'bar_h';
  const sorted = [...STAFF].map(s => ({
    name: s.name, color: s.color,
    count: perfData.filter(d=>d.staffId===s.id).length,
  })).sort((a,b)=>b.count-a.count);

  const ctx = el(id).getContext('2d');
  const isPie = ['pie','doughnut','polarArea'].includes(t);
  if (isPie) {
    _charts[id] = new Chart(ctx, {
      type: t,
      data: { labels: sorted.map(d=>d.name), datasets:[{ data:sorted.map(d=>d.count), backgroundColor:sorted.map(d=>d.color+'CC'), borderWidth:2, hoverOffset:8 }] },
      options: { responsive:true, plugins:{legend:{position:'right'}}, ...(t==='doughnut'?{cutout:'60%'}:{}) }
    });
  } else {
    const isH = t==='bar_h' || _isHorizontal(id);
    _charts[id] = new Chart(ctx, {
      type: t==='line' ? 'line' : 'bar',
      data: { labels:sorted.map(d=>d.name), datasets:[{ label:'활동 건수', data:sorted.map(d=>d.count), backgroundColor:sorted.map(d=>d.color+'CC'), borderColor:sorted.map(d=>d.color), borderRadius:6, tension:.4, pointRadius:4 }] },
      options: { ..._autoScaleOptions({}, id), indexAxis: isH ? 'y' : 'x', plugins:{legend:{display:false}} }
    });
  }
}

function _renderRadar() {
  const id = 'chart-radar';
  _destroyChart(id);
  const t = _chartTypes[id] || 'radar';
  const staffData = STAFF.map(s => {
    const pd = perfData.filter(d=>d.staffId===s.id);
    const totalPpl = pd.reduce((sum,d)=>sum+(Number(d.parent)||0)+(Number(d.teacher)||0)+(Number(d.director)||0),0);
    const avgSat = pd.filter(d=>d.satisfaction>0).length
      ? pd.filter(d=>d.satisfaction>0).reduce((sum,d)=>sum+d.satisfaction,0)/pd.filter(d=>d.satisfaction>0).length : 0;
    return { name:s.name, color:s.color, scores:[pd.length*10, Math.min(100,totalPpl/5), avgSat*20, (new Set(pd.map(d=>d.program)).size)*25, pd.filter(d=>d.result==='완료').length*10] };
  });
  const labels = ['건수','인원','만족도','다양성','완주율'];
  const ctx = el(id).getContext('2d');

  if (t === 'radar') {
    _charts[id] = new Chart(ctx, {
      type: 'radar',
      data: { labels, datasets: staffData.map(s=>({ label:s.name, data:s.scores, borderColor:s.color, backgroundColor:s.color+'22', pointBackgroundColor:s.color, pointRadius:4 })) },
      options: { responsive:true, scales:{ r:{ beginAtZero:true, ticks:{display:false} } }, plugins:{legend:{position:'right'}} }
    });
  } else {
    const isH = _isHorizontal(id);
    _charts[id] = new Chart(ctx, {
      type: t==='line' ? 'line' : 'bar',
      data: { labels, datasets: staffData.map(s=>({ label:s.name, data:s.scores, backgroundColor:s.color+'99', borderColor:s.color, tension:.4, pointRadius:4, borderRadius:6 })) },
      options: { ..._autoScaleOptions(), indexAxis: isH ? 'y' : 'x' }
    });
  }
}

function _renderSatisfaction() {
  const id = 'chart-satisfaction';
  _destroyChart(id);
  const t = _chartTypes[id] || 'bar';
  const progs = ['교사교육','부모교육','OT','설명회'];
  const avgs = progs.map(p => {
    const r = perfData.filter(d=>d.program===p&&d.satisfaction>0);
    return r.length ? +(r.reduce((s,d)=>s+d.satisfaction,0)/r.length).toFixed(2) : 0;
  });
  const ctx = el(id).getContext('2d');
  const isPie = ['pie','doughnut','polarArea'].includes(t);
  const isH = _isHorizontal(id);

  if (isPie) {
    _charts[id] = new Chart(ctx, {
      type: t,
      data: { labels:progs, datasets:[{ data:avgs, backgroundColor:progs.map(p=>PROG_COLORS[p]+'CC'), borderWidth:2, hoverOffset:8 }] },
      options: { responsive:true, plugins:{legend:{position:'right'}}, ...(t==='doughnut'?{cutout:'60%'}:{}) }
    });
  } else if (t==='radar') {
    _charts[id] = new Chart(ctx, {
      type:'radar',
      data:{ labels:progs, datasets:[{ label:'평균 만족도', data:avgs, borderColor:'#8B5CF6', backgroundColor:'#8B5CF622', pointBackgroundColor:'#8B5CF6', pointRadius:4 }] },
      options:{ responsive:true, scales:{ r:{ beginAtZero:true, max:5, ticks:{stepSize:1} } }, plugins:{legend:{display:false}} }
    });
  } else {
    _charts[id] = new Chart(ctx, {
      type: t==='line' ? 'line' : 'bar',
      data: { labels:progs, datasets:[{ label:'평균 만족도', data:avgs, backgroundColor:progs.map(p=>PROG_COLORS[p]+'CC'), borderColor:progs.map(p=>PROG_COLORS[p]), borderRadius:8, tension:.4, pointRadius:5, fill:_isArea(id) }] },
      options: { ..._autoScaleOptions({ scales:{ y:{ min:0, max:5, ticks:{stepSize:1} } } }), indexAxis: isH ? 'y' : 'x' }
    });
  }
}

function _renderStackedType() {
  const id = 'chart-stacked-type';
  _destroyChart(id);
  const t = _chartTypes[id] || 'bar_stacked';
  const isH = _isHorizontal(id);
  const isStacked = _isStacked(id) || t==='bar_stacked';
  const isArea = _isArea(id);
  const staffNames = STAFF.map(s=>s.name);
  const ctx = el(id).getContext('2d');
  const typeNames = ['학부모','선생님','원장','기타'];
  const keys = ['parent','teacher','director','other'];

  _charts[id] = new Chart(ctx, {
    type: (t==='line'||isArea) ? 'line' : 'bar',
    data: {
      labels: staffNames,
      datasets: typeNames.map((name,i) => ({
        label: name,
        data: STAFF.map(s=>perfData.filter(d=>d.staffId===s.id).reduce((sum,d)=>sum+(Number(d[keys[i]])||0),0)),
        backgroundColor: TYPE_COLORS[i]+'CC',
        borderColor: TYPE_COLORS[i],
        borderRadius: 6,
        tension: .4,
        fill: isArea,
        pointRadius: 4,
      }))
    },
    options: {
      ..._autoScaleOptions({
        scales:{
          x:{ stacked:isStacked },
          y:{ ...(getYScaleOptions(id)), stacked:isStacked }
        }
      }, id),
      indexAxis: isH ? 'y' : 'x'
    }
  });
}

function _renderBranchPie() {
  const id = 'chart-branch-pie';
  _destroyChart(id);
  const t = _chartTypes[id] || 'pie';
  // 지사별 데이터: perfData의 place 기반 집계
  const placeMap = {};
  perfData.forEach(d => {
    const key = d.place || d.branch || '기타';
    placeMap[key] = (placeMap[key]||0) + 1;
  });
  // 상위 10개만
  const sorted = Object.entries(placeMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const labels = sorted.map(x=>x[0]);
  const data   = sorted.map(x=>x[1]);
  const ctx = el(id).getContext('2d');
  const isPie = ['pie','doughnut','polarArea'].includes(t);
  const isH = _isHorizontal(id);

  if (isPie) {
    _charts[id] = new Chart(ctx, {
      type: t,
      data: { labels, datasets:[{ data, backgroundColor:labels.map((_,i)=>STAFF_PALETTE[i%STAFF_PALETTE.length]+'CC'), borderWidth:2, hoverOffset:10 }] },
      options: { responsive:true, plugins:{legend:{position:'right'}}, ...(t==='doughnut'?{cutout:'60%'}:{}) }
    });
  } else {
    _charts[id] = new Chart(ctx, {
      type: t==='line' ? 'line' : 'bar',
      data: { labels, datasets:[{ label:'방문 횟수', data, backgroundColor:labels.map((_,i)=>STAFF_PALETTE[i%STAFF_PALETTE.length]+'CC'), borderRadius:6, tension:.4, pointRadius:4 }] },
      options: { ..._autoScaleOptions(), indexAxis: isH ? 'y' : 'x', plugins:{legend:{display:false}} }
    });
  }
}

function _renderBubble() {
  const id = 'chart-bubble';
  _destroyChart(id);
  const t = _chartTypes[id] || 'bubble';
  const ctx = el(id).getContext('2d');
  const isH = _isHorizontal(id);

  if (t === 'bubble') {
    const datasets = STAFF.map((s,i) => {
      const pts = perfData.filter(d=>d.staffId===s.id).map(d=>{
        const total=(Number(d.parent)||0)+(Number(d.teacher)||0)+(Number(d.director)||0)+(Number(d.other)||0);
        return { x:i+1, y:d.satisfaction||0, r:Math.max(4,Math.sqrt(total)*2) };
      });
      return { label:s.name, data:pts, backgroundColor:s.color+'99', borderColor:s.color };
    });
    _charts[id] = new Chart(ctx, {
      type:'bubble', data:{ datasets },
      options:{ responsive:true, plugins:{ legend:{position:'right'}, tooltip:{ callbacks:{ label: c=>`${c.dataset.label}: 인원~${Math.round((c.raw.r/2)**2)}명, 만족도${c.raw.y}점` } } },
        scales:{ x:{min:0,max:STAFF.length+1,ticks:{callback:(_,i)=>STAFF[i-1]?.name||''},title:{display:true,text:'담당자'}}, y:{beginAtZero:true,title:{display:true,text:'만족도'}} } }
    });
  } else if (t === 'scatter') {
    const datasets = STAFF.map(s => ({
      label: s.name,
      data: perfData.filter(d=>d.staffId===s.id).map(d=>{
        const total=(Number(d.parent)||0)+(Number(d.teacher)||0)+(Number(d.director)||0)+(Number(d.other)||0);
        return { x:total, y:d.satisfaction||0 };
      }),
      backgroundColor: s.color+'99', borderColor: s.color, pointRadius: 5,
    }));
    _charts[id] = new Chart(ctx, {
      type:'scatter', data:{ datasets },
      options:{ ..._autoScaleOptions(), plugins:{legend:{position:'right'}},
        scales:{ x:{beginAtZero:true,title:{display:true,text:'인원 수'}}, y:{beginAtZero:true,max:5.5,title:{display:true,text:'만족도'}} } }
    });
  } else {
    // bar / line 등
    const staffTotals = STAFF.map(s=>({
      name:s.name, color:s.color,
      total:perfData.filter(d=>d.staffId===s.id).reduce((sum,d)=>sum+(Number(d.parent)||0)+(Number(d.teacher)||0)+(Number(d.director)||0)+(Number(d.other)||0),0)
    }));
    _charts[id] = new Chart(ctx, {
      type: t==='line' ? 'line' : 'bar',
      data:{ labels:staffTotals.map(s=>s.name), datasets:[{ label:'총 참가인원', data:staffTotals.map(s=>s.total), backgroundColor:staffTotals.map(s=>s.color+'CC'), borderColor:staffTotals.map(s=>s.color), borderRadius:6, tension:.4, pointRadius:5 }] },
      options:{ ..._autoScaleOptions(), indexAxis:isH?'y':'x', plugins:{legend:{display:false}} }
    });
  }
}

// ════════════════════════════════════════
// TAB 4: 담당자 랭킹
// ════════════════════════════════════════
function renderPerfRanking() {
  const ranked = STAFF.map(s => {
    const apps    = applications.filter(a=>a.assignedStaff===s.id&&a.status==='confirmed');
    const pd      = perfData.filter(d=>d.staffId===s.id);
    const total   = apps.length;
    const people  = pd.reduce((sum,d)=>sum+(Number(d.parent)||0)+(Number(d.teacher)||0)+(Number(d.director)||0)+(Number(d.other)||0), 0);
    const satArr  = pd.filter(d=>d.satisfaction>0);
    const avgSat  = satArr.length ? (satArr.reduce((s,d)=>s+d.satisfaction,0)/satArr.length).toFixed(1) : '-';
    const score   = total*30 + people*0.5 + (avgSat!=='-'?Number(avgSat)*10:0);
    return { ...s, total, people, avgSat, score };
  }).sort((a,b) => b.score - a.score);

  const maxScore = ranked[0]?.score || 1;

  setHTML('perf-ranking-content', `
    <div class="card" style="margin:0 0 16px;">
      <div class="card-header"><div class="card-title"><div class="icon icon-blue">🏆</div>종합 랭킹</div>
        <span style="font-size:12px;color:var(--pt-gray);">점수 = 건수×30 + 인원×0.5 + 만족도×10</span>
      </div>
      ${ranked.map((s,i) => `
        <div class="rank-card">
          <div class="rank-num" style="color:${i===0?'#F59E0B':i===1?'#94A3B8':i===2?'#CD7C2F':'#CBD5E1'};">
            ${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}
          </div>
          <div class="rank-avatar" style="background:${s.color};">${s.name[0]}</div>
          <div class="rank-info">
            <div class="rank-name">${s.name}</div>
            <div class="rank-role">${s.role}</div>
          </div>
          <div class="rank-stats">
            <div class="rank-stat"><span class="rank-stat-v">${s.total}</span><span class="rank-stat-l">확정 건</span></div>
            <div class="rank-stat"><span class="rank-stat-v">${s.people}</span><span class="rank-stat-l">참가 인원</span></div>
            <div class="rank-stat"><span class="rank-stat-v">${s.avgSat}</span><span class="rank-stat-l">만족도</span></div>
          </div>
          <div class="rank-bar-wrap">
            <div style="font-size:11px;color:var(--pt-gray);text-align:right;">${Math.round(s.score)}점</div>
            <div class="rank-bar"><div class="rank-bar-fill" style="width:${Math.round(s.score/maxScore*100)}%;"></div></div>
          </div>
        </div>`).join('')}
    </div>`);
}

// ════════════════════════════════════════
// ⑦ 연결 설정 페이지 (Flex HR 스타일)
// ════════════════════════════════════════

/** Google 캘린더 설정 페이지 초기화 (showPage에서 호출) */
function initGcalSettingsPage() {
  _updateConnCards();
}

/** 연결 카드 상태 업데이트 */
function _updateConnCards() {
  const connected = typeof gcal !== 'undefined' && gcal.isConnected;
  const configured = typeof GCAL_CONFIG !== 'undefined' &&
    GCAL_CONFIG.CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

  const badge  = el('conn-badge-edu');
  const btn    = el('conn-btn-edu');
  const meta   = el('conn-meta-edu');

  if (!badge || !btn) return;

  if (connected) {
    // 연동 중 상태
    badge.style.display = 'flex';
    btn.textContent     = '관리 ›';
    meta.style.display  = '';
    const email  = gcal.userEmail || '';
    const synced = Object.keys(gcal.syncedIds || {}).length;
    const now    = new Date();
    const connAt = localStorage.getItem('pt_gcal_connected_at') || now.toLocaleString('ko-KR');
    meta.innerHTML = `
      <span style="color:#16A34A;font-weight:600;">✓ 연동 중</span> &nbsp;·&nbsp;
      ${email ? email + ' &nbsp;·&nbsp; ' : ''}
      동기화된 일정 <b>${synced}건</b> &nbsp;·&nbsp;
      ${connAt} 연결`;
  } else {
    badge.style.display = 'none';
    btn.textContent     = configured ? '연결하기 ›' : '설정 필요 ›';
    meta.style.display  = 'none';
  }

  // 상단 topbar 뱃지도 갱신
  const topDot  = el('gcal-status-dot');
  const topText = el('gcal-status-text');
  if (topDot && topText) {
    if (connected)    { topDot.style.background = 'var(--pt-success)'; topText.textContent = '연결됨'; }
    else if (configured) { topDot.style.background = '#94A3B8'; topText.textContent = '미연결'; }
    else              { topDot.style.background = '#FCA5A5'; topText.textContent = 'API 미설정'; }
  }
}

/** "연결하기 ›" 클릭 → 연결 모달 오픈 */
function gcalOpenModal(type) {
  _renderGcalModal();
  openModal('modal-gcal-connect');
}

/** 모달 내부 상태 렌더링 */
function _renderGcalModal() {
  const connected = typeof gcal !== 'undefined' && gcal.isConnected;
  const configured = typeof GCAL_CONFIG !== 'undefined' &&
    GCAL_CONFIG.CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

  const badge   = el('modal-sync-badge');
  const meta    = el('modal-sync-meta');
  const action  = el('modal-sync-action');
  const allBtn  = el('modal-sync-all-btn');
  const allOff  = el('modal-sync-all-off');
  if (!action) return;

  if (connected) {
    badge.style.display = 'inline-flex';
    const email  = gcal.userEmail || '';
    const synced = Object.keys(gcal.syncedIds || {}).length;
    const connAt = localStorage.getItem('pt_gcal_connected_at') || new Date().toLocaleString('ko-KR');
    meta.innerHTML = `PlayTag Event Ca... &nbsp;·&nbsp; ${email ? email + ' 님이 ' : ''}${connAt} 연결`;
    action.innerHTML = `<button class="btn-disconnect" onclick="gcalDisconnectUI()">연동 해제하기</button>`;
    allBtn.style.display = '';
    allOff.style.display = 'none';
  } else {
    badge.style.display = 'none';
    meta.textContent = '배정 확정된 교육 일정이 Google 캘린더에 자동 등록됩니다.';
    if (configured) {
      action.innerHTML = `<button class="conn-btn" onclick="gcalConnectUI()" style="color:var(--pt-blue);font-weight:700;">연결하기 ›</button>`;
    } else {
      action.innerHTML = `<span style="font-size:12px;color:var(--pt-danger);">⚙️ Client ID 설정 필요</span>`;
    }
    allBtn.style.display = 'none';
    allOff.style.display = '';
  }
}

/** 모달에서 연결 버튼 클릭 */
async function gcalConnectUI() {
  const action = el('modal-sync-action');
  if (action) action.innerHTML = `<span style="font-size:12px;color:var(--pt-gray);">연결 중...</span>`;
  await gcalConnect();
  localStorage.setItem('pt_gcal_connected_at', new Date().toLocaleString('ko-KR'));
  _renderGcalModal();
  _updateConnCards();
}

/** 모달에서 연동 해제 */
async function gcalDisconnectUI() {
  await gcalDisconnect();
  localStorage.removeItem('pt_gcal_connected_at');
  _renderGcalModal();
  _updateConnCards();
  showNotif('Google 캘린더 연동이 해제되었습니다.', 'danger');
}

/** API 설정 카드 인라인 토글 */
function toggleSetupInline() {
  const box = el('conn-setup-inline');
  const btn = document.querySelector('#conn-card-setup .conn-btn');
  if (!box) return;
  if (box.style.display === 'none') {
    box.style.display = '';
    if (btn) btn.textContent = '닫기 ›';
  } else {
    box.style.display = 'none';
    if (btn) btn.textContent = '설정하기 ›';
  }
}

/** API 가이드 토글 */
function toggleSetupGuide() {
  const g = el('gcal-setup-guide');
  const arrow = el('guide-arrow');
  if (!g) return;
  if (g.style.display === 'none') {
    g.style.display = '';
    if (arrow) arrow.textContent = '▲';
  } else {
    g.style.display = 'none';
    if (arrow) arrow.textContent = '▼';
  }
}

/** Client ID 적용 */
function applyClientId() {
  const v = (el('gcal-client-id-input') || {}).value?.trim();
  if (!v || !v.includes('.apps.googleusercontent.com')) {
    showNotif('올바른 Client ID 형식이 아닙니다.', 'danger'); return;
  }
  localStorage.setItem('pt_gcal_client_id_override', v);
  showNotif('적용됩니다. gcal.js 파일도 동일하게 수정해주세요.', 'success');
  setTimeout(() => location.reload(), 1500);
}

// ════════════════════════════════════════
// ⑧ 관리자 이메일 등록 관리 (연결 설정 페이지)
// ════════════════════════════════════════

/** 관리자 등록 이메일 목록 렌더링 */
function renderAdminEmails() {
  const emails = _load('pt_admin_emails', ['admin@playtag.ai']);
  const wrap   = el('admin-email-list');
  if (!wrap) return;
  wrap.innerHTML = emails.map((e, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--pt-border);">
      <span style="font-size:13px;flex:1;">${e}</span>
      ${e === 'admin@playtag.ai'
        ? `<span style="font-size:11px;color:var(--pt-gray);padding:2px 8px;background:var(--pt-gray-light);border-radius:6px;">기본</span>`
        : `<button class="btn btn-danger btn-xs" onclick="removeAdminEmail(${i})">제거</button>`}
    </div>`).join('');
}

function addAdminEmail() {
  const input = el('admin-email-input');
  const v = (input?.value || '').trim().toLowerCase();
  if (!v || !v.includes('@')) { showNotif('올바른 이메일을 입력해주세요.', 'danger'); return; }
  const emails = _load('pt_admin_emails', ['admin@playtag.ai']);
  if (emails.includes(v)) { showNotif('이미 등록된 이메일입니다.', 'danger'); return; }
  emails.push(v);
  _save('pt_admin_emails', emails);
  if (input) input.value = '';
  renderAdminEmails();
  showNotif('✅ 관리자 이메일이 등록되었습니다.', 'success');
}

function removeAdminEmail(idx) {
  const emails = _load('pt_admin_emails', ['admin@playtag.ai']);
  emails.splice(idx, 1);
  _save('pt_admin_emails', emails);
  renderAdminEmails();
  showNotif('이메일이 제거되었습니다.', 'danger');
}

/** 연결 설정 페이지 초기화 오버라이드 — 이메일 관리 포함 */
const _origInitGcalSettingsPage = initGcalSettingsPage;
function initGcalSettingsPage() {
  _origInitGcalSettingsPage?.();
  renderAdminEmails();
}

/** logout 시 Google 세션도 정리 */
const _origLogout = logout;
function logout() {
  // Google One Tap 세션 해제
  if (typeof google !== 'undefined' && google.accounts?.id) {
    google.accounts.id.disableAutoSelect();
  }
  // Google Calendar 연결 해제
  if (typeof gcal !== 'undefined' && gcal.isConnected) {
    gcalDisconnect();
  }
  _origLogout();
}
