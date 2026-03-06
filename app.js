/* ══════════════════════════════════════
   PlayTag 교육·설명회 신청 관리 시스템
   app.js
══════════════════════════════════════ */

'use strict';

// ════════════════════════════════════════
// STATE
// ════════════════════════════════════════
const state = {
  currentUser:    null,
  currentRole:    null,
  selectedProg:   '',
  selectedAssignDateStr: '',
  selectedStaff:  '',
  currentAppId:   null,
  calYear:        new Date().getFullYear(),
  calMonth:       new Date().getMonth(),
  filterStatus:   '',
  filterProg:     '',
  datesConfirmed: false,
  staffDeleteId:  null,
  selectedStaffColor: '#1A6BFF',
};

// ════════════════════════════════════════
// INITIAL DATA  (실 서비스에서는 API / DB로 교체)
// ════════════════════════════════════════
let STAFF = [
  { id:'s1', name:'김민준', role:'교육 전문가',     tel:'010-1111-2222', email:'minjun@playtag.ai',  color:'#1A6BFF', progs:['교사교육','OT'],             note:'' },
  { id:'s2', name:'이서연', role:'부모교육 담당',   tel:'010-3333-4444', email:'seoyeon@playtag.ai', color:'#10B981', progs:['부모교육'],                   note:'' },
  { id:'s3', name:'박지호', role:'OT 전문가',       tel:'010-5555-6666', email:'jiho@playtag.ai',    color:'#8B5CF6', progs:['OT','설명회'],                note:'' },
  { id:'s4', name:'최유진', role:'설명회 진행',     tel:'010-7777-8888', email:'yujin@playtag.ai',   color:'#F59E0B', progs:['설명회','부모교육'],          note:'' },
  { id:'s5', name:'정하은', role:'교육 컨설턴트',   tel:'010-9999-0000', email:'haeun@playtag.ai',   color:'#EF4444', progs:['교사교육','부모교육'],        note:'' },
  { id:'s6', name:'한도윤', role:'그로스 매니저',   tel:'010-1234-5678', email:'doyun@playtag.ai',   color:'#06B6D4', progs:['교사교육','설명회','OT','부모교육'], note:'' },
];

let applications = [
  { id:'a1', user:'010-1234-5678', name:'김철수', program:'교사교육', branch:'서울 강남지사',  addr:'서울 강남구 테헤란로 123',     addrDetail:'4층 교육장',    count:25, note:'주차 공간 필요', dates:['2026-03-15T10:00','2026-03-18T14:00','2026-03-20T10:00'], status:'confirmed', assignedDate:'2026-03-15T10:00', assignedStaff:'s1', appliedAt:'2026-03-01' },
  { id:'a2', user:'010-2222-3333', name:'이영희', program:'부모교육', branch:'경기 수원지사',  addr:'경기 수원시 영통구 월드컵로 55', addrDetail:'3층 강의실',    count:40, note:'',             dates:['2026-03-20T10:00','2026-03-22T14:00',''],               status:'pending',   assignedDate:'',               assignedStaff:'',   appliedAt:'2026-03-03' },
  { id:'a3', user:'010-3333-4444', name:'박민수', program:'설명회',   branch:'부산 해운대지사', addr:'부산 해운대구 센텀로 88',       addrDetail:'B1 세미나홀',   count:60, note:'영상 촬영 예정', dates:['2026-03-25T14:00','2026-03-26T10:00',''],               status:'pending',   assignedDate:'',               assignedStaff:'',   appliedAt:'2026-03-04' },
  { id:'a4', user:'010-5555-6666', name:'최지수', program:'OT',       branch:'대구 수성지사',   addr:'대구 수성구 범물로 10',         addrDetail:'2층 OT실',      count:15, note:'',             dates:['2026-03-12T09:00','',''],                               status:'rejected',  assignedDate:'',               assignedStaff:'',   appliedAt:'2026-02-28' },
  { id:'a5', user:'010-7777-8888', name:'정소영', program:'교사교육', branch:'인천 남동지사',  addr:'인천 남동구 논현로 7',          addrDetail:'',              count:30, note:'',             dates:['2026-03-28T10:00','2026-03-29T14:00',''],               status:'pending',   assignedDate:'',               assignedStaff:'',   appliedAt:'2026-03-05' },
];

let registeredApplicants = [
  { name:'김철수', branch:'서울 강남지사', tel:'010-1234-5678', addr:'서울 강남구 역삼동 123', biz:'123-45-67890', date:'2026-02-10' },
  { name:'이영희', branch:'경기 수원지사', tel:'010-2222-3333', addr:'경기 수원시 팔달구 55',  biz:'234-56-78901', date:'2026-02-15' },
];

// ════════════════════════════════════════
// DOM HELPERS
// ════════════════════════════════════════
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const el = (id)  => document.getElementById(id);

function show(id) { el(id).style.display = ''; }
function hide(id) { el(id).style.display = 'none'; }
function setHTML(id, html) { el(id).innerHTML = html; }

// ════════════════════════════════════════
// AUTH
// ════════════════════════════════════════
function setLoginType(type) {
  $$('.login-tab').forEach((t, i) =>
    t.classList.toggle('active', (type === 'applicant' && i === 0) || (type === 'admin' && i === 1))
  );
  el('login-form-applicant').style.display = type === 'applicant' ? '' : 'none';
  el('login-form-admin').style.display     = type === 'admin'     ? '' : 'none';
}

function loginAs(role) {
  if (role === 'applicant') {
    const branch = el('l-branch').value;
    if (!branch) { showNotif('지사를 선택해주세요', 'danger'); return; }
    const id = el('l-id').value.trim();
    if (!id) { showNotif('아이디를 입력해주세요', 'danger'); return; }
    state.currentUser = { role: 'applicant', id, branch };
  } else {
    if (el('la-id').value !== 'admin') { showNotif('관리자 ID를 확인해주세요', 'danger'); return; }
    state.currentUser = { role: 'admin', id: 'admin', branch: '본사' };
  }
  state.currentRole = role;
  el('login-screen').style.display = 'none';
  el('app').style.display = 'block';
  setupNav();
  showNotif('로그인되었습니다 👋', 'success');
}

function logout() {
  state.currentUser = null;
  state.currentRole = null;
  el('login-screen').style.display = 'flex';
  el('app').style.display = 'none';
  clearForm();
}

// ════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════
function setupNav() {
  const dot   = el('user-dot');
  const label = el('user-label');
  const nav   = el('topbar-nav');

  if (state.currentRole === 'admin') {
    dot.className = 'user-dot dot-admin';
    label.textContent = '본사 관리자';
    nav.innerHTML = `
      <button class="nav-btn active" data-page="page-admin-apps">📋 신청 목록</button>
      <button class="nav-btn" data-page="page-calendar">📅 캘린더</button>
      <button class="nav-btn" data-page="page-admin-register">👥 신청자 등록</button>
      <button class="nav-btn" data-page="page-staff">👤 담당자 관리</button>
      <button class="nav-btn" data-page="page-performance">📈 퍼포먼스</button>`;
    renderAdminStats(); renderAdminApps();
    renderStaffList(); renderPerfPage(); renderRegList();
    showPage('page-admin-apps');
  } else {
    dot.className = 'user-dot dot-user';
    label.textContent = `${state.currentUser.id} · ${state.currentUser.branch}`;
    nav.innerHTML = `
      <button class="nav-btn active" data-page="page-apply">📋 신청하기</button>
      <button class="nav-btn" data-page="page-my-apps">📬 내 신청 현황</button>
      <button class="nav-btn" data-page="page-calendar">📅 일정 캘린더</button>`;
    showPage('page-apply');
  }

  // 네비 클릭 이벤트
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showPage(btn.dataset.page);
  });

  renderCalendar();
}

function showPage(id) {
  $$('.page').forEach(p => p.classList.remove('active'));
  el(id).classList.add('active');

  const refresh = {
    'page-calendar':       renderCalendar,
    'page-admin-apps':     () => { renderAdminStats(); renderAdminApps(); },
    'page-performance':    renderPerfPage,
    'page-my-apps':        renderMyApps,
    'page-admin-register': renderRegList,
    'page-staff':          renderStaffList,
  };
  if (refresh[id]) refresh[id]();
}

// ════════════════════════════════════════
// ADDRESS SEARCH  (행정안전부 도로명주소 API)
// ════════════════════════════════════════
const JUSO_KEY = 'devU01TX0FVVEgyMDI1MDMwNjE2MzgxMjExNTUxODQ=';

async function searchAddress() {
  const q = el('f-addr-search').value.trim();
  if (!q) { showNotif('검색어를 입력해주세요', 'danger'); return; }

  const box   = el('addr-results-box');
  const items = el('addr-result-items');
  const load  = el('addr-loading');

  box.style.display  = 'block';
  load.style.display = 'block';
  items.innerHTML    = '';

  try {
    const url = `https://business.juso.go.kr/addrlink/addrLinkApi.do?currentPage=1&countPerPage=10&keyword=${encodeURIComponent(q)}&confmKey=${JUSO_KEY}&resultType=json`;
    const res  = await fetch(url);
    const data = await res.json();
    load.style.display = 'none';

    const results = data?.results?.juso;
    if (results && results.length > 0) {
      items.innerHTML = results.map(r => addrItemHTML(
        `${r.roadAddrPart1} ${r.roadAddrPart2 || ''}`.trim(),
        r.jibunAddr, r.zipNo
      )).join('');
    } else {
      items.innerHTML = simulateAddrSearch(q);
    }
  } catch (_) {
    load.style.display = 'none';
    items.innerHTML    = simulateAddrSearch(q);
  }
}

function addrItemHTML(road, jibun, zip) {
  const safe = road.replace(/'/g, "\\'");
  return `<div class="addr-result-item" onclick="setAddress('${safe}')">
    <div class="addr-result-main">📍 ${road}</div>
    <div class="addr-result-sub">지번: ${jibun} · 우편번호: ${zip}</div>
  </div>`;
}

function simulateAddrSearch(q) {
  const pool = [
    { road:`서울특별시 강남구 테헤란로 152`, jibun:'서울 강남구 역삼동 712-2', zip:'06236' },
    { road:`서울특별시 강남구 선릉로 428`,    jibun:'서울 강남구 삼성동 159',   zip:'06168' },
    { road:`서울특별시 서초구 반포대로 217`,   jibun:'서울 서초구 반포동 19-3',  zip:'06584' },
    { road:`경기도 수원시 영통구 월드컵로 206`, jibun:'경기 수원시 이의동 906-5', zip:'16499' },
    { road:`부산광역시 해운대구 센텀중앙로 79`, jibun:'부산 해운대구 우동 1480',  zip:'48058' },
    { road:`대구광역시 수성구 범물로 10`,      jibun:'대구 수성구 범물동 210',   zip:'42605' },
    { road:`인천광역시 남동구 논현로 7`,       jibun:'인천 남동구 논현동 609',   zip:'21552' },
    { road:`광주광역시 서구 상무대로 889`,     jibun:'광주 서구 치평동 1210',    zip:'61949' },
  ];
  return pool.map(r => addrItemHTML(r.road, r.jibun, r.zip)).join('');
}

function setAddress(road) {
  el('f-addr').value       = road;
  el('f-addr-search').value = road;
  el('addr-results-box').style.display = 'none';
  el('f-addr-wrap').style.display      = '';
  el('f-addr-detail-wrap').style.display = '';
  showNotif('주소가 선택되었습니다', 'success');
}

function addrInputChange() {
  el('addr-results-box').style.display   = 'none';
  el('f-addr-wrap').style.display        = 'none';
  el('f-addr-detail-wrap').style.display = 'none';
  el('f-addr').value = '';
}

// Enter key on address input
document.addEventListener('DOMContentLoaded', () => {
  el('f-addr-search')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') searchAddress();
  });
});

// ════════════════════════════════════════
// DATE CONFIRM
// ════════════════════════════════════════
function updateDateConfirm() {
  if (state.datesConfirmed) return;
  const vals = [0, 1, 2].map(i => el('d' + i)?.value).filter(Boolean);
  const bar  = el('dates-confirm-bar');
  if (vals.length > 0) {
    bar.style.display = 'flex';
    el('dates-confirm-count').textContent = `${vals.length}개`;
    el('dates-confirm-list').innerHTML = vals.map((v, i) =>
      `<span style="margin-right:10px;">${i + 1}순위: ${formatDt(v)}</span>`
    ).join('');
  } else {
    bar.style.display = 'none';
  }
}

function confirmDates() {
  const vals = [0, 1, 2].map(i => el('d' + i)?.value).filter(Boolean);
  if (!vals.length) { showNotif('최소 1개의 희망 일시를 입력해주세요', 'danger'); return; }
  state.datesConfirmed = true;
  el('dates-confirm-bar').style.display    = 'none';
  el('date-slots-wrap').style.display      = 'none';
  el('dates-confirmed-display').style.display = '';
  el('dates-confirmed-text').innerHTML = vals.map((v, i) =>
    `${i + 1}순위: ${formatDt(v)}`
  ).join('&nbsp;&nbsp;|&nbsp;&nbsp;');
  showNotif('희망 일시가 확인되었습니다 ✅', 'success');
}

function editDates() {
  state.datesConfirmed = false;
  el('dates-confirmed-display').style.display = 'none';
  el('date-slots-wrap').style.display         = '';
  updateDateConfirm();
}

// ════════════════════════════════════════
// APPLY (지사 신청)
// ════════════════════════════════════════
function selectProg(el_, name) {
  $$('.prog-card').forEach(c => c.classList.remove('selected'));
  el_.classList.add('selected');
  state.selectedProg = name;
}

function clearForm() {
  $$('.prog-card').forEach(c => c.classList.remove('selected'));
  state.selectedProg   = '';
  state.datesConfirmed = false;

  ['f-branch','f-count','f-addr','f-addr-detail','f-note','f-addr-search'].forEach(id => {
    const e = el(id); if (e) e.value = '';
  });
  [0, 1, 2].forEach(i => { const e = el('d' + i); if (e) e.value = ''; });

  hide('addr-results-box');
  hide('f-addr-wrap');
  hide('f-addr-detail-wrap');
  hide('dates-confirm-bar');
  hide('dates-confirmed-display');
  show('date-slots-wrap');
}

function submitApplication() {
  if (!state.selectedProg)    { showNotif('프로그램을 선택해주세요', 'danger'); return; }
  if (!state.datesConfirmed) {
    const d0 = el('d0')?.value;
    if (!d0) { showNotif('희망 일시를 입력하고 확인 버튼을 눌러주세요', 'danger'); return; }
    showNotif('희망 일시 확인 버튼을 눌러주세요', 'danger'); return;
  }
  const addr = el('f-addr').value;
  if (!addr) { showNotif('장소를 검색하여 선택해주세요', 'danger'); return; }

  const app = {
    id: 'a' + Date.now(),
    user: state.currentUser.id,
    name: state.currentUser.branch,
    program: state.selectedProg,
    branch: el('f-branch').value || state.currentUser.branch,
    addr,
    addrDetail: el('f-addr-detail').value,
    count: Number(el('f-count').value) || 0,
    note:  el('f-note').value,
    dates: [0, 1, 2].map(i => el('d' + i)?.value || ''),
    status: 'pending', assignedDate: '', assignedStaff: '',
    appliedAt: new Date().toISOString().slice(0, 10),
  };
  applications.unshift(app);
  clearForm();
  showNotif('✅ 신청이 완료되었습니다!', 'success');
}

// ════════════════════════════════════════
// MY APPS (지사 현황)
// ════════════════════════════════════════
function renderMyApps() {
  const list = applications.filter(a => a.user === state.currentUser.id);
  const tb   = el('my-apps-body');
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📬</div><h3>신청 내역이 없습니다</h3><p>새 프로그램을 신청해보세요</p></div></td></tr>`;
    return;
  }
  tb.innerHTML = list.map(a => `<tr>
    <td>${progBadge(a.program)}</td>
    <td>${a.appliedAt}</td>
    <td style="font-size:11px;line-height:1.7;">${a.dates.filter(Boolean).map((d, i) => `<div>${i+1}. ${formatDt(d)}</div>`).join('')}</td>
    <td><div>${a.addr}</div><div style="font-size:11px;color:var(--pt-gray);">${a.addrDetail}</div></td>
    <td>${a.branch}</td>
    <td>${a.count}명</td>
    <td>${statusBadge(a.status)}</td>
    <td style="font-size:12px;">${a.assignedDate ? formatDt(a.assignedDate) : '-'}</td>
    <td>${a.assignedStaff ? staffName(a.assignedStaff) : '-'}</td>
  </tr>`).join('');
}

// ════════════════════════════════════════
// ADMIN — STATS & APPS
// ════════════════════════════════════════
function renderAdminStats() {
  const t = applications.length;
  const p = applications.filter(a => a.status === 'pending').length;
  const c = applications.filter(a => a.status === 'confirmed').length;
  const r = applications.filter(a => a.status === 'rejected').length;
  setHTML('admin-stats', `
    <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-label">전체 신청</div><div class="stat-value">${t}</div><div class="stat-sub">누적</div></div>
    <div class="stat-card"><div class="stat-icon">⏳</div><div class="stat-label">대기 중</div><div class="stat-value" style="color:var(--pt-warning);">${p}</div><div class="stat-sub">배정 필요</div></div>
    <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-label">확정 완료</div><div class="stat-value" style="color:var(--pt-success);">${c}</div><div class="stat-sub">배정 완료</div></div>
    <div class="stat-card"><div class="stat-icon">❌</div><div class="stat-label">반려</div><div class="stat-value" style="color:var(--pt-danger);">${r}</div><div class="stat-sub">반려 처리</div></div>`);
}

function filterApps(val, type) {
  if (type === 'status') state.filterStatus = val;
  else                   state.filterProg   = val;
  renderAdminApps();
}

function renderAdminApps() {
  let list = [...applications];
  if (state.filterStatus) list = list.filter(a => a.status === state.filterStatus);
  if (state.filterProg)   list = list.filter(a => a.program === state.filterProg);

  setHTML('admin-apps-body', list.map(a => `<tr>
    <td><div style="font-weight:600;">${a.name}</div><div style="font-size:11px;color:var(--pt-gray);">${a.user}</div></td>
    <td>${progBadge(a.program)}</td>
    <td>${a.branch}</td>
    <td>${a.appliedAt}</td>
    <td style="font-size:12px;">${a.dates[0] ? formatDt(a.dates[0]) : '-'}</td>
    <td>${a.count}명</td>
    <td>${statusBadge(a.status)}</td>
    <td>${a.assignedStaff
      ? `<span style="font-weight:600;">${staffName(a.assignedStaff)}</span>`
      : '<span style="color:var(--pt-gray);font-size:12px;">미배정</span>'}</td>
    <td style="font-size:12px;">${a.assignedDate ? formatDt(a.assignedDate) : '-'}</td>
    <td>
      ${a.status === 'pending'
        ? `<button class="btn btn-primary btn-sm" onclick="openAssign('${a.id}')">배정</button>`
        : `<button class="btn btn-ghost btn-sm"   onclick="openEventById('${a.id}')">상세</button>`}
    </td>
  </tr>`).join(''));
}

// ════════════════════════════════════════
// ASSIGN MODAL
// ════════════════════════════════════════
function openAssign(id) {
  state.currentAppId         = id;
  state.selectedAssignDateStr = '';
  state.selectedStaff        = '';

  const a = applications.find(x => x.id === id);

  setHTML('assign-app-info', `
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
      ${progBadge(a.program)}
      <span>🏢 <b>${a.branch}</b></span>
      <span>📍 ${a.addr}${a.addrDetail ? ' ' + a.addrDetail : ''}</span>
      <span>👥 ${a.count}명</span>
      ${a.note ? `<span>📝 ${a.note}</span>` : ''}
    </div>`);

  const colors = ['var(--pt-blue)', '#64748B', '#94A3B8'];
  const labels = ['1순위', '2순위', '3순위'];
  setHTML('assign-date-slots', a.dates.map((d, i) => {
    if (!d) return `<div class="date-slot" style="opacity:.35;"><div class="slot-num" style="background:${colors[i]};">${i+1}</div><span style="color:var(--pt-gray);font-size:13px;">미입력</span></div>`;
    return `<div class="date-slot" id="as-slot-${i}" style="cursor:pointer;" onclick="pickAssignDate(${i},'${d}')">
      <div class="slot-num" style="background:${colors[i]};">${i+1}</div>
      <span style="font-size:14px;font-weight:600;">${formatDt(d)}</span>
      <span class="slot-label">${labels[i]} — 클릭하여 선택</span>
    </div>`;
  }).join(''));

  el('assign-custom-date').value = '';

  setHTML('assign-staff-grid', STAFF.map(s => {
    const cnt = applications.filter(x => x.assignedStaff === s.id && x.status === 'confirmed').length;
    return `<div class="person-card" id="pc-${s.id}" onclick="selectStaff('${s.id}')">
      <div class="person-avatar" style="background:${s.color};">${s.name[0]}</div>
      <div>
        <div class="person-name">${s.name}</div>
        <div class="person-role">${s.role}</div>
        <div class="person-count">담당 ${cnt}건</div>
      </div>
    </div>`;
  }).join(''));

  openModal('modal-assign');
}

function pickAssignDate(i, d) {
  state.selectedAssignDateStr = d;
  el('assign-custom-date').value = '';
  $$('[id^="as-slot-"]').forEach((slot, j) => slot.classList.toggle('selected-slot', j === i));
}

function selectCustomDate() {
  const v = el('assign-custom-date').value;
  if (v) {
    state.selectedAssignDateStr = v;
    $$('[id^="as-slot-"]').forEach(s => s.classList.remove('selected-slot'));
  }
}

function selectStaff(id) {
  state.selectedStaff = id;
  $$('.person-card').forEach(c => c.classList.remove('selected'));
  el('pc-' + id)?.classList.add('selected');
}

function confirmAssign() {
  if (!state.selectedAssignDateStr) { showNotif('확정 일시를 선택해주세요', 'danger'); return; }
  if (!state.selectedStaff)         { showNotif('담당자를 선택해주세요', 'danger'); return; }
  const a = applications.find(x => x.id === state.currentAppId);
  a.status       = 'confirmed';
  a.assignedDate  = state.selectedAssignDateStr;
  a.assignedStaff = state.selectedStaff;
  closeModal('modal-assign');
  renderAdminApps(); renderAdminStats(); renderCalendar();
  showNotif('✅ 배정이 완료되었습니다!', 'success');
}

function rejectApp() {
  const a = applications.find(x => x.id === state.currentAppId);
  a.status = 'rejected'; a.assignedDate = ''; a.assignedStaff = '';
  closeModal('modal-assign');
  renderAdminApps(); renderAdminStats();
  showNotif('반려 처리되었습니다', 'danger');
}

// ════════════════════════════════════════
// CALENDAR
// ════════════════════════════════════════
function renderCalendar() {
  const today = new Date();
  el('cal-title').textContent = `${state.calYear}년 ${state.calMonth + 1}월`;

  const days  = ['일','월','화','수','목','금','토'];
  const first = new Date(state.calYear, state.calMonth, 1).getDay();
  const last  = new Date(state.calYear, state.calMonth + 1, 0).getDate();
  const prevLast = new Date(state.calYear, state.calMonth, 0).getDate();

  let html = days.map(d => `<div class="cal-day-hdr">${d}</div>`).join('');

  for (let i = 0; i < first; i++)
    html += `<div class="cal-cell other-month"><div class="cal-date">${prevLast - first + 1 + i}</div></div>`;

  for (let d = 1; d <= last; d++) {
    const isToday = d === today.getDate() && state.calMonth === today.getMonth() && state.calYear === today.getFullYear();
    const ds = `${state.calYear}-${String(state.calMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

    const confirmed = applications.filter(a => a.status === 'confirmed' && a.assignedDate?.startsWith(ds));
    const pending   = applications.filter(a => a.status === 'pending'   && a.dates[0]?.startsWith(ds));

    let evts = confirmed.map(e =>
      `<button class="cal-event evt-${progClass(e.program)}" onclick="showCalEventDetail('${e.id}',event)">${e.program}${staffNameShort(e.assignedStaff) ? ' · ' + staffNameShort(e.assignedStaff) : ''}</button>`
    ).join('');

    evts += pending.map(e => {
      const click = state.currentRole === 'admin' ? `openAssign('${e.id}')` : `openEventById('${e.id}')`;
      return `<button class="cal-event evt-pending" onclick="${click};event.stopPropagation()">${e.program} 대기</button>`;
    }).join('');

    const addBtn = state.currentRole === 'admin'
      ? `<div class="cal-add-btn-wrap"><button class="cal-add-btn" title="배정 신청 선택" onclick="openAssignFromCal('${ds}',event)">+</button></div>`
      : '';

    html += `<div class="cal-cell${isToday ? ' today' : ''}${(confirmed.length + pending.length) > 0 ? ' has-event' : ''}">
      <div class="cal-date">${d}</div>${evts}${addBtn}
    </div>`;
  }

  const rem = (7 - ((first + last) % 7)) % 7;
  for (let i = 1; i <= rem; i++)
    html += `<div class="cal-cell other-month"><div class="cal-date">${i}</div></div>`;

  el('cal-grid').innerHTML = html;
}

function calNav(dir) {
  if (dir === 0) { state.calYear = new Date().getFullYear(); state.calMonth = new Date().getMonth(); }
  else {
    state.calMonth += dir;
    if (state.calMonth < 0)  { state.calMonth = 11; state.calYear--; }
    if (state.calMonth > 11) { state.calMonth =  0; state.calYear++; }
  }
  renderCalendar();
}

function openAssignFromCal(dateStr, e) {
  e.stopPropagation();
  const list = applications.filter(a => a.status === 'pending');
  const match = list.filter(a => a.dates.some(d => d && d.startsWith(dateStr)));
  const show  = match.length ? match : list;

  if (!show.length) { showNotif('배정 가능한 신청이 없습니다', 'danger'); return; }

  el('event-modal-title').textContent = `📅 ${dateStr} — 배정 신청 선택`;
  setHTML('event-modal-body', show.map(a => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px;border:1.5px solid var(--pt-border);border-radius:10px;margin-bottom:8px;">
      ${progBadge(a.program)}
      <div style="flex:1;">
        <div style="font-weight:600;font-size:13px;">${a.name} · ${a.branch}</div>
        <div style="font-size:11px;color:var(--pt-gray);">희망: ${a.dates.filter(Boolean).map(d => formatDt(d)).join(', ')}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="closeModal('modal-event');openAssign('${a.id}')">배정</button>
    </div>`).join(''));
  setHTML('event-modal-actions', `<button class="btn btn-ghost" onclick="closeModal('modal-event')">닫기</button>`);
  openModal('modal-event');
}

function showCalEventDetail(id, e) {
  e.stopPropagation();
  const a  = applications.find(x => x.id === id);
  const st = STAFF.find(s => s.id === a.assignedStaff);

  el('event-modal-title').innerHTML = `${progBadge(a.program)} <span style="font-size:14px;font-weight:500;">${a.branch}</span>`;
  setHTML('event-modal-body', `
    <div class="detail-row"><div class="detail-key">확정일시</div><div class="detail-val">${formatDt(a.assignedDate)}</div></div>
    <div class="detail-row"><div class="detail-key">담당자</div><div class="detail-val">${st ? `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:22px;height:22px;border-radius:6px;background:${st.color};display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">${st.name[0]}</span>${st.name}</span>` : '-'}</div></div>
    <div class="detail-row"><div class="detail-key">장소</div><div class="detail-val">${a.addr}${a.addrDetail ? ' ' + a.addrDetail : ''}</div></div>
    <div class="detail-row"><div class="detail-key">예상인원</div><div class="detail-val">${a.count}명</div></div>
    ${a.note ? `<div class="detail-row"><div class="detail-key">특이사항</div><div class="detail-val">${a.note}</div></div>` : ''}`);
  setHTML('event-modal-actions',
    state.currentRole === 'admin'
      ? `<button class="btn btn-warn btn-sm" onclick="closeModal('modal-event');openAssign('${a.id}')">재배정</button><button class="btn btn-ghost" onclick="closeModal('modal-event')">닫기</button>`
      : `<button class="btn btn-ghost" onclick="closeModal('modal-event')">닫기</button>`);
  openModal('modal-event');
}

function openEventById(id) {
  const a = applications.find(x => x.id === id);
  el('event-modal-title').innerHTML = `${progBadge(a.program)} 상세`;
  setHTML('event-modal-body', `
    <div class="detail-row"><div class="detail-key">상태</div><div class="detail-val">${statusBadge(a.status)}</div></div>
    <div class="detail-row"><div class="detail-key">지사</div><div class="detail-val">${a.branch}</div></div>
    <div class="detail-row"><div class="detail-key">장소</div><div class="detail-val">${a.addr}${a.addrDetail ? ' ' + a.addrDetail : ''}</div></div>
    <div class="detail-row"><div class="detail-key">예상인원</div><div class="detail-val">${a.count}명</div></div>
    <div class="detail-row"><div class="detail-key">희망일시</div><div class="detail-val">${a.dates.filter(Boolean).map((d, i) => `${i+1}순위: ${formatDt(d)}`).join('<br>')}</div></div>
    <div class="detail-row"><div class="detail-key">확정일시</div><div class="detail-val">${a.assignedDate ? formatDt(a.assignedDate) : '-'}</div></div>
    <div class="detail-row"><div class="detail-key">담당자</div><div class="detail-val">${a.assignedStaff ? staffName(a.assignedStaff) : '-'}</div></div>
    ${a.note ? `<div class="detail-row"><div class="detail-key">특이사항</div><div class="detail-val">${a.note}</div></div>` : ''}`);
  setHTML('event-modal-actions',
    (state.currentRole === 'admin' && a.status === 'pending')
      ? `<button class="btn btn-primary btn-sm" onclick="closeModal('modal-event');openAssign('${a.id}')">배정하기</button><button class="btn btn-ghost" onclick="closeModal('modal-event')">닫기</button>`
      : `<button class="btn btn-ghost" onclick="closeModal('modal-event')">닫기</button>`);
  openModal('modal-event');
}

// ════════════════════════════════════════
// STAFF MANAGEMENT
// ════════════════════════════════════════
function renderStaffList() {
  const grid = el('staff-list-grid');
  if (!STAFF.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">👤</div><h3>등록된 담당자가 없습니다</h3></div>`;
    return;
  }
  grid.innerHTML = STAFF.map(s => {
    const cnt = applications.filter(a => a.assignedStaff === s.id && a.status === 'confirmed').length;
    return `<div class="staff-mgmt-card">
      <div class="staff-badge-count">${cnt}건</div>
      <div class="staff-avatar-lg" style="background:${s.color};">${s.name[0]}</div>
      <div class="staff-mgmt-name">${s.name}</div>
      <div class="staff-mgmt-role">${s.role}</div>
      <div class="staff-mgmt-tel">📞 ${s.tel}</div>
      <div style="font-size:11px;color:var(--pt-gray);margin-top:2px;">✉️ ${s.email}</div>
      ${s.progs.length ? `<div class="staff-prog-tags">${s.progs.map(p => `<span class="staff-prog-tag">${p}</span>`).join('')}</div>` : ''}
      ${s.note ? `<div style="font-size:11px;color:var(--pt-gray);margin-top:6px;font-style:italic;">${s.note}</div>` : ''}
      <div class="staff-actions">
        <button class="btn btn-outline btn-xs" onclick="openStaffModal('${s.id}')">✏️ 수정</button>
        <button class="btn btn-danger  btn-xs" onclick="askDeleteStaff('${s.id}','${s.name}')">🗑 삭제</button>
      </div>
    </div>`;
  }).join('');
}

function openStaffModal(id) {
  el('staff-edit-id').value = id || '';
  if (id) {
    const s = STAFF.find(x => x.id === id);
    el('staff-modal-title').textContent = '👤 담당자 수정';
    el('sm-name').value  = s.name;
    el('sm-role').value  = s.role;
    el('sm-tel').value   = s.tel;
    el('sm-email').value = s.email;
    el('sm-note').value  = s.note || '';
    state.selectedStaffColor = s.color;
    el('sm-color').value = s.color;
    $$('.color-swatch').forEach(sw => sw.classList.toggle('selected', sw.dataset.color === s.color));
    $$('#sm-prog-checks input[type=checkbox]').forEach(cb => { cb.checked = s.progs.includes(cb.value); });
  } else {
    el('staff-modal-title').textContent = '👤 담당자 등록';
    ['sm-name','sm-role','sm-tel','sm-email','sm-note'].forEach(i => { el(i).value = ''; });
    state.selectedStaffColor = '#1A6BFF';
    el('sm-color').value = '#1A6BFF';
    $$('.color-swatch').forEach((sw, i) => sw.classList.toggle('selected', i === 0));
    $$('#sm-prog-checks input[type=checkbox]').forEach(cb => { cb.checked = false; });
  }
  openModal('modal-staff');
}

function selectColor(elSwatch, c) {
  state.selectedStaffColor = c;
  el('sm-color').value = c;
  $$('.color-swatch').forEach(s => s.classList.remove('selected'));
  elSwatch.classList.add('selected');
}

function saveStaff() {
  const name = el('sm-name').value.trim();
  if (!name) { showNotif('이름을 입력해주세요', 'danger'); return; }
  const progs = $$('#sm-prog-checks input:checked').map(cb => cb.value);
  const data  = {
    name, role: el('sm-role').value, tel: el('sm-tel').value,
    email: el('sm-email').value, color: state.selectedStaffColor,
    progs, note: el('sm-note').value,
  };
  const editId = el('staff-edit-id').value;
  if (editId) {
    const idx = STAFF.findIndex(s => s.id === editId);
    STAFF[idx] = { ...STAFF[idx], ...data };
    showNotif('✅ 담당자 정보가 수정되었습니다', 'success');
  } else {
    STAFF.push({ id: 's' + Date.now(), ...data });
    showNotif('✅ 담당자가 등록되었습니다', 'success');
  }
  closeModal('modal-staff');
  renderStaffList(); renderPerfPage();
}

function askDeleteStaff(id, name) {
  state.staffDeleteId = id;
  setHTML('confirm-delete-msg', `<b>${name}</b> 담당자를 삭제하시겠습니까?<br><span style="font-size:12px;color:var(--pt-danger);">삭제 후 복구할 수 없습니다.</span>`);
  openModal('modal-confirm-delete');
}

function confirmDeleteStaff() {
  STAFF = STAFF.filter(s => s.id !== state.staffDeleteId);
  closeModal('modal-confirm-delete');
  renderStaffList(); renderPerfPage();
  showNotif('담당자가 삭제되었습니다', 'danger');
}

// ════════════════════════════════════════
// REGISTER (신청자 등록)
// ════════════════════════════════════════
function registerApplicant() {
  const name = el('reg-name').value.trim();
  if (!name) { showNotif('이름을 입력해주세요', 'danger'); return; }
  registeredApplicants.unshift({
    name, branch: el('reg-branch').value,
    tel: el('reg-tel').value, addr: el('reg-addr').value,
    biz: el('reg-biz').value,
    date: new Date().toISOString().slice(0, 10),
  });
  ['reg-name','reg-branch','reg-tel','reg-addr','reg-biz'].forEach(i => { const e = el(i); if (e) e.value = ''; });
  renderRegList();
  showNotif('✅ 신청자가 등록되었습니다!', 'success');
}

function renderRegList() {
  setHTML('reg-list-body', registeredApplicants.map(r => `<tr>
    <td><b>${r.name}</b></td><td>${r.branch}</td><td>${r.tel}</td>
    <td>${r.addr}</td><td>${r.biz}</td><td>${r.date}</td>
  </tr>`).join(''));
}

// ════════════════════════════════════════
// PERFORMANCE
// ════════════════════════════════════════
function renderPerfPage() {
  const stats = STAFF.map(s => {
    const apps = applications.filter(a => a.assignedStaff === s.id && a.status === 'confirmed');
    return { ...s, total: apps.length, totalPeople: apps.reduce((sum, a) => sum + Number(a.count || 0), 0), score: Math.min(100, apps.length * 25) };
  }).sort((a, b) => b.total - a.total);

  setHTML('perf-stats', `
    <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-label">활성 담당자</div><div class="stat-value">${STAFF.length}</div><div class="stat-sub">등록됨</div></div>
    <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-label">완료 건수</div><div class="stat-value">${applications.filter(a => a.status === 'confirmed').length}</div><div class="stat-sub">이번 달</div></div>
    <div class="stat-card"><div class="stat-icon">🏆</div><div class="stat-label">최다 담당</div><div class="stat-value" style="font-size:16px;">${stats[0]?.name || '-'}</div><div class="stat-sub">${stats[0]?.total || 0}건</div></div>
    <div class="stat-card"><div class="stat-icon">👫</div><div class="stat-label">총 교육인원</div><div class="stat-value">${stats.reduce((s, x) => s + x.totalPeople, 0)}</div><div class="stat-sub">명</div></div>`);

  setHTML('perf-content', `<div class="table-wrap"><table>
    <thead><tr><th>순위</th><th>담당자</th><th>역할</th><th>담당 건수</th><th>교육 인원</th><th style="width:200px;">퍼포먼스</th></tr></thead>
    <tbody>${stats.map((s, i) => `<tr>
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
// MODAL HELPERS
// ════════════════════════════════════════
function openModal(id)  { el(id).classList.add('open'); }
function closeModal(id) { el(id).classList.remove('open'); }

// backdrop click
document.addEventListener('DOMContentLoaded', () => {
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
});

// ════════════════════════════════════════
// NOTIFICATION TOAST
// ════════════════════════════════════════
let _notifTimer = null;
function showNotif(msg, type = 'success') {
  const n = el('notif');
  el('notif-icon').textContent = type === 'success' ? '✅' : '❌';
  el('notif-msg').textContent  = msg;
  n.className = `notif notif-${type} show`;
  clearTimeout(_notifTimer);
  _notifTimer = setTimeout(() => n.classList.remove('show'), 3200);
}

// ════════════════════════════════════════
// UTILITY FORMATTERS
// ════════════════════════════════════════
function progClass(p) {
  return { '교사교육':'teacher', '부모교육':'parent', 'OT':'ot', '설명회':'explain' }[p] || 'teacher';
}
function progBadge(p) {
  const m = { '교사교육':'#DBEAFE:#1D4ED8:👩‍🏫', '부모교육':'#D1FAE5:#065F46:👨‍👩‍👧', 'OT':'#EDE9FE:#5B21B6:🎓', '설명회':'#FEF3C7:#92400E:📊' };
  const [bg, c, ic] = (m[p] || '#F3F4F6:#374151:📋').split(':');
  return `<span style="background:${bg};color:${c};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">${ic} ${p}</span>`;
}
function statusBadge(s) {
  const m = { pending:'badge-pending:⏳:대기 중', confirmed:'badge-confirmed:✅:확정', rejected:'badge-rejected:❌:반려' };
  const [cls, icon, label] = (m[s] || 'badge-pending:⏳:대기 중').split(':');
  return `<span class="badge ${cls}"><span class="badge-dot"></span>${icon} ${label}</span>`;
}
function staffName(id)       { return STAFF.find(s => s.id === id)?.name || id; }
function staffNameShort(id)  { const n = STAFF.find(s => s.id === id)?.name || ''; return n ? n[0] + '..' : ''; }
function formatDt(dt) {
  if (!dt) return '-';
  const d = new Date(dt);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
