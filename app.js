(function () {
  'use strict';

  const API_BASE = 'http://localhost:3000/api';
  const EVENTS = ['남자단식', '여자단식', '남자복식', '여자복식', '혼성복식'];
  const LEVELS = ['입문', '초급', '중급', '상급', '동호회'];

  let TOKEN = localStorage.getItem('tt_token') || null;
  let currentUser = null;
  let currentTab = 'dashboard';
  let selectedTournament = null;
  let selectedEvent = EVENTS[0];
  let matchFilter = 'all';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ===== API HELPERS ===== */
  async function api(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (TOKEN) opts.headers['Authorization'] = `Bearer ${TOKEN}`;
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '요청 실패' }));
      throw new Error(err.error || '요청 실패');
    }
    return res.json();
  }

  function apiGet(path) { return api('GET', path); }
  function apiPost(path, body) { return api('POST', path, body); }
  function apiPut(path, body) { return api('PUT', path, body); }

  /* ===== TOAST ===== */
  let toastTimer;
  function toast(msg) {
    const existing = $('.toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2800);
  }

  /* ===== AUTH ===== */
  function showAuth() {
    $('#authScreen').classList.remove('hidden');
    $('#appShell').classList.add('hidden');
    renderAuthForm();
  }

  function showApp() {
    $('#authScreen').classList.add('hidden');
    $('#appShell').classList.remove('hidden');
    renderApp();
  }

  async function login(email, password) {
    try {
      const data = await apiPost('/auth/login', { email, password });
      TOKEN = data.token;
      localStorage.setItem('tt_token', TOKEN);
      currentUser = data.user;
      return true;
    } catch (e) {
      return false;
    }
  }

  async function register(formData) {
    try {
      const data = await apiPost('/auth/register', {
        email: formData.email.value.trim(),
        password: formData.password.value,
        name: formData.name.value.trim(),
        dept: formData.dept.value.trim(),
        gender: formData.gender.value,
        level: formData.level.value,
        phone: formData.phone?.value?.trim() || '',
      });
      TOKEN = data.token;
      localStorage.setItem('tt_token', TOKEN);
      currentUser = data.user;
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  }

  function logout() {
    TOKEN = null;
    currentUser = null;
    localStorage.removeItem('tt_token');
    showAuth();
    toast('로그아웃되었습니다.');
  }

  function isAdmin() {
    return currentUser && currentUser.role === 'admin';
  }

  async function ensureUser() {
    if (!TOKEN) { showAuth(); return false; }
    if (!currentUser) {
      try {
        currentUser = await apiGet('/auth/me');
      } catch {
        logout();
        return false;
      }
    }
    return true;
  }

  /* ===== RENDER AUTH ===== */
  function renderAuthForm() {
    const isLogin = state.authMode === 'login';
    const isRegister = state.authMode === 'register';
    const isForgot = state.authMode === 'forgot';

    $('#authFormTitle').textContent = isLogin ? '로그인' : isRegister ? '회원가입' : '비밀번호 찾기';
    $$('.auth-tabs button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === state.authMode || (state.authMode === 'forgot' && btn.dataset.mode === 'login'));
    });

    if (isForgot) {
      $('#authFields').innerHTML = `
        <div class="alert alert-success">데모 환경입니다. 관리자에게 문의하거나 아래 데모 계정을 이용해 주세요.</div>
        <div class="field"><label>등록 이메일</label><input type="email" name="email" placeholder="20260001@jubansek.kr"></div>
        <button type="submit" class="btn btn-primary">재설정 링크 발송 (데모)</button>
        <button type="button" class="auth-link" id="backToLogin">로그인으로 돌아가기</button>
      `;
      $('#backToLogin')?.addEventListener('click', () => { state.authMode = 'login'; renderAuthForm(); });
      return;
    }

    $('#authFields').innerHTML = `
      ${isRegister ? `
        <div class="row2">
          <div class="field"><label>이름</label><input type="text" name="name" required placeholder="홍길동"></div>
          <div class="field"><label>부서</label><input type="text" name="dept" required placeholder="생산1팀"></div>
        </div>
        <div class="row2">
          <div class="field"><label>성별</label><select name="gender" required><option value="">선택</option><option value="M">남성</option><option value="F">여성</option></select></div>
          <div class="field"><label>실력 등급</label><select name="level" required>${LEVELS.map(l => `<option value="${l}">${l}</option>`).join('')}</select></div>
        </div>
      ` : ''}
      <div class="field"><label>이메일</label><input type="email" name="email" required placeholder="20260001@jubansek.kr" autocomplete="email"></div>
      <div class="field"><label>비밀번호</label><input type="password" name="password" required placeholder="••••••••" autocomplete="${isLogin ? 'current-password' : 'new-password'}"></div>
      <button type="submit" class="btn btn-primary">${isLogin ? '로그인' : '가입하기'}</button>
      ${isLogin ? '<button type="button" class="auth-link" id="forgotBtn">비밀번호를 잊으셨나요?</button>' : ''}
    `;
    $('#forgotBtn')?.addEventListener('click', () => { state.authMode = 'forgot'; renderAuthForm(); });
  }

  const state = {
    authMode: 'login'
  };

  /* ===== RENDER APP ===== */
  async function renderApp() {
    if (!await ensureUser()) return;

    $('#headerTitle').textContent = getTabTitle(currentTab);
    $('#adminBadge').classList.toggle('hidden', !isAdmin());

    try {
      const notifData = await apiGet('/notifications/unread-count');
      const badge = $('#notifBadge');
      if (notifData.count > 0) { badge.textContent = notifData.count > 9 ? '9+' : notifData.count; badge.classList.remove('hidden'); }
      else badge.classList.add('hidden');
    } catch {}

    $$('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === currentTab);
      if (btn.dataset.tab === 'players') {
        btn.classList.toggle('hidden', !isAdmin());
      }
    });
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${currentTab}`));

    try {
      switch (currentTab) {
        case 'dashboard': await renderDashboard(); break;
        case 'brackets': await renderBrackets(); break;
        case 'matches': await renderMatches(); break;
        case 'leaderboard': await renderLeaderboard(); break;
        case 'announcements': await renderAnnouncements(); break;
        case 'players': await renderPlayers(); break;
        case 'profile': await renderProfile(); break;
      }
    } catch (e) {
      console.error(e);
      $(`#panel-${currentTab}`).innerHTML = '<div class="empty-state"><p>데이터를 불러오는 중 오류가 발생했습니다.</p></div>';
    }
  }

  function getTabTitle(tab) {
    const titles = { dashboard: '대시보드', brackets: '대진표', matches: '경기', leaderboard: '순위', announcements: '공지', players: '선수단', profile: '프로필' };
    return titles[tab] || '탁구대회';
  }

  async function renderTournamentPills(containerId) {
    const el = $(containerId);
    try {
      const tournaments = await apiGet('/tournaments');
      el.innerHTML = tournaments.map(t => `
        <button class="tournament-pill ${t.id === selectedTournament ? 'active' : ''}" data-id="${t.id}">${esc(t.name)}</button>
      `).join('');
      el.querySelectorAll('.tournament-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedTournament = btn.dataset.id;
          renderApp();
        });
      });
      if (!selectedTournament && tournaments.length) {
        selectedTournament = tournaments[0].id;
      }
    } catch {
      el.innerHTML = '';
    }
  }

  function renderEventPills(containerId) {
    const el = $(containerId);
    el.innerHTML = `<div class="filter-tabs" style="margin:0">${EVENTS.map(ev => `
      <button class="${ev === selectedEvent ? 'active' : ''}" data-ev="${ev}">${ev}</button>
    `).join('')}</div>`;
    el.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedEvent = btn.dataset.ev;
        renderApp();
      });
    });
  }

  /* ===== DASHBOARD ===== */
  async function renderDashboard() {
    const tournaments = await apiGet('/tournaments');
    const players = await apiGet('/players');

    const totalPlayers = players.length;
    const upcomingMatches = 0;

    $('#dashStats').innerHTML = `
      <div class="stat-box"><div class="num">${tournaments.length}</div><div class="lbl">대회</div></div>
      <div class="stat-box"><div class="num">${totalPlayers}</div><div class="lbl">선수</div></div>
      <div class="stat-box"><div class="num">${upcomingMatches}</div><div class="lbl">내 경기</div></div>
    `;

    await renderTournamentPills('#dashTournamentPills');

    const t = tournaments.find(x => x.id === selectedTournament);
    if (!t) {
      $('#dashContent').innerHTML = '<div class="empty-state"><p>등록된 대회가 없습니다.</p></div>';
      if (isAdmin()) {
        $('#dashContent').innerHTML += '<button class="btn btn-primary btn-sm" id="createTournament">+ 새 대회 만들기</button>';
        $('#createTournament')?.addEventListener('click', () => openTournamentModal());
      }
      return;
    }

    let participants = [];
    try { participants = await apiGet(`/tournaments/${t.id}/participants`); } catch {}

    const isJoined = participants.some(p => p.id === currentUser.id);
    const statusLabel = { open: '모집중', live: '진행중', closed: '종료' };

    $('#dashContent').innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <h3>${esc(t.name)}</h3>
            <div class="card-meta">${esc(t.date)} · ${esc(t.location)}</div>
          </div>
          <span class="chip ${t.status}">${statusLabel[t.status] || t.status}</span>
        </div>
        <p style="margin:0 0 14px;font-size:14px;color:var(--ink-3)">${esc(t.description || '')}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${!isJoined && t.status === 'open' ? `<button class="btn btn-accent btn-sm" id="joinTournament">대회 참가 신청</button>` : ''}
          ${isJoined ? `<span class="chip open">참가 완료</span>` : ''}
          ${isAdmin() ? `<button class="btn btn-ghost btn-sm" id="editTournament">대회 수정</button>` : ''}
        </div>
      </div>

      <p class="section-title">참가 선수 (${participants.length}명)</p>
      <div class="card" style="padding:14px 18px">
        <ul class="player-list">${participants.length ? participants.map(p => `
          <li class="player-item">
            <div class="avatar">${initials(p.name)}</div>
            <div class="player-info"><div class="name">${esc(p.name)}</div><div class="sub">${esc(p.dept)} · ${esc(p.level)}</div></div>
          </li>
        `).join('') : '<li style="color:var(--muted);font-size:13px">아직 참가자가 없습니다.</li>'}</ul>
      </div>

      ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="createTournament" style="margin-top:8px">+ 새 대회 만들기</button>` : ''}
    `;

    $('#joinTournament')?.addEventListener('click', async () => {
      try {
        await apiPost(`/tournaments/${t.id}/join`);
        toast('대회 참가 신청 완료!');
        renderApp();
      } catch (e) {
        toast(e.message);
      }
    });

    $('#createTournament')?.addEventListener('click', () => openTournamentModal());
    $('#editTournament')?.addEventListener('click', () => openTournamentModal(t));
  }

  /* ===== BRACKETS ===== */
  async function renderBrackets() {
    await renderTournamentPills('#bracketTournamentPills');
    renderEventPills('#bracketEventPills');

    let bracket;
    try {
      bracket = await apiGet(`/brackets/${selectedTournament}/${selectedEvent}`);
    } catch {
      $('#bracketContent').innerHTML = '<div class="empty-state"><p>대진표를 불러올 수 없습니다.</p></div>';
      return;
    }

    const participants = await apiGet(`/tournaments/${selectedTournament}/participants`).catch(() => []);
    const allUsers = await apiGet('/users').catch(() => []);
    const userMap = {};
    allUsers.forEach(u => userMap[u.id] = u);

    const rounds = bracket.size ? Math.log2(bracket.size) : 3;
    let html = '<div class="bracket-wrap"><div class="bracket">';
    for (let r = 0; r < rounds; r++) {
      const roundMatches = bracket.matches.filter(m => m.round === r);
      const labels = ['8강', '4강', '준결승', '결승'];
      html += `<div class="bracket-round">
        <div class="round-label">${labels[r] || `R${r + 1}`}</div>
        ${roundMatches.map(m => renderBracketMatch(m, r, participants, bracket, userMap)).join('')}
      </div>`;
    }
    html += '</div></div>';

    if (isAdmin()) {
      html += `<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="resetBracket">대진표 초기화</button>
        <button class="btn btn-primary btn-sm" id="saveBracket">배정 저장</button>
      </div>`;
    }

    $('#bracketContent').innerHTML = html;

    if (isAdmin()) {
      $$('.bracket-player-select').forEach(sel => {
        sel.addEventListener('change', async e => {
          const matchId = sel.dataset.match;
          const slot = parseInt(sel.dataset.slot);
          try {
            await apiPut(`/brackets/${bracket.id}/assign`, { matchId, slot, playerId: sel.value || null });
          } catch (ex) {
            toast(ex.message);
          }
        });
      });
      $('#resetBracket')?.addEventListener('click', async () => {
        if (confirm('대진표를 초기화하시겠습니까?')) {
          try {
            await apiPost(`/brackets/${bracket.id}/reset`);
            toast('대진표가 초기화되었습니다.');
            renderApp();
          } catch (ex) { toast(ex.message); }
        }
      });
      $('#saveBracket')?.addEventListener('click', () => {
        toast('대진표 배정이 저장되었습니다.');
      });
    }
  }

  function renderBracketMatch(m, round, participants, bracket, userMap) {
    const admin = isAdmin();
    const players = participants || [];
    const isFirstRound = round === 0;
    userMap = userMap || {};

    function slotHtml(pid, slot) {
      const uname = pid && userMap[pid] ? userMap[pid].name : 'TBD';
      if (admin && isFirstRound && m.status !== 'completed') {
        return `<select class="bracket-player-select" data-match="${m.id}" data-slot="${slot}">
          <option value="">— 배정 —</option>
          ${players.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>`;
      }
      const cls = pid === m.winner_id ? 'winner' : pid ? '' : 'tbd';
      return `<div class="slot-player ${cls}">${esc(uname)}${pid === m.winner_id ? ' ✓' : ''}</div>`;
    }

    const cls = m.status === 'completed' ? 'done' : m.status === 'live' ? 'live' : '';
    return `<div class="match-slot ${cls}">
      ${slotHtml(m.player1_id, 1)}
      ${slotHtml(m.player2_id, 2)}
      ${m.score ? `<div style="font-size:10px;text-align:center;color:var(--muted);margin-top:4px">${esc(m.score)}</div>` : ''}
    </div>`;
  }

  /* ===== MATCHES ===== */
  async function renderMatches() {
    await renderTournamentPills('#matchTournamentPills');
    renderEventPills('#matchEventPills');

    const filterHtml = `
      <div class="filter-tabs" id="matchFilters">
        <button class="${matchFilter === 'all' ? 'active' : ''}" data-f="all">전체</button>
        <button class="${matchFilter === 'upcoming' ? 'active' : ''}" data-f="upcoming">예정</button>
        <button class="${matchFilter === 'live' ? 'active' : ''}" data-f="live">진행중</button>
        <button class="${matchFilter === 'completed' ? 'active' : ''}" data-f="completed">완료</button>
      </div>`;
    $('#matchFiltersWrap').innerHTML = filterHtml;
    $('#matchFilters')?.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => { matchFilter = btn.dataset.f; renderApp(); });
    });

    try {
      const matches = await apiGet(`/matches?tournamentId=${selectedTournament}&event=${selectedEvent}${matchFilter !== 'all' ? `&filter=${matchFilter}` : ''}`);

      const users = await apiGet('/users');
      const userMap = {};
      users.forEach(u => userMap[u.id] = u);

      if (!matches.length) {
        $('#matchList').innerHTML = '<div class="empty-state"><p>표시할 경기가 없습니다.</p></div>';
        return;
      }

      $('#matchList').innerHTML = matches.map(m => {
        const p1 = userMap[m.player1_id];
        const p2 = userMap[m.player2_id];
        const roundLabels = ['8강', '4강', '준결승', '결승'];
        return `<div class="match-card ${m.status === 'completed' ? 'completed' : ''}">
          <div class="match-header">
            <span class="chip">${roundLabels[m.round] || `R${m.round + 1}`}</span>
            <span class="chip ${m.status === 'completed' ? 'closed' : m.status === 'live' ? 'live' : ''}">${matchStatusLabel(m.status)}</span>
          </div>
          <div class="match-players">
            <div class="match-player-box"><div class="name">${esc(p1?.name || 'TBD')}</div><div class="dept">${esc(p1?.dept || '')}</div></div>
            <div class="vs">VS</div>
            <div class="match-player-box"><div class="name">${esc(p2?.name || 'TBD')}</div><div class="dept">${esc(p2?.dept || '')}</div></div>
          </div>
          ${m.score ? `<div class="match-score">${esc(m.score)}</div>` : ''}
          <div class="match-meta">
            ${m.scheduled_at ? `<span>🕐 ${esc(m.scheduled_at)}</span>` : ''}
            ${m.court ? `<span>📍 ${esc(m.court)}</span>` : ''}
          </div>
          ${isAdmin() && m.player1_id && m.player2_id && m.status !== 'completed' ? `
            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm schedule-match" data-id="${m.id}">일정 설정</button>
              <button class="btn btn-primary btn-sm result-match" data-id="${m.id}">결과 입력</button>
            </div>` : ''}
        </div>`;
      }).join('');

      $$('.schedule-match').forEach(btn => btn.addEventListener('click', () => openScheduleModal(btn.dataset.id)));
      $$('.result-match').forEach(btn => btn.addEventListener('click', () => openResultModal(btn.dataset.id)));
    } catch {
      $('#matchList').innerHTML = '<div class="empty-state"><p>경기 데이터를 불러올 수 없습니다.</p></div>';
    }
  }

  function matchStatusLabel(s) {
    return { pending: '예정', live: '진행중', completed: '완료' }[s] || s;
  }

  /* ===== LEADERBOARD ===== */
  async function renderLeaderboard() {
    await renderTournamentPills('#lbTournamentPills');
    renderEventPills('#lbEventPills');

    try {
      const standings = await apiGet(`/leaderboard/${selectedTournament}/${selectedEvent}`);
      if (!standings.length) {
        $('#leaderboardContent').innerHTML = '<div class="empty-state"><p>아직 기록된 경기 결과가 없습니다.</p></div>';
        return;
      }
      $('#leaderboardContent').innerHTML = `
        <div class="card" style="padding:0;overflow:hidden">
          <table class="leaderboard-table">
            <thead><tr><th>#</th><th>선수</th><th>승</th><th>패</th><th>승점</th><th>세트</th></tr></thead>
            <tbody>${standings.map((s, i) => {
              const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
              return `<tr>
                <td><span class="rank-badge ${rankCls}">${i + 1}</span></td>
                <td><strong>${esc(s.user.name)}</strong><br><small style="color:var(--muted)">${esc(s.user.dept)}</small></td>
                <td>${s.wins}</td><td>${s.losses}</td><td><strong>${s.points}</strong></td>
                <td>${s.sets_won}-${s.sets_lost}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>`;
    } catch {
      $('#leaderboardContent').innerHTML = '<div class="empty-state"><p>순위 데이터를 불러올 수 없습니다.</p></div>';
    }
  }

  /* ===== ANNOUNCEMENTS ===== */
  async function renderAnnouncements() {
    $('#announceActions').innerHTML = isAdmin()
      ? '<button class="btn btn-primary btn-sm" id="newAnnounce">+ 공지 작성</button>'
      : '';
    $('#newAnnounce')?.addEventListener('click', () => openAnnounceModal());

    try {
      const items = await apiGet('/announcements');
      if (!items.length) {
        $('#announceList').innerHTML = '<div class="empty-state"><p>등록된 공지가 없습니다.</p></div>';
        return;
      }
      $('#announceList').innerHTML = items.map(a => {
        const d = new Date(a.created_at);
        return `<article class="announce-item" data-id="${a.id}">
          <h4>${esc(a.title)}</h4>
          <p>${esc(a.body.slice(0, 120))}${a.body.length > 120 ? '…' : ''}</p>
          <div class="announce-meta">${esc(a.author_name || '운영팀')} · ${formatDate(d)}</div>
        </article>`;
      }).join('');

      $$('.announce-item').forEach(el => {
        el.addEventListener('click', () => {
          const a = items.find(x => x.id === el.dataset.id);
          if (a) openAnnounceDetail(a);
        });
      });
    } catch {
      $('#announceList').innerHTML = '<div class="empty-state"><p>공지사항을 불러올 수 없습니다.</p></div>';
    }
  }

  /* ===== PROFILE ===== */
  async function renderProfile() {
    const user = currentUser;
    let myMatches = [];
    try { myMatches = await apiGet('/matches/my'); } catch {}

    $('#profileContent').innerHTML = `
      <div class="profile-header">
        <div class="profile-avatar">${initials(user.name)}</div>
        <div>
          <h3>${esc(user.name)}</h3>
          <p>${esc(user.dept)} · ${esc(user.level)} · ${user.role === 'admin' ? '관리자' : '선수'}</p>
        </div>
      </div>
      <div class="profile-section">
        <h4>계정 정보</h4>
        <div class="card">
          <div class="field"><label>이메일</label><input type="email" id="profEmail" value="${esc(user.email)}" readonly style="background:var(--paper)"></div>
          <div class="row2">
            <div class="field"><label>이름</label><input type="text" id="profName" value="${esc(user.name)}"></div>
            <div class="field"><label>부서</label><input type="text" id="profDept" value="${esc(user.dept)}"></div>
          </div>
          <div class="row2">
            <div class="field"><label>실력 등급</label>
              <select id="profLevel">${LEVELS.map(l => `<option value="${l}" ${l === user.level ? 'selected' : ''}>${l}</option>`).join('')}</select>
            </div>
            <div class="field"><label>연락처</label><input type="text" id="profPhone" value="${esc(user.phone || '')}" placeholder="선택"></div>
          </div>
          <button class="btn btn-primary" id="saveProfile">프로필 저장</button>
        </div>
      </div>
      <div class="profile-section">
        <h4>경기 기록 (${myMatches.length}경기)</h4>
      </div>
      <button class="btn btn-ghost" id="logoutBtn" style="width:100%;margin-top:8px;color:var(--red)">로그아웃</button>
    `;

    $('#saveProfile')?.addEventListener('click', async () => {
      try {
        await apiPut('/profile', {
          name: $('#profName').value.trim(),
          dept: $('#profDept').value.trim(),
          level: $('#profLevel').value,
          phone: $('#profPhone').value.trim(),
        });
        currentUser.name = $('#profName').value.trim();
        currentUser.dept = $('#profDept').value.trim();
        currentUser.level = $('#profLevel').value;
        currentUser.phone = $('#profPhone').value.trim();
        toast('프로필이 저장되었습니다.');
      } catch (e) { toast(e.message); }
    });

    $('#logoutBtn')?.addEventListener('click', logout);
  }

  /* ===== PLAYERS (admin) ===== */
  async function renderPlayers() {
    try {
      const players = await apiGet('/players');

      const searchHtml = `
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <input type="text" id="playerSearch" placeholder="이름, 부서 검색..." style="flex:1;min-width:140px;padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:14px">
          <select id="playerGenderFilter" style="padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:14px">
            <option value="">전체 성별</option>
            <option value="M">남성</option>
            <option value="F">여성</option>
          </select>
          <select id="playerLevelFilter" style="padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:14px">
            <option value="">전체 등급</option>
            ${LEVELS.map(l => `<option value="${l}">${l}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-size:13px;color:var(--muted)">총 <strong>${players.length}</strong>명</span>
        </div>`;
      $('#playerSearchWrap').innerHTML = searchHtml;

      function filterPlayers() {
        const q = ($('#playerSearch')?.value || '').trim().toLowerCase();
        const g = $('#playerGenderFilter')?.value || '';
        const l = $('#playerLevelFilter')?.value || '';
        return players.filter(p => {
          if (g && p.gender !== g) return false;
          if (l && p.level !== l) return false;
          if (q && !p.name.toLowerCase().includes(q) && !p.dept.toLowerCase().includes(q)) return false;
          return true;
        });
      }

      function renderPlayerList() {
        const filtered = filterPlayers();
        if (!filtered.length) {
          $('#playerList').innerHTML = '<div class="empty-state"><p>검색 결과가 없습니다.</p></div>';
          return;
        }
        $('#playerList').innerHTML = filtered.map(p => `
          <div class="card" style="padding:14px 16px">
            <div style="display:flex;align-items:center;gap:12px">
              <div class="avatar">${initials(p.name)}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:14px">${esc(p.name)}</div>
                <div style="font-size:12px;color:var(--muted)">${esc(p.dept)} · ${genderLabel(p.gender)} · ${esc(p.level)}</div>
              </div>
              <button class="btn btn-ghost btn-sm edit-player" data-id="${p.id}" style="flex-shrink:0">편집</button>
            </div>
          </div>
        `).join('');

        $$('.edit-player').forEach(btn => {
          btn.addEventListener('click', () => openPlayerEditModal(btn.dataset.id));
        });
      }

      renderPlayerList();
      $('#playerSearch')?.addEventListener('input', renderPlayerList);
      $('#playerGenderFilter')?.addEventListener('change', renderPlayerList);
      $('#playerLevelFilter')?.addEventListener('change', renderPlayerList);
    } catch {
      $('#playerSearchWrap').innerHTML = '';
      $('#playerList').innerHTML = '<div class="empty-state"><p>선수 데이터를 불러올 수 없습니다.</p></div>';
    }
  }

  function genderLabel(g) {
    return g === 'M' ? '남성' : g === 'F' ? '여성' : '-';
  }

  /* ===== MODALS ===== */
  function openModal(title, bodyHtml, onSubmit) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    $('#modalOverlay').classList.add('show');
    const form = $('#modalForm');
    form.onsubmit = e => {
      e.preventDefault();
      onSubmit(new FormData(form));
    };
  }

  function closeModal() {
    $('#modalOverlay').classList.remove('show');
    $('#modalSubmit').classList.remove('hidden');
    $('#modalSubmit').textContent = '저장';
  }

  function openTournamentModal(t) {
    openModal(t ? '대회 수정' : '새 대회 만들기', `
      <div class="field"><label>대회명</label><input name="name" required value="${t ? esc(t.name) : ''}" placeholder="주반석 탁구대회 2026"></div>
      <div class="row2">
        <div class="field"><label>날짜</label><input type="date" name="date" required value="${t?.date || '2026-08-02'}"></div>
        <div class="field"><label>상태</label><select name="status"><option value="open" ${t?.status === 'open' ? 'selected' : ''}>모집중</option><option value="live" ${t?.status === 'live' ? 'selected' : ''}>진행중</option><option value="closed" ${t?.status === 'closed' ? 'selected' : ''}>종료</option></select></div>
      </div>
      <div class="field"><label>장소</label><input name="location" required value="${t ? esc(t.location) : '주반석 사내체육관'}"></div>
      <div class="field"><label>설명</label><textarea name="description" rows="3">${t ? esc(t.description || '') : ''}</textarea></div>
    `, async fd => {
      const data = Object.fromEntries(fd);
      try {
        if (t) {
          await apiPut(`/tournaments/${t.id}`, data);
        } else {
          await apiPost('/tournaments', data);
        }
        closeModal();
        toast(t ? '대회 정보가 수정되었습니다.' : '새 대회가 생성되었습니다.');
        renderApp();
      } catch (e) { toast(e.message); }
    });
  }

  function openScheduleModal(matchId) {
    openModal('경기 일정 설정', `
      <div class="row2">
        <div class="field"><label>시간</label><input name="scheduledAt" value="" placeholder="예: 09:30"></div>
        <div class="field"><label>코트</label><input name="court" value="" placeholder="예: 코트 3"></div>
      </div>
    `, async fd => {
      const data = Object.fromEntries(fd);
      try {
        await apiPut(`/matches/${matchId}/schedule`, data);
        closeModal();
        toast('경기 일정이 설정되었습니다.');
        renderApp();
      } catch (e) { toast(e.message); }
    });
  }

  async function openResultModal(matchId) {
    const allMatches = await apiGet('/matches').catch(() => []);
    const match = allMatches.find(m => m.id === matchId);
    const users = await apiGet('/users').catch(() => []);
    const userMap = {};
    users.forEach(u => userMap[u.id] = u);
    const p1 = match ? userMap[match.player1_id] : null;
    const p2 = match ? userMap[match.player2_id] : null;
    const p1Name = p1 ? p1.name : 'TBD';
    const p2Name = p2 ? p2.name : 'TBD';
    const p1Id = match ? match.player1_id : '';
    const p2Id = match ? match.player2_id : '';

    openModal('경기 결과 입력', `
      <p style="font-size:14px;margin:0 0 16px">${esc(p1Name)} vs ${esc(p2Name)}</p>
      <div class="field"><label>스코어 (예: 3-1)</label><input name="score" required value="" placeholder="3-1"></div>
      <div class="field"><label>승자</label>
        <select name="winnerId" required>
          <option value="">선택</option>
          <option value="${esc(p1Id)}">${esc(p1Name)}</option>
          <option value="${esc(p2Id)}">${esc(p2Name)}</option>
        </select>
      </div>
    `, async fd => {
      const data = Object.fromEntries(fd);
      try {
        await apiPut(`/matches/${matchId}/result`, data);
        closeModal();
        toast('경기 결과가 반영되었습니다.');
        renderApp();
      } catch (e) { toast(e.message); }
    });
  }

  function openAnnounceModal() {
    openModal('공지 작성', `
      <div class="field"><label>제목</label><input name="title" required placeholder="공지 제목"></div>
      <div class="field"><label>내용</label><textarea name="body" required rows="5" placeholder="공지 내용을 입력하세요"></textarea></div>
    `, async fd => {
      const data = Object.fromEntries(fd);
      try {
        await apiPost('/announcements', data);
        closeModal();
        toast('공지가 등록되었습니다.');
        renderApp();
      } catch (e) { toast(e.message); }
    });
  }

  function openAnnounceDetail(a) {
    openModal(a.title, `
      <p style="font-size:14px;line-height:1.7;color:var(--ink-2);white-space:pre-wrap">${esc(a.body)}</p>
      <div class="announce-meta">${esc(a.author_name || '운영팀')} · ${formatDate(new Date(a.created_at))}</div>
    `, () => { closeModal(); });
    $('#modalSubmit').classList.add('hidden');
  }

  async function openNotifPanel() {
    try {
      const notifs = await apiGet('/notifications');
      openModal('알림', notifs.length ? notifs.map(n => `
        <div style="padding:10px 0;border-bottom:1px solid var(--line-soft);font-size:13px;${n.read ? 'opacity:.6' : ''}">
          ${esc(n.message)}<br><small style="color:var(--muted)">${formatDate(new Date(n.created_at))}</small>
        </div>
      `).join('') : '<p style="color:var(--muted);font-size:14px">알림이 없습니다.</p>', async () => {
        try {
          await apiPut('/notifications/read-all');
        } catch {}
        closeModal();
        renderApp();
      });
      $('#modalSubmit').textContent = '모두 읽음';
      $('#modalSubmit').classList.remove('hidden');
    } catch {}
  }

  function openPlayerEditModal(playerId) {
    const p = null;
    openModal('선수 정보 수정', `
      <div class="row2">
        <div class="field"><label>이름</label><input name="name" required value=""></div>
        <div class="field"><label>부서</label><input name="dept" required value=""></div>
      </div>
      <div class="row2">
        <div class="field"><label>성별</label>
          <select name="gender">
            <option value="M">남성</option>
            <option value="F">여성</option>
          </select>
        </div>
        <div class="field"><label>실력 등급</label>
          <select name="level">${LEVELS.map(l => `<option value="${l}">${l}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field"><label>비밀번호</label><input name="password" type="text" value="" placeholder="변경하지 않으면 비워둠"></div>
    `, async fd => {
      const data = Object.fromEntries(fd);
      try {
        await apiPut(`/players/${playerId}`, data);
        closeModal();
        toast('선수 정보가 수정되었습니다.');
        renderApp();
      } catch (e) { toast(e.message); }
    });
  }

  /* ===== UTILS ===== */
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initials(name) {
    return name ? name.slice(0, 1) : '?';
  }

  function formatDate(d) {
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /* ===== INIT ===== */
  async function init() {
    $$('.auth-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        state.authMode = btn.dataset.mode;
        renderAuthForm();
      });
    });

    $('#authForm').addEventListener('submit', async e => {
      e.preventDefault();
      const alertEl = $('#authAlert');
      alertEl.classList.add('hidden');

      if (state.authMode === 'forgot') {
        alertEl.textContent = '데모: 재설정 링크가 발송되었습니다. (실제 발송 없음)';
        alertEl.className = 'alert alert-success';
        alertEl.classList.remove('hidden');
        return;
      }

      const fd = new FormData(e.target);
      if (state.authMode === 'login') {
        if (await login(fd.get('email'), fd.get('password'))) {
          showApp();
          toast(`환영합니다, ${currentUser.name}님!`);
        } else {
          alertEl.textContent = '이메일 또는 비밀번호가 올바르지 않습니다.';
          alertEl.className = 'alert alert-error';
          alertEl.classList.remove('hidden');
        }
      } else {
        const result = await register(e.target);
        if (result.ok) {
          showApp();
          toast('가입이 완료되었습니다!');
        } else {
          alertEl.textContent = result.msg;
          alertEl.className = 'alert alert-error';
          alertEl.classList.remove('hidden');
        }
      }
    });

    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab;
        renderApp();
      });
    });

    $('#notifBtn').addEventListener('click', openNotifPanel);
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalOverlay').addEventListener('click', e => { if (e.target.id === 'modalOverlay') closeModal(); });

    renderAuthForm();
    if (TOKEN) {
      try {
        currentUser = await apiGet('/auth/me');
        showApp();
      } catch {
        showAuth();
      }
    } else {
      showAuth();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
