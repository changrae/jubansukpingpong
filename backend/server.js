const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'jubansek_table_tennis_2026_secret';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

/* ===== Auth Middleware ===== */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
}

function adminOnly(req, res, next) {
  const db = getDb();
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }
  next();
}

/* ===== EVENTS CONST ===== */
const EVENTS = ['남자단식', '여자단식', '남자복식', '여자복식', '혼성복식'];

/* ===== AUTH ===== */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const { password: _, ...safe } = user;
  res.json({ token, user: safe });
});

app.post('/api/auth/register', (req, res) => {
  const { email, password, name, dept, gender, level, phone } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: '이메일, 비밀번호, 이름은 필수 입력 항목입니다.' });
  }
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: '이미 등록된 이메일입니다.' });
  }
  const id = uuid();
  const hashed = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (id, email, password, name, dept, gender, level, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, email, hashed, name, dept, gender, level, 'player', phone || '', Date.now());
  const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '7d' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const { password: _, ...safe } = user;
  res.json({ token, user: safe });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, name, dept, gender, level, role, phone, created_at FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  res.json(user);
});

/* ===== USERS / PLAYERS ===== */
app.get('/api/users', authenticate, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, email, name, dept, gender, level, role, phone, created_at FROM users ORDER BY name ASC').all();
  res.json(users);
});

app.get('/api/players', authenticate, (req, res) => {
  const db = getDb();
  const { q, gender, level } = req.query;
  let sql = 'SELECT id, email, name, dept, gender, level, role, phone, created_at FROM users WHERE role = ?';
  const params = ['player'];
  if (gender) { sql += ' AND gender = ?'; params.push(gender); }
  if (level) { sql += ' AND level = ?'; params.push(level); }
  if (q) { sql += ' AND (name LIKE ? OR dept LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY name ASC';
  const players = db.prepare(sql).all(...params);
  res.json(players);
});

app.put('/api/players/:id', authenticate, adminOnly, (req, res) => {
  const db = getDb();
  const { name, dept, gender, level, phone, email, password } = req.body;
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '선수를 찾을 수 없습니다.' });

  if (email && email !== existing.email) {
    const emailConflict = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (emailConflict) {
      return res.status(409).json({ error: '이미 등록된 이메일입니다.' });
    }
  }

  const updates = { name, dept, gender, level, phone, email };
  if (password) updates.password = bcrypt.hashSync(password, 10);

  const setClauses = Object.keys(updates).filter(k => updates[k] !== undefined).map(k => `${k} = ?`);
  const values = Object.keys(updates).filter(k => updates[k] !== undefined).map(k => updates[k]);
  if (setClauses.length === 0) return res.json({ ok: true });

  db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).run(...values, req.params.id);
  res.json({ ok: true });
});

/* ===== TOURNAMENTS ===== */
app.get('/api/tournaments', authenticate, (req, res) => {
  const db = getDb();
  const tournaments = db.prepare('SELECT * FROM tournaments ORDER BY created_at DESC').all();
  const participantCounts = db.prepare(
    'SELECT tournament_id, COUNT(*) as cnt FROM tournament_participants GROUP BY tournament_id'
  ).all();
  const countMap = {};
  participantCounts.forEach(r => countMap[r.tournament_id] = r.cnt);
  tournaments.forEach(t => t.participant_count = countMap[t.id] || 0);
  res.json(tournaments);
});

app.post('/api/tournaments', authenticate, adminOnly, (req, res) => {
  const db = getDb();
  const { name, date, location, status, description } = req.body;
  if (!name || !date) {
    return res.status(400).json({ error: '대회 이름과 개최 일자는 필수 입력 항목입니다.' });
  }
  const id = uuid();
  db.prepare(
    'INSERT INTO tournaments (id, name, date, location, status, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, date, location || '', status || 'open', description || '', Date.now());
  for (const ev of EVENTS) {
    const bId = uuid();
    db.prepare('INSERT INTO brackets (id, tournament_id, event, size) VALUES (?, ?, ?, ?)').run(bId, id, ev, 8);
    const rounds = Math.log2(8);
    let matchIdx = 0;
    for (let r = 0; r < rounds; r++) {
      const count = 8 / Math.pow(2, r + 1);
      for (let m = 0; m < count; m++) {
        db.prepare(
          'INSERT INTO matches (id, bracket_id, round, match_in_round, player1_id, player2_id, winner_id, score, scheduled_at, court, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(uuid(), bId, r, m, null, null, null, '', '', '', 'pending');
        matchIdx++;
      }
    }
  }
  res.json({ id, ok: true });
});

app.put('/api/tournaments/:id', authenticate, adminOnly, (req, res) => {
  const db = getDb();
  const { name, date, location, status, description } = req.body;
  db.prepare(
    'UPDATE tournaments SET name = ?, date = ?, location = ?, status = ?, description = ? WHERE id = ?'
  ).run(name, date, location, status, description, req.params.id);
  res.json({ ok: true });
});

app.get('/api/tournaments/:id/participants', authenticate, (req, res) => {
  const db = getDb();
  const participants = db.prepare(
    `SELECT u.id, u.name, u.dept, u.gender, u.level, tp.event, tp.partner_name
     FROM tournament_participants tp
     JOIN users u ON u.id = tp.user_id
     WHERE tp.tournament_id = ?
     ORDER BY u.name ASC`
  ).all(req.params.id);
  res.json(participants);
});

app.post('/api/tournaments/:id/join', authenticate, (req, res) => {
  const db = getDb();
  const tId = req.params.id;
  const tournament = db.prepare('SELECT status FROM tournaments WHERE id = ?').get(tId);
  if (!tournament) return res.status(404).json({ error: '대회를 찾을 수 없습니다.' });
  if (tournament.status !== 'open') return res.status(400).json({ error: '모집 중인 대회만 참가할 수 있습니다.' });

  const existing = db.prepare('SELECT * FROM tournament_participants WHERE tournament_id = ? AND user_id = ?').get(tId, req.userId);
  if (existing) return res.status(409).json({ error: '이미 참가 중입니다.' });

  db.prepare('INSERT INTO tournament_participants (tournament_id, user_id, event, partner_name) VALUES (?, ?, ?, ?)').run(tId, req.userId, '', '');
  res.json({ ok: true });
});

/* ===== BRACKETS ===== */
app.get('/api/brackets/:tournamentId/:event', authenticate, (req, res) => {
  const db = getDb();
  const { tournamentId, event } = req.params;
  let bracket = db.prepare('SELECT * FROM brackets WHERE tournament_id = ? AND event = ?').get(tournamentId, event);
  if (!bracket) {
    const bId = uuid();
    db.prepare('INSERT INTO brackets (id, tournament_id, event, size) VALUES (?, ?, ?, ?)').run(bId, tournamentId, event, 8);
    const rounds = Math.log2(8);
    let matchIdx = 0;
    for (let r = 0; r < rounds; r++) {
      const count = 8 / Math.pow(2, r + 1);
      for (let m = 0; m < count; m++) {
        db.prepare(
          'INSERT INTO matches (id, bracket_id, round, match_in_round, player1_id, player2_id, winner_id, score, scheduled_at, court, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(uuid(), bId, r, m, null, null, null, '', '', '', 'pending');
        matchIdx++;
      }
    }
    bracket = db.prepare('SELECT * FROM brackets WHERE tournament_id = ? AND event = ?').get(tournamentId, event);
  }
  const matches = db.prepare(
    'SELECT * FROM matches WHERE bracket_id = ? ORDER BY round ASC, match_in_round ASC'
  ).all(bracket.id);
  bracket.matches = matches;
  res.json(bracket);
});

app.put('/api/brackets/:bracketId/assign', authenticate, adminOnly, (req, res) => {
  const db = getDb();
  const { matchId, slot, playerId } = req.body;
  const field = slot === 1 ? 'player1_id' : 'player2_id';
  db.prepare(`UPDATE matches SET ${field} = ? WHERE id = ?`).run(playerId || null, matchId);
  res.json({ ok: true });
});

app.post('/api/brackets/:bracketId/reset', authenticate, adminOnly, (req, res) => {
  const db = getDb();
  const bracket = db.prepare('SELECT * FROM brackets WHERE id = ?').get(req.params.bracketId);
  if (!bracket) return res.status(404).json({ error: '대진표를 찾을 수 없습니다.' });
  db.prepare('DELETE FROM matches WHERE bracket_id = ?').run(bracket.id);
  const rounds = Math.log2(bracket.size);
  let matchIdx = 0;
  for (let r = 0; r < rounds; r++) {
    const count = bracket.size / Math.pow(2, r + 1);
    for (let m = 0; m < count; m++) {
      db.prepare(
        'INSERT INTO matches (id, bracket_id, round, match_in_round, player1_id, player2_id, winner_id, score, scheduled_at, court, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(uuid(), bracket.id, r, m, null, null, null, '', '', '', 'pending');
      matchIdx++;
    }
  }
  res.json({ ok: true });
});

/* ===== MATCHES ===== */
app.get('/api/matches', authenticate, (req, res) => {
  const db = getDb();
  const { tournamentId, event, filter } = req.query;
  let sql = `
    SELECT m.*, b.event, b.tournament_id, t.name as tournament_name
    FROM matches m
    JOIN brackets b ON b.id = m.bracket_id
    JOIN tournaments t ON t.id = b.tournament_id
    WHERE 1=1`;
  const params = [];
  if (tournamentId) { sql += ' AND b.tournament_id = ?'; params.push(tournamentId); }
  if (event) { sql += ' AND b.event = ?'; params.push(event); }
  if (filter === 'upcoming') { sql += ' AND m.status = ? AND m.player1_id IS NOT NULL AND m.player2_id IS NOT NULL'; params.push('pending'); }
  else if (filter === 'live') { sql += ' AND m.status = ?'; params.push('live'); }
  else if (filter === 'completed') { sql += ' AND m.status = ?'; params.push('completed'); }
  sql += ' ORDER BY m.round ASC, m.match_in_round ASC';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/matches/my', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;
  const matches = db.prepare(`
    SELECT m.*, b.event, b.tournament_id, t.name as tournament_name
    FROM matches m
    JOIN brackets b ON b.id = m.bracket_id
    JOIN tournaments t ON t.id = b.tournament_id
    WHERE (m.player1_id = ? OR m.player2_id = ?) AND m.status = ?
    ORDER BY m.round ASC
  `).all(userId, userId, 'completed');
  res.json(matches);
});

app.put('/api/matches/:id/schedule', authenticate, adminOnly, (req, res) => {
  const db = getDb();
  const { scheduledAt, court } = req.body;
  db.prepare('UPDATE matches SET scheduled_at = ?, court = ?, status = ? WHERE id = ?').run(scheduledAt || '', court || '', 'live', req.params.id);
  const match = db.prepare(`
    SELECT m.*, b.event, b.tournament_id, t.name as tournament_name
    FROM matches m
    JOIN brackets b ON b.id = m.bracket_id
    JOIN tournaments t ON t.id = b.tournament_id
    WHERE m.id = ?
  `).get(req.params.id);

  const p1Name = match.player1_id ? (db.prepare('SELECT name FROM users WHERE id = ?').get(match.player1_id)?.name || '선수1') : '선수1';
  const p2Name = match.player2_id ? (db.prepare('SELECT name FROM users WHERE id = ?').get(match.player2_id)?.name || '선수2') : '선수2';

  if (match.player1_id) {
    db.prepare('INSERT INTO notifications (id, user_id, message, type, read, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      uuid(), match.player1_id, `[${match.event}] 경기 일정: ${p1Name} vs ${p2Name} — ${scheduledAt} ${court}`, 'info', 0, Date.now()
    );
  }
  if (match.player2_id) {
    db.prepare('INSERT INTO notifications (id, user_id, message, type, read, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      uuid(), match.player2_id, `[${match.event}] 경기 일정: ${p1Name} vs ${p2Name} — ${scheduledAt} ${court}`, 'info', 0, Date.now()
    );
  }
  res.json({ ok: true });
});

app.put('/api/matches/:id/result', authenticate, adminOnly, (req, res) => {
  const db = getDb();
  const { score, winnerId } = req.body;
  db.prepare('UPDATE matches SET score = ?, winner_id = ?, status = ? WHERE id = ?').run(score, winnerId, 'completed', req.params.id);

  const match = db.prepare(`
    SELECT m.*, b.event, b.tournament_id, b.id as bracket_id
    FROM matches m
    JOIN brackets b ON b.id = m.bracket_id
    WHERE m.id = ?
  `).get(req.params.id);

  if (match && winnerId) {
    const nextRound = match.round + 1;
    const nextMatchInRound = Math.floor(match.match_in_round / 2);
    const nextMatch = db.prepare(
      'SELECT * FROM matches WHERE bracket_id = ? AND round = ? AND match_in_round = ?'
    ).get(match.bracket_id, nextRound, nextMatchInRound);
    if (nextMatch) {
      const field = match.match_in_round % 2 === 0 ? 'player1_id' : 'player2_id';
      db.prepare(`UPDATE matches SET ${field} = ? WHERE id = ?`).run(winnerId, nextMatch.id);
    }

    const p1Name = match.player1_id ? (db.prepare('SELECT name FROM users WHERE id = ?').get(match.player1_id)?.name || '선수1') : '선수1';
    const p2Name = match.player2_id ? (db.prepare('SELECT name FROM users WHERE id = ?').get(match.player2_id)?.name || '선수2') : '선수2';

    if (match.player1_id) {
      const isWinner = match.player1_id === winnerId;
      const winStatus = isWinner ? '승리' : '패배';
      db.prepare('INSERT INTO notifications (id, user_id, message, type, read, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        uuid(), match.player1_id, `[${match.event}] 경기 결과: ${p1Name} vs ${p2Name} — ${score} (${winStatus})`, 'info', 0, Date.now()
      );
    }
    if (match.player2_id) {
      const isWinner = match.player2_id === winnerId;
      const winStatus = isWinner ? '승리' : '패배';
      db.prepare('INSERT INTO notifications (id, user_id, message, type, read, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        uuid(), match.player2_id, `[${match.event}] 경기 결과: ${p1Name} vs ${p2Name} — ${score} (${winStatus})`, 'info', 0, Date.now()
      );
    }
  }

  res.json({ ok: true });
});

/* ===== LEADERBOARD ===== */
app.get('/api/leaderboard/:tournamentId/:event', authenticate, (req, res) => {
  const db = getDb();
  const { tournamentId, event } = req.params;
  const bracket = db.prepare('SELECT id FROM brackets WHERE tournament_id = ? AND event = ?').get(tournamentId, event);
  if (!bracket) return res.json([]);

  const matches = db.prepare(
    "SELECT * FROM matches WHERE bracket_id = ? AND status = 'completed' AND winner_id IS NOT NULL"
  ).all(bracket.id);

  const stats = {};
  for (const m of matches) {
    const loserId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
    for (const pid of [m.winner_id, loserId]) {
      if (!pid) continue;
      if (!stats[pid]) stats[pid] = { wins: 0, losses: 0, points: 0, sets_won: 0, sets_lost: 0 };
      if (pid === m.winner_id) { stats[pid].wins++; stats[pid].points += 3; }
      else { stats[pid].losses++; }
      const parts = (m.score || '0-0').split('-').map(Number);
      if (parts.length === 2) {
        if (pid === m.winner_id) { stats[pid].sets_won += parts[0]; stats[pid].sets_lost += parts[1]; }
        else { stats[pid].sets_won += parts[1]; stats[pid].sets_lost += parts[0]; }
      }
    }
  }

  const users = db.prepare('SELECT id, name, dept FROM users').all();
  const userMap = {};
  users.forEach(u => userMap[u.id] = u);

  const result = Object.entries(stats)
    .map(([id, s]) => ({ id, ...s, user: userMap[id] }))
    .filter(r => r.user)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || (b.sets_won - b.sets_lost) - (a.sets_won - a.sets_lost));

  res.json(result);
});

/* ===== ANNOUNCEMENTS ===== */
app.get('/api/announcements', authenticate, (req, res) => {
  const db = getDb();
  const announcements = db.prepare(`
    SELECT a.*, u.name as author_name
    FROM announcements a
    JOIN users u ON u.id = a.author_id
    ORDER BY a.created_at DESC
  `).all();
  res.json(announcements);
});

app.post('/api/announcements', authenticate, adminOnly, (req, res) => {
  const db = getDb();
  const { title, body } = req.body;
  const id = uuid();
  db.prepare('INSERT INTO announcements (id, title, body, author_id, created_at) VALUES (?, ?, ?, ?, ?)').run(id, title, body, req.userId, Date.now());

  const users = db.prepare('SELECT id FROM users').all();
  const insertNotif = db.prepare('INSERT INTO notifications (id, user_id, message, type, read, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const u of users) {
    insertNotif.run(uuid(), u.id, `새 공지: ${title}`, 'info', 0, Date.now());
  }
  res.json({ id, ok: true });
});

/* ===== NOTIFICATIONS ===== */
app.get('/api/notifications', authenticate, (req, res) => {
  const db = getDb();
  const notifs = db.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30'
  ).all(req.userId);
  res.json(notifs);
});

app.get('/api/notifications/unread-count', authenticate, (req, res) => {
  const db = getDb();
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0'
  ).get(req.userId);
  res.json({ count: result.count });
});

app.put('/api/notifications/read-all', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.userId);
  res.json({ ok: true });
});

app.put('/api/profile', authenticate, (req, res) => {
  const db = getDb();
  const { name, dept, level, phone } = req.body;
  if (!name || !dept || !level) {
    return res.status(400).json({ error: '이름, 부서, 실력 등급은 필수 입력 항목입니다.' });
  }
  db.prepare('UPDATE users SET name = ?, dept = ?, level = ?, phone = ? WHERE id = ?').run(name, dept, level, phone || '', req.userId);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
