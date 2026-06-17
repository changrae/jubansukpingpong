(function () {
  'use strict';

  const STORAGE_KEY = 'tt_tournament_manager_v1';
  const EVENTS = ['남자단식', '여자단식', '남자복식', '여자복식', '혼성복식'];
  const LEVELS = ['입문', '초급', '중급', '상급', '동호회'];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return seedData();
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  }

  function seedData() {
    const adminId = uid();
    const p1 = uid(), p2 = uid(), p3 = uid(), p4 = uid();
    const tId = uid();
    const data = {
      users: [
        {
          id: adminId, email: 'admin@jubansek.kr', password: 'admin123',
          name: '운영관리자', dept: '단합위원회', gender: 'M', level: '동호회',
          role: 'admin', phone: '0420', createdAt: Date.now()
        },
        {
          id: p1, email: '20260001@jubansek.kr', password: 'player123',
          name: '김탁구', dept: '생산1팀', gender: 'M', level: '중급',
          role: 'player', phone: '', createdAt: Date.now()
        },
        {
          id: p2, email: '20260002@jubansek.kr', password: 'player123',
          name: '이서브', dept: '영업팀', gender: 'F', level: '상급',
          role: 'player', phone: '', createdAt: Date.now()
        },
        {
          id: p3, email: '20260003@jubansek.kr', password: 'player123',
          name: '박스매시', dept: '기획팀', gender: 'M', level: '초급',
          role: 'player', phone: '', createdAt: Date.now()
        },
        {
          id: p4, email: '20260004@jubansek.kr', password: 'player123',
          name: '최탑스핀', dept: '품질팀', gender: 'F', level: '중급',
          role: 'player', phone: '', createdAt: Date.now()
        }
      ],
      session: null,
      tournaments: [{
        id: tId,
        name: '주반석 단합 탁구대회 2026',
        date: '2026-08-02',
        location: '주반석 사내체육관',
        status: 'open',
        description: '5개 종목 결승 탁구대회 — 350명, 489경기',
        participantIds: [p1, p2, p3, p4],
        createdAt: Date.now()
      }],
      brackets: {},
      announcements: [{
        id: uid(),
        title: '선수단 모집 안내',
        body: 'D-21(7/12)까지 선수단 신청을 마감합니다. 1인 1종목 원칙이며, 복식은 파트너 정보를 함께 입력해 주세요.',
        authorId: adminId,
        createdAt: Date.now() - 86400000 * 3
      }],
      notifications: []
    };

    EVENTS.forEach(ev => {
      data.brackets[`${tId}_${ev}`] = createEmptyBracket(8);
    });

    const bKey = `${tId}_남자단식`;
    const bracket = data.brackets[bKey];
    assignPlayer(bracket, 0, 0, p1);
    assignPlayer(bracket, 0, 1, p2);
    assignPlayer(bracket, 0, 2, p3);
    assignPlayer(bracket, 0, 3, p4);

    bracket.matches[0].score = '3-1';
    bracket.matches[0].winnerId = p1;
    bracket.matches[1].score = '3-2';
    bracket.matches[1].winnerId = p3;
    advanceWinner(bracket, bracket.matches[0]);
    advanceWinner(bracket, bracket.matches[1]);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  }

  function createEmptyBracket(size) {
    const rounds = Math.log2(size);
    const matches = [];
    let matchIdx = 0;
    const roundStarts = [];
    for (let r = 0; r < rounds; r++) {
      roundStarts.push(matchIdx);
      const count = size / Math.pow(2, r + 1);
      for (let m = 0; m < count; m++) {
        matches.push({
          id: uid(), round: r, matchInRound: m,
          player1Id: null, player2Id: null, winnerId: null,
          score: '', scheduledAt: '', court: '', status: 'pending'
        });
        matchIdx++;
      }
    }
    return { size, matches, roundStarts };
  }

  function getBracketKey(tournamentId, event) {
    return `${tournamentId}_${event}`;
  }

  function getBracket(tournamentId, event) {
    const key = getBracketKey(tournamentId, event);
    if (!state.data.brackets[key]) {
      state.data.brackets[key] = createEmptyBracket(8);
      saveData();
    }
    return state.data.brackets[key];
  }

  function assignPlayer(bracket, round, matchInRound, playerId, slot) {
    const match = bracket.matches.find(m => m.round === round && m.matchInRound === matchInRound);
    if (!match) return;
    if (slot === 2 || (slot === undefined && !match.player1Id)) {
      if (slot === 2) match.player2Id = playerId;
      else if (!match.player1Id) match.player1Id = playerId;
      else match.player2Id = playerId;
    } else {
      match.player1Id = playerId;
    }
  }

  function getNextMatch(bracket, match) {
    const nextRound = match.round + 1;
    const nextMatchInRound = Math.floor(match.matchInRound / 2);
    return bracket.matches.find(m => m.round === nextRound && m.matchInRound === nextMatchInRound);
  }

  function advanceWinner(bracket, match) {
    if (!match.winnerId) return;
    const next = getNextMatch(bracket, match);
    if (!next) return;
    if (match.matchInRound % 2 === 0) next.player1Id = match.winnerId;
    else next.player2Id = match.winnerId;
  }

  function getUser(id) {
    return state.data.users.find(u => u.id === id);
  }

  function getUserName(id) {
    if (!id) return 'TBD';
    const u = getUser(id);
    return u ? u.name : '알 수 없음';
  }

  function isAdmin() {
    const u = getCurrentUser();
    return u && u.role === 'admin';
  }

  function getCurrentUser() {
    if (!state.data.session) return null;
    return getUser(state.data.session.userId);
  }

  function notifyAll(message, type = 'info') {
    state.data.users.forEach(u => {
      state.data.notifications.unshift({
        id: uid(), userId: u.id, message, type, read: false, createdAt: Date.now()
      });
    });
    saveData();
  }

  function notifyUser(userId, message, type = 'info') {
    state.data.notifications.unshift({
      id: uid(), userId, message, type, read: false, createdAt: Date.now()
    });
    saveData();
  }

  function getUnreadCount(userId) {
    return state.data.notifications.filter(n => n.userId === userId && !n.read).length;
  }

  function computeStandings(tournamentId, event) {
    const bracket = getBracket(tournamentId, event);
    const stats = {};
    bracket.matches.forEach(m => {
      if (!m.winnerId || m.status !== 'completed') return;
      const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
      [m.winnerId, loserId].forEach((pid, i) => {
        if (!pid) return;
        if (!stats[pid]) stats[pid] = { wins: 0, losses: 0, points: 0, setsWon: 0, setsLost: 0 };
        if (i === 0) { stats[pid].wins++; stats[pid].points += 3; }
        else { stats[pid].losses++; }
        const parts = (m.score || '0-0').split('-').map(Number);
        if (parts.length === 2) {
          if (pid === m.winnerId) { stats[pid].setsWon += parts[0]; stats[pid].setsLost += parts[1]; }
          else { stats[pid].setsWon += parts[1]; stats[pid].setsLost += parts[0]; }
        }
      });
    });
    return Object.entries(stats)
      .map(([id, s]) => ({ id, ...s, user: getUser(id) }))
      .filter(r => r.user)
      .sort((a, b) => b.points - a.points || b.wins - a.wins || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost));
  }

  const state = {
    data: loadData(),
    view: 'auth',
    tab: 'dashboard',
    selectedTournament: null,
    selectedEvent: EVENTS[0],
    matchFilter: 'all',
    authMode: 'login'
  };

  if (state.data.tournaments.length) {
    state.selectedTournament = state.data.tournaments[0].id;
  }

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
    state.view = 'auth';
    $('#authScreen').classList.remove('hidden');
    $('#appShell').classList.add('hidden');
    renderAuthForm();
  }

  function showApp() {
    state.view = 'app';
    $('#authScreen').classList.add('hidden');
    $('#appShell').classList.remove('hidden');
    renderApp();
  }

  function login(email, password) {
    const user = state.data.users.find(u => u.email === email && u.password === password);
    if (!user) return false;
    state.data.session = { userId: user.id };
    saveData();
    return true;
  }

  function register(form) {
    const email = form.email.value.trim();
    if (state.data.users.some(u => u.email === email)) {
      return { ok: false, msg: '이미 등록된 이메일입니다.' };
    }
    const user = {
      id: uid(),
      email,
      password: form.password.value,
      name: form.name.value.trim(),
      dept: form.dept.value.trim(),
      gender: form.gender.value,
      level: form.level.value,
      role: 'player',
      phone: form.phone?.value?.trim() || '',
      createdAt: Date.now()
    };
    state.data.users.push(user);
    state.data.session = { userId: user.id };
    saveData();
    notifyAll(`${user.name}님이 대회 앱에 가입했습니다.`);
    return { ok: true };
  }

  function logout() {
    state.data.session = null;
    saveData();
    showAuth();
    toast('로그아웃되었습니다.');
  }

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

  /* ===== RENDER APP ===== */
  function renderApp() {
    const user = getCurrentUser();
    if (!user) { showAuth(); return; }

    $('#headerTitle').textContent = getTabTitle(state.tab);
    $('#adminBadge').classList.toggle('hidden', !isAdmin());

    const unread = getUnreadCount(user.id);
    const badge = $('#notifBadge');
    if (unread > 0) { badge.textContent = unread > 9 ? '9+' : unread; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');

    $$('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === state.tab);
      if (btn.dataset.tab === 'players') {
        btn.classList.toggle('hidden', !isAdmin());
      }
    });
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${state.tab}`));

    switch (state.tab) {
      case 'dashboard': renderDashboard(); break;
      case 'brackets': renderBrackets(); break;
      case 'matches': renderMatches(); break;
      case 'leaderboard': renderLeaderboard(); break;
      case 'announcements': renderAnnouncements(); break;
      case 'players': renderPlayers(); break;
      case 'profile': renderProfile(); break;
    }
  }

  function getTabTitle(tab) {
    const titles = { dashboard: '대시보드', brackets: '대진표', matches: '경기', leaderboard: '순위', announcements: '공지', players: '선수단', profile: '프로필' };
    return titles[tab] || '탁구대회';
  }

  function renderTournamentPills(containerId, onChange) {
    const el = $(containerId);
    el.innerHTML = state.data.tournaments.map(t => `
      <button class="tournament-pill ${t.id === state.selectedTournament ? 'active' : ''}" data-id="${t.id}">${t.name}</button>
    `).join('');
    el.querySelectorAll('.tournament-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedTournament = btn.dataset.id;
        onChange?.();
        renderApp();
      });
    });
  }

  function renderEventPills(containerId) {
    const el = $(containerId);
    el.innerHTML = `<div class="filter-tabs" style="margin:0">${EVENTS.map(ev => `
      <button class="${ev === state.selectedEvent ? 'active' : ''}" data-ev="${ev}">${ev}</button>
    `).join('')}</div>`;
    el.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedEvent = btn.dataset.ev;
        renderApp();
      });
    });
  }

  /* ===== DASHBOARD ===== */
  function renderDashboard() {
    const user = getCurrentUser();
    const t = state.data.tournaments.find(x => x.id === state.selectedTournament);

    const totalPlayers = state.data.users.filter(u => u.role === 'player').length;
    const myTournaments = state.data.tournaments.filter(t => t.participantIds.includes(user.id));
    const upcomingMatches = getAllMatches().filter(m => m.status !== 'completed' && (m.player1Id === user.id || m.player2Id === user.id)).length;

    $('#dashStats').innerHTML = `
      <div class="stat-box"><div class="num">${state.data.tournaments.length}</div><div class="lbl">대회</div></div>
      <div class="stat-box"><div class="num">${totalPlayers}</div><div class="lbl">선수</div></div>
      <div class="stat-box"><div class="num">${upcomingMatches}</div><div class="lbl">내 경기</div></div>
    `;

    renderTournamentPills('#dashTournamentPills');

    if (!t) {
      $('#dashContent').innerHTML = '<div class="empty-state"><p>등록된 대회가 없습니다.</p></div>';
      return;
    }

    const isJoined = t.participantIds.includes(user.id);
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

      <p class="section-title">참가 선수 (${t.participantIds.length}명)</p>
      <div class="card" style="padding:14px 18px">
        <ul class="player-list">${t.participantIds.length ? t.participantIds.map(pid => {
          const p = getUser(pid);
          if (!p) return '';
          return `<li class="player-item">
            <div class="avatar">${initials(p.name)}</div>
            <div class="player-info"><div class="name">${esc(p.name)}</div><div class="sub">${esc(p.dept)} · ${esc(p.level)}</div></div>
          </li>`;
        }).join('') : '<li style="color:var(--muted);font-size:13px">아직 참가자가 없습니다.</li>'}</ul>
      </div>

      ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="createTournament" style="margin-top:8px">+ 새 대회 만들기</button>` : ''}
    `;

    $('#joinTournament')?.addEventListener('click', () => {
      t.participantIds.push(user.id);
      saveData();
      notifyUser(user.id, `${t.name} 참가 신청이 완료되었습니다.`);
      toast('대회 참가 신청 완료!');
      renderApp();
    });

    $('#createTournament')?.addEventListener('click', () => openTournamentModal());
    $('#editTournament')?.addEventListener('click', () => openTournamentModal(t));
  }

  /* ===== BRACKETS ===== */
  function renderBrackets() {
    renderTournamentPills('#bracketTournamentPills');
    renderEventPills('#bracketEventPills');

    const bracket = getBracket(state.selectedTournament, state.selectedEvent);
    const rounds = Math.log2(bracket.size);

    let html = '<div class="bracket-wrap"><div class="bracket">';
    for (let r = 0; r < rounds; r++) {
      const roundMatches = bracket.matches.filter(m => m.round === r);
      const labels = ['8강', '4강', '준결승', '결승'];
      html += `<div class="bracket-round">
        <div class="round-label">${labels[r] || `R${r + 1}`}</div>
        ${roundMatches.map(m => renderBracketMatch(m, r)).join('')}
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
        sel.addEventListener('change', e => {
          const matchId = sel.dataset.match;
          const slot = parseInt(sel.dataset.slot);
          const match = bracket.matches.find(m => m.id === matchId);
          if (match) {
            if (slot === 1) match.player1Id = sel.value || null;
            else match.player2Id = sel.value || null;
          }
        });
      });
      $('#resetBracket')?.addEventListener('click', () => {
        if (confirm('대진표를 초기화하시겠습니까?')) {
          state.data.brackets[getBracketKey(state.selectedTournament, state.selectedEvent)] = createEmptyBracket(8);
          saveData();
          toast('대진표가 초기화되었습니다.');
          renderApp();
        }
      });
      $('#saveBracket')?.addEventListener('click', () => {
        saveData();
        toast('대진표 배정이 저장되었습니다.');
      });
    }
  }

  function renderBracketMatch(m, round) {
    const admin = isAdmin();
    const t = state.data.tournaments.find(x => x.id === state.selectedTournament);
    const players = (t?.participantIds || []).map(id => getUser(id)).filter(Boolean);

    function slotHtml(pid, slot) {
      if (admin && round === 0 && m.status !== 'completed') {
        return `<select class="bracket-player-select" data-match="${m.id}" data-slot="${slot}">
          <option value="">— 배정 —</option>
          ${players.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>`;
      }
      const cls = pid === m.winnerId ? 'winner' : pid ? '' : 'tbd';
      return `<div class="slot-player ${cls}">${esc(getUserName(pid))}${pid === m.winnerId ? ' ✓' : ''}</div>`;
    }

    const cls = m.status === 'completed' ? 'done' : m.status === 'live' ? 'live' : '';
    return `<div class="match-slot ${cls}">
      ${slotHtml(m.player1Id, 1)}
      ${slotHtml(m.player2Id, 2)}
      ${m.score ? `<div style="font-size:10px;text-align:center;color:var(--muted);margin-top:4px">${esc(m.score)}</div>` : ''}
    </div>`;
  }

  /* ===== MATCHES ===== */
  function getAllMatches() {
    const results = [];
    state.data.tournaments.forEach(t => {
      EVENTS.forEach(ev => {
        const bracket = getBracket(t.id, ev);
        bracket.matches.forEach(m => {
          if (m.player1Id || m.player2Id) {
            results.push({ ...m, tournamentId: t.id, tournamentName: t.name, event: ev });
          }
        });
      });
    });
    return results;
  }

  function renderMatches() {
    renderTournamentPills('#matchTournamentPills');
    renderEventPills('#matchEventPills');

    const filterHtml = `
      <div class="filter-tabs" id="matchFilters">
        <button class="${state.matchFilter === 'all' ? 'active' : ''}" data-f="all">전체</button>
        <button class="${state.matchFilter === 'upcoming' ? 'active' : ''}" data-f="upcoming">예정</button>
        <button class="${state.matchFilter === 'live' ? 'active' : ''}" data-f="live">진행중</button>
        <button class="${state.matchFilter === 'completed' ? 'active' : ''}" data-f="completed">완료</button>
      </div>`;
    $('#matchFiltersWrap').innerHTML = filterHtml;
    $('#matchFilters')?.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => { state.matchFilter = btn.dataset.f; renderApp(); });
    });

    let matches = getAllMatches().filter(m =>
      m.tournamentId === state.selectedTournament && m.event === state.selectedEvent
    );

    if (state.matchFilter === 'upcoming') matches = matches.filter(m => m.status === 'pending' && m.player1Id && m.player2Id);
    else if (state.matchFilter === 'live') matches = matches.filter(m => m.status === 'live');
    else if (state.matchFilter === 'completed') matches = matches.filter(m => m.status === 'completed');

    matches.sort((a, b) => a.round - b.round || a.matchInRound - b.matchInRound);

    if (!matches.length) {
      $('#matchList').innerHTML = '<div class="empty-state"><p>표시할 경기가 없습니다.</p></div>';
      return;
    }

    $('#matchList').innerHTML = matches.map(m => {
      const p1 = getUser(m.player1Id);
      const p2 = getUser(m.player2Id);
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
          ${m.scheduledAt ? `<span>🕐 ${esc(m.scheduledAt)}</span>` : ''}
          ${m.court ? `<span>📍 ${esc(m.court)}</span>` : ''}
        </div>
        ${isAdmin() && m.player1Id && m.player2Id && m.status !== 'completed' ? `
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm schedule-match" data-id="${m.id}">일정 설정</button>
            <button class="btn btn-primary btn-sm result-match" data-id="${m.id}">결과 입력</button>
          </div>` : ''}
      </div>`;
    }).join('');

    $$('.schedule-match').forEach(btn => btn.addEventListener('click', () => openScheduleModal(btn.dataset.id)));
    $$('.result-match').forEach(btn => btn.addEventListener('click', () => openResultModal(btn.dataset.id)));
  }

  function matchStatusLabel(s) {
    return { pending: '예정', live: '진행중', completed: '완료' }[s] || s;
  }

  /* ===== LEADERBOARD ===== */
  function renderLeaderboard() {
    renderTournamentPills('#lbTournamentPills');
    renderEventPills('#lbEventPills');

    const standings = computeStandings(state.selectedTournament, state.selectedEvent);

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
              <td>${s.setsWon}-${s.setsLost}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  /* ===== ANNOUNCEMENTS ===== */
  function renderAnnouncements() {
    const user = getCurrentUser();
    const items = [...state.data.announcements].sort((a, b) => b.createdAt - a.createdAt);

    $('#announceActions').innerHTML = isAdmin()
      ? '<button class="btn btn-primary btn-sm" id="newAnnounce">+ 공지 작성</button>'
      : '';

    $('#newAnnounce')?.addEventListener('click', () => openAnnounceModal());

    if (!items.length) {
      $('#announceList').innerHTML = '<div class="empty-state"><p>등록된 공지가 없습니다.</p></div>';
      return;
    }

    $('#announceList').innerHTML = items.map(a => {
      const author = getUser(a.authorId);
      const d = new Date(a.createdAt);
      return `<article class="announce-item" data-id="${a.id}">
        <h4>${esc(a.title)}</h4>
        <p>${esc(a.body.slice(0, 120))}${a.body.length > 120 ? '…' : ''}</p>
        <div class="announce-meta">${esc(author?.name || '운영팀')} · ${formatDate(d)}</div>
      </article>`;
    }).join('');

    $$('.announce-item').forEach(el => {
      el.addEventListener('click', () => {
        const a = state.data.announcements.find(x => x.id === el.dataset.id);
        if (a) openAnnounceDetail(a);
      });
    });
  }

  /* ===== PROFILE ===== */
  function renderProfile() {
    const user = getCurrentUser();
    const myMatches = getAllMatches().filter(m =>
      (m.player1Id === user.id || m.player2Id === user.id) && m.status === 'completed'
    );

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
        <h4>대회 참가 (${state.data.tournaments.filter(t => t.participantIds.includes(user.id)).length})</h4>
        <div class="card">${state.data.tournaments.filter(t => t.participantIds.includes(user.id)).map(t =>
          `<div style="padding:8px 0;border-top:1px solid var(--line-soft);font-size:14px"><strong>${esc(t.name)}</strong><br><small style="color:var(--muted)">${esc(t.date)}</small></div>`
        ).join('') || '<p style="margin:0;color:var(--muted);font-size:13px">참가 중인 대회가 없습니다.</p>'}</div>
      </div>
      <div class="profile-section">
        <h4>경기 기록 (${myMatches.length}경기)</h4>
      </div>
      <button class="btn btn-ghost" id="logoutBtn" style="width:100%;margin-top:8px;color:var(--red)">로그아웃</button>
    `;

    $('#saveProfile')?.addEventListener('click', () => {
      user.name = $('#profName').value.trim();
      user.dept = $('#profDept').value.trim();
      user.level = $('#profLevel').value;
      user.phone = $('#profPhone').value.trim();
      saveData();
      toast('프로필이 저장되었습니다.');
      renderApp();
    });

    $('#logoutBtn')?.addEventListener('click', logout);
  }

  /* ===== PLAYERS (admin) ===== */
  function renderPlayers() {
    const players = state.data.users.filter(u => u.role === 'player');

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
      $('#playerList').innerHTML = filtered.map(p => {
        const joinedTournaments = state.data.tournaments.filter(t => t.participantIds.includes(p.id));
        return `<div class="card" style="padding:14px 16px">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="avatar">${initials(p.name)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:14px">${esc(p.name)}</div>
              <div style="font-size:12px;color:var(--muted)">${esc(p.dept)} · ${genderLabel(p.gender)} · ${esc(p.level)}${p.phone ? ' · ' + esc(p.phone) : ''}</div>
            </div>
            <button class="btn btn-ghost btn-sm edit-player" data-id="${p.id}" style="flex-shrink:0">편집</button>
          </div>
          ${joinedTournaments.length ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line-soft);font-size:12px;color:var(--muted);display:flex;gap:6px;flex-wrap:wrap">참가: ${joinedTournaments.map(t => `<span class="chip">${esc(t.name)}</span>`).join('')}</div>` : ''}
        </div>`;
      }).join('');

      $$('.edit-player').forEach(btn => {
        btn.addEventListener('click', () => openPlayerEditModal(btn.dataset.id));
      });
    }

    renderPlayerList();

    $('#playerSearch')?.addEventListener('input', renderPlayerList);
    $('#playerGenderFilter')?.addEventListener('change', renderPlayerList);
    $('#playerLevelFilter')?.addEventListener('change', renderPlayerList);
  }

  function genderLabel(g) {
    return g === 'M' ? '남성' : g === 'F' ? '여성' : '-';
  }

  function openPlayerEditModal(playerId) {
    const p = getUser(playerId);
    if (!p) return;
    openModal('선수 정보 수정', `
      <div class="row2">
        <div class="field"><label>이름</label><input name="name" required value="${esc(p.name)}"></div>
        <div class="field"><label>부서</label><input name="dept" required value="${esc(p.dept)}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>성별</label>
          <select name="gender">
            <option value="M" ${p.gender === 'M' ? 'selected' : ''}>남성</option>
            <option value="F" ${p.gender === 'F' ? 'selected' : ''}>여성</option>
          </select>
        </div>
        <div class="field"><label>실력 등급</label>
          <select name="level">${LEVELS.map(l => `<option value="${l}" ${l === p.level ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
      </div>
      <div class="row2">
        <div class="field"><label>연락처</label><input name="phone" value="${esc(p.phone || '')}" placeholder="선택"></div>
        <div class="field"><label>이메일</label><input name="email" type="email" value="${esc(p.email)}"></div>
      </div>
      <div class="field"><label>비밀번호</label><input name="password" type="text" value="${esc(p.password)}" placeholder="변경하지 않으면 그대로 유지"></div>
    `, fd => {
      const data = Object.fromEntries(fd);
      p.name = data.name;
      p.dept = data.dept;
      p.gender = data.gender;
      p.level = data.level;
      p.phone = data.phone || '';
      p.email = data.email;
      if (data.password) p.password = data.password;
      saveData();
      closeModal();
      toast('선수 정보가 수정되었습니다.');
      renderApp();
    });
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
    `, fd => {
      const data = Object.fromEntries(fd);
      if (t) {
        Object.assign(t, data);
      } else {
        const id = uid();
        state.data.tournaments.push({
          id, name: data.name, date: data.date, location: data.location,
          status: data.status, description: data.description,
          participantIds: [], createdAt: Date.now()
        });
        EVENTS.forEach(ev => {
          state.data.brackets[getBracketKey(id, ev)] = createEmptyBracket(8);
        });
        state.selectedTournament = id;
      }
      saveData();
      closeModal();
      toast(t ? '대회 정보가 수정되었습니다.' : '새 대회가 생성되었습니다.');
      renderApp();
    });
  }

  function findMatchById(matchId) {
    for (const t of state.data.tournaments) {
      for (const ev of EVENTS) {
        const bracket = getBracket(t.id, ev);
        const m = bracket.matches.find(x => x.id === matchId);
        if (m) return { match: m, bracket, tournamentId: t.id, event: ev };
      }
    }
    return null;
  }

  function openScheduleModal(matchId) {
    const found = findMatchById(matchId);
    if (!found) return;
    const { match } = found;
    openModal('경기 일정 설정', `
      <div class="row2">
        <div class="field"><label>시간</label><input name="scheduledAt" value="${esc(match.scheduledAt)}" placeholder="예: 09:30"></div>
        <div class="field"><label>코트</label><input name="court" value="${esc(match.court)}" placeholder="예: 코트 3"></div>
      </div>
    `, fd => {
      const data = Object.fromEntries(fd);
      match.scheduledAt = data.scheduledAt;
      match.court = data.court;
      match.status = 'live';
      saveData();
      const p1 = getUserName(match.player1Id);
      const p2 = getUserName(match.player2Id);
      notifyUser(match.player1Id, `경기 일정: ${p1} vs ${p2} — ${data.scheduledAt} ${data.court}`);
      notifyUser(match.player2Id, `경기 일정: ${p1} vs ${p2} — ${data.scheduledAt} ${data.court}`);
      closeModal();
      toast('경기 일정이 설정되었습니다.');
      renderApp();
    });
  }

  function openResultModal(matchId) {
    const found = findMatchById(matchId);
    if (!found) return;
    const { match } = found;
    openModal('경기 결과 입력', `
      <p style="font-size:14px;margin:0 0 16px">${esc(getUserName(match.player1Id))} vs ${esc(getUserName(match.player2Id))}</p>
      <div class="field"><label>스코어 (예: 3-1)</label><input name="score" required value="${esc(match.score)}" placeholder="3-1"></div>
      <div class="field"><label>승자</label>
        <select name="winnerId" required>
          <option value="">선택</option>
          <option value="${match.player1Id}" ${match.winnerId === match.player1Id ? 'selected' : ''}>${esc(getUserName(match.player1Id))}</option>
          <option value="${match.player2Id}" ${match.winnerId === match.player2Id ? 'selected' : ''}>${esc(getUserName(match.player2Id))}</option>
        </select>
      </div>
    `, fd => {
      const data = Object.fromEntries(fd);
      match.score = data.score;
      match.winnerId = data.winnerId;
      match.status = 'completed';
      advanceWinner(found.bracket, match);
      saveData();
      const winner = getUserName(data.winnerId);
      notifyUser(match.player1Id, `경기 결과: ${data.score} — ${winner} 승리`);
      notifyUser(match.player2Id, `경기 결과: ${data.score} — ${winner} 승리`);
      notifyAll(`[${found.event}] ${getUserName(match.player1Id)} vs ${getUserName(match.player2Id)} — ${data.score}`);
      closeModal();
      toast('경기 결과가 반영되었습니다.');
      renderApp();
    });
  }

  function openAnnounceModal() {
    openModal('공지 작성', `
      <div class="field"><label>제목</label><input name="title" required placeholder="공지 제목"></div>
      <div class="field"><label>내용</label><textarea name="body" required rows="5" placeholder="공지 내용을 입력하세요"></textarea></div>
    `, fd => {
      const data = Object.fromEntries(fd);
      state.data.announcements.unshift({
        id: uid(), title: data.title, body: data.body,
        authorId: getCurrentUser().id, createdAt: Date.now()
      });
      notifyAll(`새 공지: ${data.title}`);
      saveData();
      closeModal();
      toast('공지가 등록되었습니다.');
      renderApp();
    });
  }

  function openAnnounceDetail(a) {
    const author = getUser(a.authorId);
    openModal(a.title, `
      <p style="font-size:14px;line-height:1.7;color:var(--ink-2);white-space:pre-wrap">${esc(a.body)}</p>
      <div class="announce-meta">${esc(author?.name || '운영팀')} · ${formatDate(new Date(a.createdAt))}</div>
    `, () => { closeModal(); });
    $('#modalSubmit').classList.add('hidden');
  }

  function openNotifPanel() {
    const user = getCurrentUser();
    const notifs = state.data.notifications.filter(n => n.userId === user.id).slice(0, 30);
    openModal('알림', notifs.length ? notifs.map(n => `
      <div style="padding:10px 0;border-bottom:1px solid var(--line-soft);font-size:13px;${n.read ? 'opacity:.6' : ''}">
        ${esc(n.message)}<br><small style="color:var(--muted)">${formatDate(new Date(n.createdAt))}</small>
      </div>
    `).join('') : '<p style="color:var(--muted);font-size:14px">알림이 없습니다.</p>', () => {
      notifs.forEach(n => n.read = true);
      saveData();
      closeModal();
      renderApp();
    });
    $('#modalSubmit').textContent = '모두 읽음';
    $('#modalSubmit').classList.remove('hidden');
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
  function init() {
    $$('.auth-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        state.authMode = btn.dataset.mode;
        renderAuthForm();
      });
    });

    $('#authForm').addEventListener('submit', e => {
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
        if (login(fd.get('email'), fd.get('password'))) {
          showApp();
          toast(`환영합니다, ${getCurrentUser().name}님!`);
        } else {
          alertEl.textContent = '이메일 또는 비밀번호가 올바르지 않습니다.';
          alertEl.className = 'alert alert-error';
          alertEl.classList.remove('hidden');
        }
      } else {
        const result = register(e.target);
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
        state.tab = btn.dataset.tab;
        renderApp();
      });
    });

    $('#notifBtn').addEventListener('click', openNotifPanel);
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalOverlay').addEventListener('click', e => { if (e.target.id === 'modalOverlay') closeModal(); });

    renderAuthForm();
    if (state.data.session && getCurrentUser()) showApp();
    else showAuth();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
