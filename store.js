/**
 * 数据存储层
 * - 配置了 DATABASE_URL 时使用 Postgres（Railway 生产环境）
 * - 未配置时使用本地 JSON 文件（离线开发与本地验证）
 * 两种实现暴露同一组异步接口，上层不感知差异。
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATABASE_URL = process.env.DATABASE_URL || '';
const USE_PG = DATABASE_URL.length > 0;

let pool = null;          // Postgres 连接池
let fileState = null;     // 文件模式下的账号数据
let fileQueue = Promise.resolve(); // 串行化文件写入，避免并发覆盖

const newId = prefix => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

/* ------------------------------------------------------------------ */
/* Postgres                                                            */
/* ------------------------------------------------------------------ */

async function pgInit() {
  const { Pool } = require('pg');
  const needSsl = /sslmode=require|sslmode=prefer/.test(DATABASE_URL);
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: needSsl ? { rejectUnauthorized: false } : false,
    max: 5
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      credit_code TEXT,
      contact     TEXT,
      phone       TEXT,
      email       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name  TEXT,
      role          TEXT NOT NULL DEFAULT 'admin',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS tenant_data (
      company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      payload    JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
  `);
}

/* ------------------------------------------------------------------ */
/* 本地文件                                                            */
/* ------------------------------------------------------------------ */

const files = {
  accounts: path.join(DATA_DIR, 'accounts.json'),
  tenants: path.join(DATA_DIR, 'tenants')
};

async function fileInit() {
  await fsp.mkdir(files.tenants, { recursive: true });
  try {
    fileState = JSON.parse(await fsp.readFile(files.accounts, 'utf8'));
  } catch (e) {
    fileState = { companies: {}, users: {}, sessions: {} };
  }
  fileState.companies ||= {};
  fileState.users ||= {};
  fileState.sessions ||= {};
}

/** 原子写：先写临时文件再重命名，避免进程中断产生半截 JSON */
async function writeJsonAtomic(target, data) {
  const tmp = `${target}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, target);
}

function withFileLock(task) {
  const run = fileQueue.then(task, task);
  fileQueue = run.catch(() => {});
  return run;
}

const tenantFile = companyId => path.join(files.tenants, `${companyId}.json`);

/* ------------------------------------------------------------------ */
/* 对外接口                                                            */
/* ------------------------------------------------------------------ */

async function init() {
  if (USE_PG) await pgInit();
  else await fileInit();
  return { driver: USE_PG ? 'postgres' : 'file' };
}

async function createAccount({ company, user, payload }) {
  const companyId = newId('com');
  const userId = newId('usr');
  const now = new Date().toISOString();

  if (USE_PG) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO companies (id,name,credit_code,contact,phone,email) VALUES ($1,$2,$3,$4,$5,$6)`,
        [companyId, company.name, company.creditCode || null, company.contact || null,
          company.phone || null, company.email || null]
      );
      await client.query(
        `INSERT INTO users (id,company_id,username,password_hash,display_name,role) VALUES ($1,$2,$3,$4,$5,$6)`,
        [userId, companyId, user.username, user.passwordHash, user.displayName || '管理员', 'admin']
      );
      await client.query(
        `INSERT INTO tenant_data (company_id,payload) VALUES ($1,$2)`,
        [companyId, JSON.stringify(payload)]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } else {
    await withFileLock(async () => {
      fileState.companies[companyId] = {
        id: companyId, name: company.name, creditCode: company.creditCode || '',
        contact: company.contact || '', phone: company.phone || '',
        email: company.email || '', createdAt: now
      };
      fileState.users[userId] = {
        id: userId, companyId, username: user.username,
        passwordHash: user.passwordHash, displayName: user.displayName || '管理员',
        role: 'admin', createdAt: now
      };
      await writeJsonAtomic(files.accounts, fileState);
      await writeJsonAtomic(tenantFile(companyId), payload);
    });
  }
  return { companyId, userId };
}

async function findUserByUsername(username) {
  if (USE_PG) {
    const { rows } = await pool.query(
      `SELECT id, company_id, username, password_hash, display_name, role FROM users WHERE lower(username)=lower($1)`,
      [username]
    );
    return rows[0] ? mapPgUser(rows[0]) : null;
  }
  const found = Object.values(fileState.users).find(u => u.username.toLowerCase() === String(username).toLowerCase());
  return found ? { ...found } : null;
}

async function getCompany(companyId) {
  if (USE_PG) {
    const { rows } = await pool.query(
      `SELECT id,name,credit_code,contact,phone,email,created_at FROM companies WHERE id=$1`, [companyId]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id, name: r.name, creditCode: r.credit_code, contact: r.contact,
      phone: r.phone, email: r.email, createdAt: r.created_at
    };
  }
  return fileState.companies[companyId] ? { ...fileState.companies[companyId] } : null;
}

async function createSession(userId, ttlMs) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs);
  if (USE_PG) {
    await pool.query(`INSERT INTO sessions (token,user_id,expires_at) VALUES ($1,$2,$3)`, [token, userId, expiresAt]);
    // 顺带清理过期会话，避免表无限增长
    await pool.query(`DELETE FROM sessions WHERE expires_at < now()`);
  } else {
    await withFileLock(async () => {
      fileState.sessions[token] = { userId, expiresAt: expiresAt.toISOString() };
      const now = Date.now();
      for (const [t, s] of Object.entries(fileState.sessions)) {
        if (new Date(s.expiresAt).getTime() < now) delete fileState.sessions[t];
      }
      await writeJsonAtomic(files.accounts, fileState);
    });
  }
  return { token, expiresAt };
}

async function findSession(token) {
  if (!token) return null;
  if (USE_PG) {
    const { rows } = await pool.query(
      `SELECT s.token, s.expires_at, u.id AS user_id, u.username, u.display_name, u.role, u.company_id
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > now()`,
      [token]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      token: r.token,
      user: { id: r.user_id, username: r.username, displayName: r.display_name, role: r.role, companyId: r.company_id }
    };
  }
  const s = fileState.sessions[token];
  if (!s || new Date(s.expiresAt).getTime() < Date.now()) return null;
  const u = fileState.users[s.userId];
  if (!u) return null;
  return {
    token,
    user: { id: u.id, username: u.username, displayName: u.displayName, role: u.role, companyId: u.companyId }
  };
}

async function deleteSession(token) {
  if (!token) return;
  if (USE_PG) {
    await pool.query(`DELETE FROM sessions WHERE token=$1`, [token]);
    return;
  }
  await withFileLock(async () => {
    delete fileState.sessions[token];
    await writeJsonAtomic(files.accounts, fileState);
  });
}

const EMPTY_DB = () => ({
  clients: [], products: [], projects: [], tasks: [], movements: [], invoices: [], payments: []
});

async function getTenantData(companyId) {
  if (USE_PG) {
    const { rows } = await pool.query(`SELECT payload FROM tenant_data WHERE company_id=$1`, [companyId]);
    return rows[0] ? rows[0].payload : EMPTY_DB();
  }
  try {
    return JSON.parse(await fsp.readFile(tenantFile(companyId), 'utf8'));
  } catch (e) {
    return EMPTY_DB();
  }
}

async function putTenantData(companyId, payload) {
  if (USE_PG) {
    await pool.query(
      `INSERT INTO tenant_data (company_id,payload,updated_at) VALUES ($1,$2,now())
       ON CONFLICT (company_id) DO UPDATE SET payload=EXCLUDED.payload, updated_at=now()`,
      [companyId, JSON.stringify(payload)]
    );
    return;
  }
  await withFileLock(() => writeJsonAtomic(tenantFile(companyId), payload));
}

function mapPgUser(r) {
  return {
    id: r.id, companyId: r.company_id, username: r.username,
    passwordHash: r.password_hash, displayName: r.display_name, role: r.role
  };
}

module.exports = {
  init, createAccount, findUserByUsername, getCompany,
  createSession, findSession, deleteSession,
  getTenantData, putTenantData, EMPTY_DB,
  get driver() { return USE_PG ? 'postgres' : 'file'; }
};
