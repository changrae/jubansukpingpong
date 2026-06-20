const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuid } = require('uuid');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'tournament.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    seedIfEmpty();
    ensureAdmin();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      dept TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT 'M',
      level TEXT NOT NULL DEFAULT '중급',
      role TEXT NOT NULL DEFAULT 'player',
      phone TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tournament_participants (
      tournament_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      event TEXT NOT NULL DEFAULT '',
      partner_name TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (tournament_id, user_id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS brackets (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      event TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 8,
      UNIQUE(tournament_id, event),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      bracket_id TEXT NOT NULL,
      round INTEGER NOT NULL,
      match_in_round INTEGER NOT NULL,
      player1_id TEXT,
      player2_id TEXT,
      winner_id TEXT,
      score TEXT NOT NULL DEFAULT '',
      scheduled_at TEXT NOT NULL DEFAULT '',
      court TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (bracket_id) REFERENCES brackets(id) ON DELETE CASCADE,
      FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      author_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (count.c > 0) return;

  const now = Date.now();
  const adminId = uuid();
  const p1 = uuid();
  const p2 = uuid();
  const p3 = uuid();
  const p4 = uuid();
  const tId = uuid();

  const adminPw = bcrypt.hashSync('qawsedrf!1234', 10);
  const playerPw = bcrypt.hashSync('player123', 10);

  const insertUser = db.prepare(
    'INSERT INTO users (id, email, password, name, dept, gender, level, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  insertUser.run(adminId, 'admin@jubanserk.kr', adminPw, '운영관리자', '단합위원회', 'M', '동호회', 'admin', '0420', now);
  insertUser.run(p1, '20260001@jubansek.kr', playerPw, '김탁구', '생산1팀', 'M', '중급', 'player', '', now);
  insertUser.run(p2, '20260002@jubansek.kr', playerPw, '이서브', '영업팀', 'F', '상급', 'player', '', now);
  insertUser.run(p3, '20260003@jubansek.kr', playerPw, '박스매시', '기획팀', 'M', '초급', 'player', '', now);
  insertUser.run(p4, '20260004@jubansek.kr', playerPw, '최탑스핀', '품질팀', 'F', '중급', 'player', '', now);

  db.prepare(
    'INSERT INTO tournaments (id, name, date, location, status, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(tId, '일산주반석 탁구대회 2026', '2026-08-02', '일산주반석교회 특설 대회장', 'open',
    '성전 헌당 7주년 기념 전교인 탁구 단합대회', now);

  const insertParticipant = db.prepare(
    'INSERT INTO tournament_participants (tournament_id, user_id, event) VALUES (?, ?, ?)'
  );
  for (const pid of [p1, p2, p3, p4]) {
    insertParticipant.run(tId, pid, '');
  }

  const EVENTS = ['남자단식', '여자단식', '남자복식', '여자복식', '혼성복식'];
  const insertBracket = db.prepare(
    'INSERT INTO brackets (id, tournament_id, event, size) VALUES (?, ?, ?, ?)'
  );
  const insertMatch = db.prepare(
    'INSERT INTO matches (id, bracket_id, round, match_in_round, player1_id, player2_id, winner_id, score, scheduled_at, court, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  for (const ev of EVENTS) {
    const bId = uuid();
    const size = 8;
    const rounds = Math.log2(size);
    insertBracket.run(bId, tId, ev, size);
    let matchIdx = 0;
    for (let r = 0; r < rounds; r++) {
      const count = size / Math.pow(2, r + 1);
      for (let m = 0; m < count; m++) {
        const mId = uuid();
        let matchPlayer1 = null, matchPlayer2 = null, winner = null, score = '', st = 'pending';
        if (ev === '남자단식' && r === 0 && m < 4) {
          const players = [p1, p2, p3, p4];
          matchPlayer1 = players[m * 2] || null;
          matchPlayer2 = players[m * 2 + 1] || null;
        }
        insertMatch.run(mId, bId, r, m, matchPlayer1, matchPlayer2, winner, score, '', '', st);
        matchIdx++;
      }
    }
  }

  const adminAnnounceId = uuid();
  db.prepare(
    'INSERT INTO announcements (id, title, body, author_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(adminAnnounceId, '선수단 모집 안내',
    'D-21(7/12)까지 선수단 신청을 마감합니다. 1인 1종목 원칙이며, 복식은 파트너 정보를 함께 입력해 주세요.',
    adminId, now - 86400000 * 3);
}

function ensureAdmin() {
  const adminEmail = 'admin@jubanserk.kr';
  const adminPw = bcrypt.hashSync('qawsedrf!1234', 10);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    db.prepare('DELETE FROM users WHERE email = ?').run('admin@jubansek.kr');
    const id = uuid();
    db.prepare(
      'INSERT INTO users (id, email, password, name, dept, gender, level, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, adminEmail, adminPw, '운영관리자', '단합위원회', 'M', '동호회', 'admin', '0420', Date.now());
  } else {
    db.prepare('UPDATE users SET password = ? WHERE email = ?').run(adminPw, adminEmail);
  }
}

module.exports = { getDb };
