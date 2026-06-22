const mysql = require('mysql2/promise');
const { v4: uuid } = require('uuid');
const bcrypt = require('bcryptjs');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'jubanserk.precon.im',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'precon',
  password: process.env.DB_PASSWORD || 'qawsed!2345',
  database: process.env.DB_NAME || 'vue_blog',
  waitForConnections: true,
  connectionLimit: 10,
};

let pool;
let initialized = false;

async function getDb() {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
  }
  if (!initialized) {
    initialized = true;
    await initSchema();
    await seedIfEmpty();
    await ensureAdmin();
  }
  return pool;
}

async function initSchema() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name VARCHAR(100) NOT NULL,
      dept VARCHAR(100) NOT NULL DEFAULT '',
      gender VARCHAR(10) NOT NULL DEFAULT 'M',
      level VARCHAR(20) NOT NULL DEFAULT '중급',
      role VARCHAR(20) NOT NULL DEFAULT 'player',
      phone VARCHAR(50) NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      date VARCHAR(50) NOT NULL,
      location VARCHAR(255) NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      description TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tournament_participants (
      tournament_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      event VARCHAR(50) NOT NULL DEFAULT '',
      partner_name VARCHAR(100) NOT NULL DEFAULT '',
      PRIMARY KEY (tournament_id, user_id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS brackets (
      id VARCHAR(36) PRIMARY KEY,
      tournament_id VARCHAR(36) NOT NULL,
      event VARCHAR(50) NOT NULL,
      size INT NOT NULL DEFAULT 8,
      UNIQUE KEY uk_tournament_event (tournament_id, event),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS matches (
      id VARCHAR(36) PRIMARY KEY,
      bracket_id VARCHAR(36) NOT NULL,
      round INT NOT NULL,
      match_in_round INT NOT NULL,
      player1_id VARCHAR(36),
      player2_id VARCHAR(36),
      winner_id VARCHAR(36),
      score VARCHAR(50) NOT NULL DEFAULT '',
      scheduled_at VARCHAR(50) NOT NULL DEFAULT '',
      court VARCHAR(100) NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      FOREIGN KEY (bracket_id) REFERENCES brackets(id) ON DELETE CASCADE,
      FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS announcements (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      author_id VARCHAR(36) NOT NULL,
      created_at BIGINT NOT NULL,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'info',
      \`read\` INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function seedIfEmpty() {
  const [rows] = await pool.execute('SELECT COUNT(*) as c FROM users');
  if (rows[0].c > 0) return;

  const now = Date.now();
  const adminId = uuid();
  const p1 = uuid();
  const p2 = uuid();
  const p3 = uuid();
  const p4 = uuid();
  const tId = uuid();

  const adminPw = bcrypt.hashSync('qawsedrf!1234', 10);
  const playerPw = bcrypt.hashSync('player123', 10);

  await pool.execute(
    'INSERT INTO users (id, email, password, name, dept, gender, level, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [adminId, 'admin@jubanserk.kr', adminPw, '운영관리자', '단합위원회', 'M', '동호회', 'admin', '0420', now]
  );
  await pool.execute(
    'INSERT INTO users (id, email, password, name, dept, gender, level, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [p1, '20260001@jubansek.kr', playerPw, '김탁구', '생산1팀', 'M', '중급', 'player', '', now]
  );
  await pool.execute(
    'INSERT INTO users (id, email, password, name, dept, gender, level, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [p2, '20260002@jubansek.kr', playerPw, '이서브', '영업팀', 'F', '상급', 'player', '', now]
  );
  await pool.execute(
    'INSERT INTO users (id, email, password, name, dept, gender, level, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [p3, '20260003@jubansek.kr', playerPw, '박스매시', '기획팀', 'M', '초급', 'player', '', now]
  );
  await pool.execute(
    'INSERT INTO users (id, email, password, name, dept, gender, level, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [p4, '20260004@jubansek.kr', playerPw, '최탑스핀', '품질팀', 'F', '중급', 'player', '', now]
  );

  await pool.execute(
    'INSERT INTO tournaments (id, name, date, location, status, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [tId, '일산주반석 탁구대회 2026', '2026-08-02', '일산주반석교회 특설 대회장', 'open',
      '성전 헌당 7주년 기념 전교인 탁구 단합대회', now]
  );

  for (const pid of [p1, p2, p3, p4]) {
    await pool.execute(
      'INSERT INTO tournament_participants (tournament_id, user_id, event) VALUES (?, ?, ?)',
      [tId, pid, '']
    );
  }

  const EVENTS = ['남자단식', '여자단식', '남자복식', '여자복식', '혼성복식'];
  for (const ev of EVENTS) {
    const bId = uuid();
    const size = 8;
    const rounds = Math.log2(size);
    await pool.execute(
      'INSERT INTO brackets (id, tournament_id, event, size) VALUES (?, ?, ?, ?)',
      [bId, tId, ev, size]
    );
    for (let r = 0; r < rounds; r++) {
      const count = size / Math.pow(2, r + 1);
      for (let m = 0; m < count; m++) {
        let matchPlayer1 = null, matchPlayer2 = null;
        if (ev === '남자단식' && r === 0 && m < 4) {
          const players = [p1, p2, p3, p4];
          matchPlayer1 = players[m * 2] || null;
          matchPlayer2 = players[m * 2 + 1] || null;
        }
        await pool.execute(
          'INSERT INTO matches (id, bracket_id, round, match_in_round, player1_id, player2_id, winner_id, score, scheduled_at, court, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [uuid(), bId, r, m, matchPlayer1, matchPlayer2, null, '', '', '', 'pending']
        );
      }
    }
  }

  const adminAnnounceId = uuid();
  await pool.execute(
    'INSERT INTO announcements (id, title, body, author_id, created_at) VALUES (?, ?, ?, ?, ?)',
    [adminAnnounceId, '선수단 모집 안내',
      'D-21(7/12)까지 선수단 신청을 마감합니다. 1인 1종목 원칙이며, 복식은 파트너 정보를 함께 입력해 주세요.',
      adminId, now - 86400000 * 3]
  );
}

async function ensureAdmin() {
  const adminEmail = 'admin@jubanserk.kr';
  const adminPw = bcrypt.hashSync('qawsedrf!1234', 10);
  const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [adminEmail]);
  if (rows.length === 0) {
    await pool.execute('DELETE FROM users WHERE email = ?', ['admin@jubansek.kr']);
    const id = uuid();
    await pool.execute(
      'INSERT INTO users (id, email, password, name, dept, gender, level, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, adminEmail, adminPw, '운영관리자', '단합위원회', 'M', '동호회', 'admin', '0420', Date.now()]
    );
  } else {
    await pool.execute('UPDATE users SET password = ? WHERE email = ?', [adminPw, adminEmail]);
  }
}

module.exports = { getDb };
