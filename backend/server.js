const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3306;
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

async function adminOnly(req, res, next) {
  try {
    const db = await getDb();
    const [rows] = await db.execute('SELECT role FROM users WHERE id = ?', [req.userId]);
    if (!rows.length || rows[0].role !== 'admin') {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
}

/* ===== EVENTS CONST ===== */
const EVENTS = ['남자단식', '여자단식', '남자복식', '여자복식', '혼성복식'];

/* ===== AUTH ===== */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = await getDb();
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...safe } = user;
    res.json({ token, user: safe });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, dept, gender, level, phone } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: '이메일, 비밀번호, 이름은 필수 입력 항목입니다.' });
    }
    const db = await getDb();
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ error: '이미 등록된 이메일입니다.' });
    }
    const id = uuid();
    const hashed = bcrypt.hashSync(password, 10);
    await db.execute(
      'INSERT INTO users (id, email, password, name, dept, gender, level, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, email, hashed, name, dept, gender, level, 'player', phone || '', Date.now()]
    );
    const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '7d' });
    const [urows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
    const { password: _, ...safe } = urows[0];
    res.json({ token, user: safe });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute('SELECT id, email, name, dept, gender, level, role, phone, created_at FROM users WHERE id = ?', [req.userId]);
    if (!rows.length) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

/* ===== USERS / PLAYERS ===== */
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute('SELECT id, email, name, dept, gender, level, role, phone, created_at FROM users ORDER BY name ASC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.get('/api/players', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const { q, gender, level } = req.query;
    let sql = 'SELECT id, email, name, dept, gender, level, role, phone, created_at FROM users WHERE role = ?';
    const params = ['player'];
    if (gender) { sql += ' AND gender = ?'; params.push(gender); }
    if (level) { sql += ' AND level = ?'; params.push(level); }
    if (q) { sql += ' AND (name LIKE ? OR dept LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY name ASC';
    const [rows] = await db.execute(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.put('/api/players/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const db = await getDb();
    const { name, dept, gender, level, phone, email, password } = req.body;
    const [existingRows] = await db.execute('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!existingRows.length) return res.status(404).json({ error: '선수를 찾을 수 없습니다.' });

    if (email && email !== existingRows[0].email) {
      const [conflict] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
      if (conflict.length) {
        return res.status(409).json({ error: '이미 등록된 이메일입니다.' });
      }
    }

    const updates = { name, dept, gender, level, phone, email };
    if (password) updates.password = bcrypt.hashSync(password, 10);

    const setClauses = Object.keys(updates).filter(k => updates[k] !== undefined).map(k => `${k} = ?`);
    const values = Object.keys(updates).filter(k => updates[k] !== undefined).map(k => updates[k]);
    if (setClauses.length === 0) return res.json({ ok: true });

    await db.execute(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

/* ===== TOURNAMENTS ===== */
app.get('/api/tournaments', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const [tournaments] = await db.execute('SELECT * FROM tournaments ORDER BY created_at DESC');
    const [counts] = await db.execute('SELECT tournament_id, COUNT(*) as cnt FROM tournament_participants GROUP BY tournament_id');
    const countMap = {};
    counts.forEach(r => countMap[r.tournament_id] = r.cnt);
    tournaments.forEach(t => t.participant_count = countMap[t.id] || 0);
    res.json(tournaments);
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.post('/api/tournaments', authenticate, adminOnly, async (req, res) => {
  try {
    const db = await getDb();
    const { name, date, location, status, description } = req.body;
    if (!name || !date) {
      return res.status(400).json({ error: '대회 이름과 개최 일자는 필수 입력 항목입니다.' });
    }
    const id = uuid();
    await db.execute(
      'INSERT INTO tournaments (id, name, date, location, status, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, date, location || '', status || 'open', description || '', Date.now()]
    );
    for (const ev of EVENTS) {
      const bId = uuid();
      await db.execute('INSERT INTO brackets (id, tournament_id, event, size) VALUES (?, ?, ?, ?)', [bId, id, ev, 8]);
      const rounds = Math.log2(8);
      for (let r = 0; r < rounds; r++) {
        const count = 8 / Math.pow(2, r + 1);
        for (let m = 0; m < count; m++) {
          await db.execute(
            'INSERT INTO matches (id, bracket_id, round, match_in_round, player1_id, player2_id, winner_id, score, scheduled_at, court, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [uuid(), bId, r, m, null, null, null, '', '', '', 'pending']
          );
        }
      }
    }
    res.json({ id, ok: true });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.put('/api/tournaments/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const db = await getDb();
    const { name, date, location, status, description } = req.body;
    await db.execute(
      'UPDATE tournaments SET name = ?, date = ?, location = ?, status = ?, description = ? WHERE id = ?',
      [name, date, location, status, description, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.get('/api/tournaments/:id/participants', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute(
      `SELECT u.id, u.name, u.dept, u.gender, u.level, tp.event, tp.partner_name
       FROM tournament_participants tp
       JOIN users u ON u.id = tp.user_id
       WHERE tp.tournament_id = ?
       ORDER BY u.name ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.post('/api/tournaments/:id/join', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const tId = req.params.id;
    const [trows] = await db.execute('SELECT status FROM tournaments WHERE id = ?', [tId]);
    if (!trows.length) return res.status(404).json({ error: '대회를 찾을 수 없습니다.' });
    if (trows[0].status !== 'open') return res.status(400).json({ error: '모집 중인 대회만 참가할 수 있습니다.' });

    const [existing] = await db.execute('SELECT * FROM tournament_participants WHERE tournament_id = ? AND user_id = ?', [tId, req.userId]);
    if (existing.length) return res.status(409).json({ error: '이미 참가 중입니다.' });

    await db.execute('INSERT INTO tournament_participants (tournament_id, user_id, event, partner_name) VALUES (?, ?, ?, ?)', [tId, req.userId, '', '']);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

/* ===== BRACKETS ===== */
app.get('/api/brackets/:tournamentId/:event', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const { tournamentId, event } = req.params;
    let [brows] = await db.execute('SELECT * FROM brackets WHERE tournament_id = ? AND event = ?', [tournamentId, event]);
    let bracket = brows[0];
    if (!bracket) {
      const bId = uuid();
      await db.execute('INSERT INTO brackets (id, tournament_id, event, size) VALUES (?, ?, ?, ?)', [bId, tournamentId, event, 8]);
      const rounds = Math.log2(8);
      for (let r = 0; r < rounds; r++) {
        const count = 8 / Math.pow(2, r + 1);
        for (let m = 0; m < count; m++) {
          await db.execute(
            'INSERT INTO matches (id, bracket_id, round, match_in_round, player1_id, player2_id, winner_id, score, scheduled_at, court, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [uuid(), bId, r, m, null, null, null, '', '', '', 'pending']
          );
        }
      }
      [brows] = await db.execute('SELECT * FROM brackets WHERE tournament_id = ? AND event = ?', [tournamentId, event]);
      bracket = brows[0];
    }
    const [matches] = await db.execute(
      'SELECT * FROM matches WHERE bracket_id = ? ORDER BY round ASC, match_in_round ASC',
      [bracket.id]
    );
    bracket.matches = matches;
    res.json(bracket);
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.put('/api/brackets/:bracketId/assign', authenticate, adminOnly, async (req, res) => {
  try {
    const db = await getDb();
    const { matchId, slot, playerId } = req.body;
    const field = slot === 1 ? 'player1_id' : 'player2_id';
    await db.execute(`UPDATE matches SET ${field} = ? WHERE id = ?`, [playerId || null, matchId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.post('/api/brackets/:bracketId/reset', authenticate, adminOnly, async (req, res) => {
  try {
    const db = await getDb();
    const [brows] = await db.execute('SELECT * FROM brackets WHERE id = ?', [req.params.bracketId]);
    if (!brows.length) return res.status(404).json({ error: '대진표를 찾을 수 없습니다.' });
    const bracket = brows[0];
    await db.execute('DELETE FROM matches WHERE bracket_id = ?', [bracket.id]);
    const rounds = Math.log2(bracket.size);
    for (let r = 0; r < rounds; r++) {
      const count = bracket.size / Math.pow(2, r + 1);
      for (let m = 0; m < count; m++) {
        await db.execute(
          'INSERT INTO matches (id, bracket_id, round, match_in_round, player1_id, player2_id, winner_id, score, scheduled_at, court, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [uuid(), bracket.id, r, m, null, null, null, '', '', '', 'pending']
        );
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

/* ===== MATCHES ===== */
app.get('/api/matches', authenticate, async (req, res) => {
  try {
    const db = await getDb();
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
    const [rows] = await db.execute(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.get('/api/matches/my', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const userId = req.userId;
    const [rows] = await db.execute(`
      SELECT m.*, b.event, b.tournament_id, t.name as tournament_name
      FROM matches m
      JOIN brackets b ON b.id = m.bracket_id
      JOIN tournaments t ON t.id = b.tournament_id
      WHERE (m.player1_id = ? OR m.player2_id = ?) AND m.status = ?
      ORDER BY m.round ASC
    `, [userId, userId, 'completed']);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.put('/api/matches/:id/schedule', authenticate, adminOnly, async (req, res) => {
  try {
    const db = await getDb();
    const { scheduledAt, court } = req.body;
    await db.execute('UPDATE matches SET scheduled_at = ?, court = ?, status = ? WHERE id = ?', [scheduledAt || '', court || '', 'live', req.params.id]);
    const [mrows] = await db.execute(`
      SELECT m.*, b.event, b.tournament_id, t.name as tournament_name
      FROM matches m
      JOIN brackets b ON b.id = m.bracket_id
      JOIN tournaments t ON t.id = b.tournament_id
      WHERE m.id = ?
    `, [req.params.id]);
    const match = mrows[0];

    const [p1rows] = await db.execute('SELECT name FROM users WHERE id = ?', [match.player1_id]);
    const [p2rows] = await db.execute('SELECT name FROM users WHERE id = ?', [match.player2_id]);
    const p1Name = p1rows.length ? p1rows[0].name : '선수1';
    const p2Name = p2rows.length ? p2rows[0].name : '선수2';

    if (match.player1_id) {
      await db.execute(
        'INSERT INTO notifications (id, user_id, message, type, `read`, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), match.player1_id, `[${match.event}] 경기 일정: ${p1Name} vs ${p2Name} — ${scheduledAt} ${court}`, 'info', 0, Date.now()]
      );
    }
    if (match.player2_id) {
      await db.execute(
        'INSERT INTO notifications (id, user_id, message, type, `read`, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), match.player2_id, `[${match.event}] 경기 일정: ${p1Name} vs ${p2Name} — ${scheduledAt} ${court}`, 'info', 0, Date.now()]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.put('/api/matches/:id/result', authenticate, adminOnly, async (req, res) => {
  try {
    const db = await getDb();
    const { score, winnerId } = req.body;
    await db.execute('UPDATE matches SET score = ?, winner_id = ?, status = ? WHERE id = ?', [score, winnerId, 'completed', req.params.id]);

    const [mrows] = await db.execute(`
      SELECT m.*, b.event, b.tournament_id, b.id as bracket_id
      FROM matches m
      JOIN brackets b ON b.id = m.bracket_id
      WHERE m.id = ?
    `, [req.params.id]);
    const match = mrows[0];

    if (match && winnerId) {
      const nextRound = match.round + 1;
      const nextMatchInRound = Math.floor(match.match_in_round / 2);
      const [nmrows] = await db.execute(
        'SELECT * FROM matches WHERE bracket_id = ? AND round = ? AND match_in_round = ?',
        [match.bracket_id, nextRound, nextMatchInRound]
      );
      const nextMatch = nmrows[0];
      if (nextMatch) {
        const field = match.match_in_round % 2 === 0 ? 'player1_id' : 'player2_id';
        await db.execute(`UPDATE matches SET ${field} = ? WHERE id = ?`, [winnerId, nextMatch.id]);
      }

      const [p1rows] = await db.execute('SELECT name FROM users WHERE id = ?', [match.player1_id]);
      const [p2rows] = await db.execute('SELECT name FROM users WHERE id = ?', [match.player2_id]);
      const p1Name = p1rows.length ? p1rows[0].name : '선수1';
      const p2Name = p2rows.length ? p2rows[0].name : '선수2';

      if (match.player1_id) {
        const isWinner = match.player1_id === winnerId;
        const winStatus = isWinner ? '승리' : '패배';
        await db.execute(
          'INSERT INTO notifications (id, user_id, message, type, `read`, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [uuid(), match.player1_id, `[${match.event}] 경기 결과: ${p1Name} vs ${p2Name} — ${score} (${winStatus})`, 'info', 0, Date.now()]
        );
      }
      if (match.player2_id) {
        const isWinner = match.player2_id === winnerId;
        const winStatus = isWinner ? '승리' : '패배';
        await db.execute(
          'INSERT INTO notifications (id, user_id, message, type, `read`, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [uuid(), match.player2_id, `[${match.event}] 경기 결과: ${p1Name} vs ${p2Name} — ${score} (${winStatus})`, 'info', 0, Date.now()]
        );
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

/* ===== LEADERBOARD ===== */
app.get('/api/leaderboard/:tournamentId/:event', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const { tournamentId, event } = req.params;
    const [brows] = await db.execute('SELECT id FROM brackets WHERE tournament_id = ? AND event = ?', [tournamentId, event]);
    if (!brows.length) return res.json([]);

    const [matches] = await db.execute(
      "SELECT * FROM matches WHERE bracket_id = ? AND status = 'completed' AND winner_id IS NOT NULL",
      [brows[0].id]
    );

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

    const [users] = await db.execute('SELECT id, name, dept FROM users');
    const userMap = {};
    users.forEach(u => userMap[u.id] = u);

    const result = Object.entries(stats)
      .map(([id, s]) => ({ id, ...s, user: userMap[id] }))
      .filter(r => r.user)
      .sort((a, b) => b.points - a.points || b.wins - a.wins || (b.sets_won - b.sets_lost) - (a.sets_won - a.sets_lost));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

/* ===== ANNOUNCEMENTS ===== */
app.get('/api/announcements', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute(`
      SELECT a.*, u.name as author_name
      FROM announcements a
      JOIN users u ON u.id = a.author_id
      ORDER BY a.created_at DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.post('/api/announcements', authenticate, adminOnly, async (req, res) => {
  try {
    const db = await getDb();
    const { title, body } = req.body;
    const id = uuid();
    await db.execute('INSERT INTO announcements (id, title, body, author_id, created_at) VALUES (?, ?, ?, ?, ?)', [id, title, body, req.userId, Date.now()]);

    const [users] = await db.execute('SELECT id FROM users');
    for (const u of users) {
      await db.execute('INSERT INTO notifications (id, user_id, message, type, `read`, created_at) VALUES (?, ?, ?, ?, ?, ?)', [uuid(), u.id, `새 공지: ${title}`, 'info', 0, Date.now()]);
    }
    res.json({ id, ok: true });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

/* ===== NOTIFICATIONS ===== */
app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
      [req.userId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.get('/api/notifications/unread-count', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND `read` = 0',
      [req.userId]
    );
    res.json({ count: rows[0].count });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.put('/api/notifications/read-all', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    await db.execute('UPDATE notifications SET `read` = 1 WHERE user_id = ?', [req.userId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

app.put('/api/profile', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const { name, dept, level, phone } = req.body;
    if (!name || !dept || !level) {
      return res.status(400).json({ error: '이름, 부서, 실력 등급은 필수 입력 항목입니다.' });
    }
    await db.execute('UPDATE users SET name = ?, dept = ?, level = ?, phone = ? WHERE id = ?', [name, dept, level, phone || '', req.userId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '서버 오류' });
  }
});

async function start() {
  try {
    await getDb();
    console.log('데이터베이스 연결 성공');
  } catch (e) {
    console.error('데이터베이스 연결 실패:', e.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  });
}

start();
