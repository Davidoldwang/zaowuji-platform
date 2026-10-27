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
const resetCodes = new Map();      // 找回密码验证码（文件模式，内存态，重启即失效）

const newId = prefix => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

const hashSecret = value => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(String(value), salt, 64).toString('hex')}`;
};
const verifySecret = (value, stored) => {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, key] = parts;
  const candidate = crypto.scryptSync(String(value), salt, 64);
  const expected = Buffer.from(key, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
};

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
    CREATE TABLE IF NOT EXISTS audit_logs (
      id         BIGSERIAL PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      actor      TEXT NOT NULL,
      role       TEXT NOT NULL,
      action     TEXT NOT NULL,
      target     TEXT NOT NULL DEFAULT '',
      detail     TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact    TEXT NOT NULL,
      code_hash  TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts   INT NOT NULL DEFAULT 0,
      used       BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
    CREATE INDEX IF NOT EXISTS idx_audit_company_time ON audit_logs(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_resets_contact ON password_resets(contact, created_at DESC);
  `);
  // 兼容早期版本：补充员工账号相关字段，并把全局唯一用户名改为「公司内唯一」
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(32);
  `);
  await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key`).catch(() => {});
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_company_username ON users (company_id, lower(username))
  `).catch(error => console.warn('[store] 用户名唯一索引创建失败：', error.message));
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
        `INSERT INTO users (id,company_id,username,password_hash,display_name,role,email,phone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [userId, companyId, user.username, user.passwordHash, user.displayName || '管理员', 'admin',
          user.email || null, user.phone || null]
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
        role: 'admin', staffId: null, status: 'active',
        email: user.email || '', phone: user.phone || '', createdAt: now
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
      `SELECT id, company_id, username, password_hash, display_name, role, staff_id, status, email, phone FROM users WHERE lower(username)=lower($1)`,
      [username]
    );
    return rows[0] ? mapPgUser(rows[0]) : null;
  }
  const found = Object.values(fileState.users).find(u => u.username.toLowerCase() === String(username).toLowerCase());
  return found ? { ...found } : null;
}

/** 允许用公司名称直接登录：按公司名找到该公司的管理员账号 */
async function findUserByCompanyName(companyName) {
  if (USE_PG) {
    const { rows } = await pool.query(
      `SELECT u.id, u.company_id, u.username, u.password_hash, u.display_name, u.role, u.staff_id, u.status, u.email, u.phone
         FROM users u JOIN companies c ON c.id = u.company_id
        WHERE lower(c.name) = lower($1)
        ORDER BY u.created_at ASC LIMIT 1`,
      [companyName]
    );
    return rows[0] ? mapPgUser(rows[0]) : null;
  }
  const target = String(companyName || '').toLowerCase();
  const company = Object.values(fileState.companies).find(c => String(c.name).toLowerCase() === target);
  if (!company) return null;
  const user = Object.values(fileState.users)
    .filter(u => u.companyId === company.id)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
  return user ? { ...user } : null;
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
      `SELECT s.token, s.expires_at, u.id AS user_id, u.username, u.display_name, u.role,
              u.company_id, u.staff_id, u.status
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > now()`,
      [token]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    if (r.status === 'disabled') return null;
    return {
      token: r.token,
      user: {
        id: r.user_id, username: r.username, displayName: r.display_name, role: r.role,
        companyId: r.company_id, staffId: r.staff_id || null
      }
    };
  }
  const s = fileState.sessions[token];
  if (!s || new Date(s.expiresAt).getTime() < Date.now()) return null;
  const u = fileState.users[s.userId];
  if (!u || u.status === 'disabled') return null;
  return {
    token,
    user: {
      id: u.id, username: u.username, displayName: u.displayName, role: u.role,
      companyId: u.companyId, staffId: u.staffId || null
    }
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
  clients: [], products: [], projects: [], tasks: [], movements: [], invoices: [], payments: [],
  staff: [], handovers: []
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

/* ------------------------------------------------------------------ */
/* 成员账号（店长 / 员工）                                             */
/* ------------------------------------------------------------------ */

const AUDIT_DIR = path.join(DATA_DIR, 'audit');
const AUDIT_KEEP = 2000;

const mapMember = u => ({
  id: u.id, companyId: u.companyId, username: u.username, displayName: u.displayName,
  role: u.role, staffId: u.staffId || null, status: u.status || 'active',
  email: u.email || '', phone: u.phone || '', createdAt: u.createdAt
});

async function findCompanyByName(companyName) {
  const target = String(companyName || '').trim();
  if (!target) return null;
  if (USE_PG) {
    const { rows } = await pool.query(
      `SELECT id,name FROM companies WHERE lower(name)=lower($1) LIMIT 1`, [target]
    );
    return rows[0] || null;
  }
  const hit = Object.values(fileState.companies).find(c => String(c.name).toLowerCase() === target.toLowerCase());
  return hit ? { id: hit.id, name: hit.name } : null;
}

/** 公司管理员账号（企业登录入口使用） */
async function findCompanyAdmin(companyName) {
  const company = await findCompanyByName(companyName);
  if (!company) return null;
  if (USE_PG) {
    const { rows } = await pool.query(
      `SELECT id, company_id, username, password_hash, display_name, role, staff_id, status, email, phone
         FROM users WHERE company_id=$1 AND role='admin' ORDER BY created_at ASC LIMIT 1`, [company.id]
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id, companyId: rows[0].company_id, username: rows[0].username,
      passwordHash: rows[0].password_hash, displayName: rows[0].display_name,
      role: rows[0].role, staffId: rows[0].staff_id || null, status: rows[0].status,
      email: rows[0].email || '', phone: rows[0].phone || ''
    };
  }
  const hit = Object.values(fileState.users)
    .filter(u => u.companyId === company.id && u.role === 'admin')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
  return hit ? { ...hit, status: hit.status || 'active', email: hit.email || '', phone: hit.phone || '' } : null;
}

/** 公司内按账号查找成员（员工登录入口使用） */
async function findCompanyMember(companyId, username) {
  const name = String(username || '').trim();
  if (!companyId || !name) return null;
  if (USE_PG) {
    const { rows } = await pool.query(
      `SELECT id, company_id, username, password_hash, display_name, role, staff_id, status, email, phone
         FROM users WHERE company_id=$1 AND lower(username)=lower($2) LIMIT 1`, [companyId, name]
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id, companyId: rows[0].company_id, username: rows[0].username,
      passwordHash: rows[0].password_hash, displayName: rows[0].display_name,
      role: rows[0].role, staffId: rows[0].staff_id || null, status: rows[0].status,
      email: rows[0].email || '', phone: rows[0].phone || ''
    };
  }
  const hit = Object.values(fileState.users)
    .find(u => u.companyId === companyId && u.username.toLowerCase() === name.toLowerCase());
  return hit ? { ...hit, status: hit.status || 'active', email: hit.email || '', phone: hit.phone || '' } : null;
}

async function listMembers(companyId) {
  if (USE_PG) {
    const { rows } = await pool.query(
      `SELECT id, company_id, username, display_name, role, staff_id, status, email, phone, created_at
         FROM users WHERE company_id=$1 ORDER BY created_at ASC`, [companyId]
    );
    return rows.map(r => ({
      id: r.id, companyId: r.company_id, username: r.username, displayName: r.display_name,
      role: r.role, staffId: r.staff_id || null, status: r.status,
      email: r.email || '', phone: r.phone || '', createdAt: r.created_at
    }));
  }
  return Object.values(fileState.users)
    .filter(u => u.companyId === companyId)
    .map(mapMember);
}

async function createMember({ companyId, username, passwordHash, displayName, role, staffId, email, phone }) {
  const id = newId('usr');
  const now = new Date().toISOString();
  const existed = await findCompanyMember(companyId, username);
  if (existed) return { error: '该员工账号已存在，请换一个' };
  if (USE_PG) {
    await pool.query(
      `INSERT INTO users (id,company_id,username,password_hash,display_name,role,staff_id,status,email,phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9)`,
      [id, companyId, username, passwordHash, displayName, role, staffId || null, email || null, phone || null]
    );
    return { id };
  }
  await withFileLock(async () => {
    fileState.users[id] = {
      id, companyId, username, passwordHash, displayName, role,
      staffId: staffId || null, status: 'active',
      email: email || '', phone: phone || '', createdAt: now
    };
    await writeJsonAtomic(files.accounts, fileState);
  });
  return { id };
}

async function updateMember(companyId, memberId, patch = {}) {
  const sets = [];
  const values = [];
  if (USE_PG) {
    let i = 1;
    if (patch.passwordHash) { sets.push(`password_hash=$${i++}`); values.push(patch.passwordHash); }
    if (patch.displayName !== undefined) { sets.push(`display_name=$${i++}`); values.push(patch.displayName); }
    if (patch.role) { sets.push(`role=$${i++}`); values.push(patch.role); }
    if (patch.staffId !== undefined) { sets.push(`staff_id=$${i++}`); values.push(patch.staffId || null); }
    if (patch.status) { sets.push(`status=$${i++}`); values.push(patch.status); }
    if (patch.email !== undefined) { sets.push(`email=$${i++}`); values.push(patch.email || null); }
    if (patch.phone !== undefined) { sets.push(`phone=$${i++}`); values.push(patch.phone || null); }
    if (!sets.length) return;
    values.push(memberId, companyId);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id=$${i++} AND company_id=$${i}`, values);
    // 停用账号时同时清掉已登录会话
    if (patch.status === 'disabled' || patch.passwordHash) {
      await pool.query(`DELETE FROM sessions WHERE user_id=$1`, [memberId]);
    }
    return;
  }
  await withFileLock(async () => {
    const u = fileState.users[memberId];
    if (!u || u.companyId !== companyId) return;
    if (patch.passwordHash) u.passwordHash = patch.passwordHash;
    if (patch.displayName !== undefined) u.displayName = patch.displayName;
    if (patch.role) u.role = patch.role;
    if (patch.staffId !== undefined) u.staffId = patch.staffId || null;
    if (patch.status) u.status = patch.status;
    if (patch.email !== undefined) u.email = patch.email || '';
    if (patch.phone !== undefined) u.phone = patch.phone || '';
    if (patch.status === 'disabled' || patch.passwordHash) {
      for (const [token, s] of Object.entries(fileState.sessions)) {
        if (s.userId === memberId) delete fileState.sessions[token];
      }
    }
    await writeJsonAtomic(files.accounts, fileState);
  });
}

async function deleteMember(companyId, memberId) {
  if (USE_PG) {
    await pool.query(`DELETE FROM users WHERE id=$1 AND company_id=$2 AND role<>'admin'`, [memberId, companyId]);
    return;
  }
  await withFileLock(async () => {
    const u = fileState.users[memberId];
    if (!u || u.companyId !== companyId || u.role === 'admin') return;
    delete fileState.users[memberId];
    for (const [token, s] of Object.entries(fileState.sessions)) {
      if (s.userId === memberId) delete fileState.sessions[token];
    }
    await writeJsonAtomic(files.accounts, fileState);
  });
}

/* ------------------------------------------------------------------ */
/* 操作记录（审计日志）                                                */
/* ------------------------------------------------------------------ */

const auditFile = companyId => path.join(AUDIT_DIR, `${companyId}.json`);

async function addAuditLogs(companyId, entries) {
  const rows = (Array.isArray(entries) ? entries : []).slice(0, 50).map(e => ({
    actor: String(e.actor || '未知').slice(0, 40),
    role: String(e.role || 'staff').slice(0, 16),
    action: String(e.action || 'view').slice(0, 16),
    target: String(e.target || '').slice(0, 120),
    detail: String(e.detail || '').slice(0, 240),
    at: new Date().toISOString()
  }));
  if (!rows.length) return;
  if (USE_PG) {
    const values = [];
    const spots = rows.map((r, i) => {
      const b = i * 6;
      values.push(companyId, r.actor, r.role, r.action, r.target, r.detail);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`;
    });
    await pool.query(
      `INSERT INTO audit_logs (company_id,actor,role,action,target,detail) VALUES ${spots.join(',')}`,
      values
    );
    return;
  }
  await withFileLock(async () => {
    await fsp.mkdir(AUDIT_DIR, { recursive: true });
    let list = [];
    try { list = JSON.parse(await fsp.readFile(auditFile(companyId), 'utf8')); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    list.push(...rows);
    if (list.length > AUDIT_KEEP) list = list.slice(-AUDIT_KEEP);
    await writeJsonAtomic(auditFile(companyId), list);
  });
}

async function listAuditLogs(companyId, { limit = 200, action = '', keyword = '' } = {}) {
  const max = Math.min(Math.max(Number(limit) || 200, 1), 500);
  let list = [];
  if (USE_PG) {
    const cond = ['company_id=$1'];
    const values = [companyId];
    if (action) { values.push(action); cond.push(`action=$${values.length}`); }
    if (keyword) { values.push(`%${keyword}%`); cond.push(`(target ILIKE $${values.length} OR detail ILIKE $${values.length} OR actor ILIKE $${values.length})`); }
    values.push(max);
    const { rows } = await pool.query(
      `SELECT id, actor, role, action, target, detail, created_at FROM audit_logs
        WHERE ${cond.join(' AND ')} ORDER BY created_at DESC LIMIT $${values.length}`, values
    );
    return rows.map(r => ({
      id: String(r.id), actor: r.actor, role: r.role, action: r.action,
      target: r.target, detail: r.detail, at: r.created_at
    }));
  }
  try { list = JSON.parse(await fsp.readFile(auditFile(companyId), 'utf8')); } catch (e) { list = []; }
  if (!Array.isArray(list)) list = [];
  let rows = [...list].reverse();
  if (action) rows = rows.filter(r => r.action === action);
  if (keyword) {
    const k = String(keyword).toLowerCase();
    rows = rows.filter(r => `${r.actor}${r.target}${r.detail}`.toLowerCase().includes(k));
  }
  return rows.slice(0, max).map((r, i) => ({ ...r, id: `${r.at}-${i}` }));
}

/** 员工更新自己负责的任务（只允许改状态与进度） */
async function updateTenantTask(companyId, taskId, patch, actorName) {
  const data = await getTenantData(companyId);
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const task = tasks.find(t => t.id === taskId);
  if (!task) return { error: 'notfound' };
  if (String(task.owner) !== String(actorName)) return { error: 'forbidden' };
  if (patch.status) task.status = patch.status;
  if (patch.progress !== undefined) task.progress = Math.max(0, Math.min(100, Number(patch.progress) || 0));
  if (task.status === '已完成') task.progress = 100;
  data.tasks = tasks;
  await putTenantData(companyId, data);
  return { task };
}

function mapPgUser(r) {
  return {
    id: r.id, companyId: r.company_id, username: r.username,
    passwordHash: r.password_hash, displayName: r.display_name, role: r.role,
    staffId: r.staff_id || null, status: r.status || 'active',
    email: r.email || '', phone: r.phone || ''
  };
}

/* ------------------------------------------------------------------ */
/* 账号自助：读取本人、修改联系方式、修改密码、找回密码验证码           */
/* ------------------------------------------------------------------ */

async function getUserById(userId) {
  if (USE_PG) {
    const { rows } = await pool.query(
      `SELECT id, company_id, username, password_hash, display_name, role, staff_id, status, email, phone, created_at
         FROM users WHERE id=$1`, [userId]
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id, companyId: rows[0].company_id, username: rows[0].username,
      passwordHash: rows[0].password_hash, displayName: rows[0].display_name,
      role: rows[0].role, staffId: rows[0].staff_id || null, status: rows[0].status,
      email: rows[0].email || '', phone: rows[0].phone || '', createdAt: rows[0].created_at
    };
  }
  const u = fileState.users[userId];
  return u ? { ...u, status: u.status || 'active', email: u.email || '', phone: u.phone || '' } : null;
}

async function updateUserProfile(userId, patch = {}) {
  if (USE_PG) {
    const sets = [];
    const values = [];
    let i = 1;
    if (patch.email !== undefined) { sets.push(`email=$${i++}`); values.push(patch.email || null); }
    if (patch.phone !== undefined) { sets.push(`phone=$${i++}`); values.push(patch.phone || null); }
    if (!sets.length) return;
    values.push(userId);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id=$${i}`, values);
    return;
  }
  await withFileLock(async () => {
    const u = fileState.users[userId];
    if (!u) return;
    if (patch.email !== undefined) u.email = patch.email || '';
    if (patch.phone !== undefined) u.phone = patch.phone || '';
    await writeJsonAtomic(files.accounts, fileState);
  });
}

/** 修改本人密码：更新哈希，并清除该用户除当前会话外的其它登录态 */
async function changeUserPassword(userId, passwordHash, keepToken) {
  if (USE_PG) {
    await pool.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [passwordHash, userId]);
    await pool.query(`DELETE FROM sessions WHERE user_id=$1 AND token<>$2`, [userId, keepToken || '']);
    return;
  }
  await withFileLock(async () => {
    const u = fileState.users[userId];
    if (!u) return;
    u.passwordHash = passwordHash;
    for (const [token, s] of Object.entries(fileState.sessions)) {
      if (s.userId === userId && token !== keepToken) delete fileState.sessions[token];
    }
    await writeJsonAtomic(files.accounts, fileState);
  });
}

async function createResetCode(userId, contact) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const id = newId('rst');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  if (USE_PG) {
    await pool.query(`DELETE FROM password_resets WHERE contact=$1`, [contact]);
    await pool.query(
      `INSERT INTO password_resets (id,user_id,contact,code_hash,expires_at) VALUES ($1,$2,$3,$4,$5)`,
      [id, userId, contact, hashSecret(code), expiresAt]
    );
    return code;
  }
  resetCodes.set(contact, {
    userId, codeHash: hashSecret(code), expiresAt: expiresAt.toISOString(), attempts: 0, used: false
  });
  return code;
}

async function consumeResetCode(contact, code, newPasswordHash) {
  if (USE_PG) {
    const { rows } = await pool.query(
      `SELECT id, user_id, code_hash, expires_at, attempts, used FROM password_resets WHERE contact=$1`, [contact]
    );
    const r = rows[0];
    if (!r) return { error: '验证码无效，请重新获取' };
    if (r.used) return { error: '验证码已被使用，请重新获取' };
    if (new Date(r.expires_at).getTime() < Date.now()) return { error: '验证码已过期，请重新获取' };
    if (r.attempts >= 5) return { error: '尝试次数过多，请重新获取验证码' };
    if (!verifySecret(code, r.code_hash)) {
      await pool.query(`UPDATE password_resets SET attempts=attempts+1 WHERE id=$1`, [r.id]);
      return { error: '验证码不正确' };
    }
    await pool.query(`UPDATE password_resets SET used=true WHERE id=$1`, [r.id]);
    await pool.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [newPasswordHash, r.user_id]);
    await pool.query(`DELETE FROM sessions WHERE user_id=$1`, [r.user_id]);
    return { ok: true, userId: r.user_id };
  }
  const rec = resetCodes.get(contact);
  if (!rec) return { error: '验证码无效，请重新获取' };
  if (rec.used) return { error: '验证码已被使用，请重新获取' };
  if (new Date(rec.expiresAt).getTime() < Date.now()) return { error: '验证码已过期，请重新获取' };
  if (rec.attempts >= 5) return { error: '尝试次数过多，请重新获取验证码' };
  if (!verifySecret(code, rec.codeHash)) { rec.attempts += 1; return { error: '验证码不正确' }; }
  rec.used = true;
  await withFileLock(async () => {
    const u = fileState.users[rec.userId];
    if (u) {
      u.passwordHash = newPasswordHash;
      for (const [token, s] of Object.entries(fileState.sessions)) {
        if (s.userId === rec.userId) delete fileState.sessions[token];
      }
      await writeJsonAtomic(files.accounts, fileState);
    }
  });
  return { ok: true, userId: rec.userId };
}

module.exports = {
  init, createAccount, findUserByUsername, findUserByCompanyName, getCompany,
  createSession, findSession, deleteSession,
  getTenantData, putTenantData, EMPTY_DB,
  findCompanyByName, findCompanyAdmin, findCompanyMember,
  listMembers, createMember, updateMember, deleteMember,
  addAuditLogs, listAuditLogs, updateTenantTask,
  getUserById, updateUserProfile, changeUserPassword, createResetCode, consumeResetCode,
  get driver() { return USE_PG ? 'postgres' : 'file'; }
};
