// A Supabase-compatible front end over a plain Postgres holding the real
// migration history. It exists so the signed-in UI can be driven in a browser:
// every request opens a transaction, SETs the caller's role and JWT claims, and
// lets Postgres enforce the same row policies the hosted project would.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pgpkg from 'pg';

const { Pool, types } = pgpkg;
// PostgREST renders numeric and bigint as JSON numbers. node-postgres hands
// them back as strings to preserve precision, and a string that reaches a
// `reduce((a, b) => a + b, 0)` concatenates — which surfaces as a twenty-digit
// average on the patient's own screen and reads exactly like an app bug.
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));   // numeric
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));     // int8
types.setTypeParser(700, (v) => (v === null ? null : Number(v)));    // float4
types.setTypeParser(701, (v) => (v === null ? null : Number(v)));    // float8
const PORT = Number(process.env.SHIM_PORT || 54321);
const SECRET = 'shim-jwt-secret-not-a-real-one';
const FILES = process.env.SHIM_FILES || '/tmp/onecare-shim-storage';
fs.mkdirSync(FILES, { recursive: true });

const pool = new Pool({
  host: '127.0.0.1', user: 'postgres',
  database: process.env.SHIM_DB || 'onecare_live', max: 10,
});

// ---------------------------------------------------------------- JWT
const b64 = (buf) => Buffer.from(buf).toString('base64url');
function sign(payload) {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${mac}`;
}
function verify(token) {
  try {
    const [h, b, m] = String(token).split('.');
    const want = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url');
    if (m !== want) return null;
    const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch { return null; }
}
function claimsFor(user) {
  const now = Math.floor(Date.now() / 1000);
  return {
    aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 3600,
    sub: user.id, email: user.email, phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: user.raw_user_meta_data || {},
    session_id: crypto.randomUUID(),
  };
}
function sessionFor(user) {
  const c = claimsFor(user);
  return {
    access_token: sign(c), token_type: 'bearer', expires_in: 3600,
    expires_at: c.exp, refresh_token: `refresh-${user.id}`,
    user: apiUser(user),
  };
}
function apiUser(u) {
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
    email_confirmed_at: u.email_confirmed_at || new Date().toISOString(),
    phone: '', confirmed_at: u.email_confirmed_at || new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: u.raw_user_meta_data || {},
    identities: [], created_at: u.created_at, updated_at: u.created_at,
    is_anonymous: false,
  };
}

// ------------------------------------------------- schema introspection
let fkCache = null;
async function foreignKeys() {
  if (fkCache) return fkCache;
  const { rows } = await pool.query(`
    SELECT con.conname AS name,
           src.relname AS src_table, srcatt.attname AS src_col,
           tgt.relname AS tgt_table, tgtatt.attname AS tgt_col
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_class tgt ON tgt.oid = con.confrelid
      JOIN pg_namespace n ON n.oid = src.relnamespace
      JOIN pg_attribute srcatt ON srcatt.attrelid = con.conrelid AND srcatt.attnum = con.conkey[1]
      JOIN pg_attribute tgtatt ON tgtatt.attrelid = con.confrelid AND tgtatt.attnum = con.confkey[1]
     WHERE con.contype = 'f' AND n.nspname = 'public'`);
  fkCache = rows;
  return rows;
}
const colCache = new Map();
async function columnTypes(table) {
  if (colCache.has(table)) return colCache.get(table);
  const { rows } = await pool.query(`
    SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = $1 AND a.attnum > 0 AND NOT a.attisdropped`,
    [table]);
  const map = new Map(rows.map((r) => [r.name, r.type]));
  colCache.set(table, map);
  return map;
}

let procCache = null;
async function procs() {
  if (procCache) return procCache;
  // Argument types matter: PostgREST casts a JSON body to each parameter's
  // declared type, so a uuid[] parameter given ["..."] arrives as an array.
  // Passing the JSON text through instead produces "malformed array literal",
  // which reads exactly like an application bug.
  const { rows } = await pool.query(`
    SELECT p.proname AS name, p.proretset AS retset, t.typtype AS rettype, t.typname AS retname,
           coalesce(p.proargnames, '{}') AS argnames,
           (SELECT array_agg(format_type(a, NULL) ORDER BY i)
              FROM unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) WITH ORDINALITY AS u(a, i)) AS argtypes
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_type t ON t.oid = p.prorettype
     WHERE n.nspname = 'public'`);
  procCache = new Map(rows.map((r) => [r.name, r]));
  return procCache;
}

// -------------------------------------------------- PostgREST filtering
const OPS = {
  eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
  like: 'LIKE', ilike: 'ILIKE', match: '~', imatch: '~*',
};

function litOf(raw) {
  // PostgREST quotes values containing reserved characters with double quotes.
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length > 1) return raw.slice(1, -1);
  return raw;
}

// Split on commas that are not inside parentheses — used for both the select
// list and or=(...) groups, where a naive split breaks every embed.
function splitTop(text) {
  const out = []; let depth = 0, cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function condition(col, spec, params, types) {
  const colType = types?.get(col) || null;
  const cast = (hole) => (colType ? `${hole}::${colType}` : hole);
  let negate = false;
  let rest = spec;
  if (rest.startsWith('not.')) { negate = true; rest = rest.slice(4); }
  const dot = rest.indexOf('.');
  const op = dot === -1 ? rest : rest.slice(0, dot);
  const val = dot === -1 ? '' : rest.slice(dot + 1);
  const q = `"${col.replace(/"/g, '')}"`;
  let sql;
  if (op === 'is') {
    const v = val.toLowerCase();
    sql = `${q} IS ${v === 'null' ? 'NULL' : v === 'true' ? 'TRUE' : v === 'false' ? 'FALSE' : 'NULL'}`;
  } else if (op === 'in') {
    const inner = val.replace(/^\(/, '').replace(/\)$/, '');
    const items = inner.length ? splitTop(inner).map(litOf) : [];
    if (!items.length) return { sql: 'FALSE', params };
    const holes = items.map((v) => { params.push(v); return cast(`$${params.length}`); });
    sql = `${q} IN (${holes.join(',')})`;
  } else if (op === 'cs') {
    params.push(val.replace(/^\{/, '{').replace(/\}$/, '}'));
    sql = `${q} @> $${params.length}`;
  } else if (op === 'ov') {
    params.push(val);
    sql = `${q} && $${params.length}`;
  } else if (op === 'like' || op === 'ilike' || op === 'match' || op === 'imatch') {
    params.push(litOf(val));
    sql = `${q}::text ${OPS[op]} $${params.length}`;
  } else if (OPS[op]) {
    params.push(litOf(val));
    sql = `${q} ${OPS[op]} ${cast(`$${params.length}`)}`;
  } else {
    return null;
  }
  return { sql: negate ? `NOT (${sql})` : sql, params };
}

function orGroup(text, params, types) {
  const inner = text.replace(/^\(/, '').replace(/\)$/, '');
  const parts = splitTop(inner).map((p) => {
    const dot = p.indexOf('.');
    const col = p.slice(0, dot);
    const c = condition(col, p.slice(dot + 1), params, types);
    return c ? c.sql : 'TRUE';
  });
  return `(${parts.join(' OR ')})`;
}

function buildWhere(params_, url, types) {
  const where = []; const params = params_;
  for (const [key, value] of url.searchParams.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    if (key === 'or') { where.push(orGroup(value, params, types)); continue; }
    if (key === 'and') { where.push(orGroup(value, params, types).replace(/ OR /g, ' AND ')); continue; }
    const c = condition(key, value, params, types);
    if (c) where.push(c.sql);
  }
  return where;
}

function buildOrder(url) {
  const raw = url.searchParams.get('order');
  if (!raw) return '';
  const parts = raw.split(',').map((p) => {
    const [col, ...mods] = p.split('.');
    const dir = mods.includes('desc') ? 'DESC' : 'ASC';
    const nulls = mods.includes('nullsfirst') ? ' NULLS FIRST'
      : mods.includes('nullslast') ? ' NULLS LAST' : '';
    return `"${col.replace(/"/g, '')}" ${dir}${nulls}`;
  });
  return ` ORDER BY ${parts.join(', ')}`;
}

// Split a select list into scalar columns and embedded relations.
function parseSelect(raw) {
  if (!raw) return { cols: ['*'], embeds: [] };
  const cols = []; const embeds = [];
  for (const item of splitTop(raw)) {
    const open = item.indexOf('(');
    if (open === -1) {
      const [lhs, rhs] = item.split(':');
      cols.push(rhs ? `"${rhs.trim()}" AS "${lhs.trim()}"` : (lhs.trim() === '*' ? '*' : `"${lhs.trim()}"`));
      continue;
    }
    const head = item.slice(0, open).trim();
    const body = item.slice(open + 1, item.lastIndexOf(')'));
    const [aliasPart, tablePart] = head.includes(':') ? head.split(':') : [null, head];
    let table = (tablePart || head).trim();
    let inner = false;
    if (table.includes('!')) {
      const [t, hint] = table.split('!');
      table = t.trim();
      inner = hint.trim() === 'inner';
    }
    embeds.push({ alias: (aliasPart || table).trim(), table, select: body, inner });
  }
  return { cols: cols.length ? cols : ['*'], embeds };
}

async function attachEmbeds(client, table, rows, embeds) {
  if (!rows.length || !embeds.length) return rows;
  const fks = await foreignKeys();
  for (const emb of embeds) {
    const child = fks.find((f) => f.src_table === emb.table && f.tgt_table === table);
    const parent = fks.find((f) => f.src_table === table && f.tgt_table === emb.table);
    const sub = parseSelect(emb.select);
    const subCols = sub.cols.includes('*') ? ['*'] : sub.cols;
    if (child) {
      const keys = [...new Set(rows.map((r) => r[child.tgt_col]).filter((v) => v != null))];
      let kids = [];
      if (keys.length) {
        const { rows: k } = await client.query(
          `SELECT ${subCols.join(', ')}, "${child.src_col}" AS __fk FROM public."${emb.table}" WHERE "${child.src_col}" = ANY($1)`,
          [keys],
        );
        kids = await attachEmbeds(client, emb.table, k, sub.embeds);
      }
      const byKey = new Map();
      for (const k of kids) {
        const key = String(k.__fk); delete k.__fk;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(k);
      }
      for (const r of rows) r[emb.alias] = byKey.get(String(r[child.tgt_col])) || [];
      if (emb.inner) rows = rows.filter((r) => r[emb.alias].length);
    } else if (parent) {
      const keys = [...new Set(rows.map((r) => r[parent.src_col]).filter((v) => v != null))];
      let parents = [];
      if (keys.length) {
        const { rows: p } = await client.query(
          `SELECT ${subCols.join(', ')}, "${parent.tgt_col}" AS __pk FROM public."${emb.table}" WHERE "${parent.tgt_col}" = ANY($1)`,
          [keys],
        );
        parents = await attachEmbeds(client, emb.table, p, sub.embeds);
      }
      const byKey = new Map(parents.map((p) => { const k = String(p.__pk); delete p.__pk; return [k, p]; }));
      for (const r of rows) r[emb.alias] = byKey.get(String(r[parent.src_col])) || null;
      if (emb.inner) rows = rows.filter((r) => r[emb.alias]);
    } else {
      // No foreign key connects these. The hosted project would refuse the
      // whole request; say so rather than returning rows with a hole in them.
      const err = new Error(`could not find a relationship between '${table}' and '${emb.table}'`);
      err.code = 'PGRST200';
      throw err;
    }
  }
  return rows;
}

// ------------------------------------------------------------ plumbing
function json(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Range, X-Client-Info',
    ...headers,
  });
  res.end(text);
}
function pgError(res, e) {
  const status = e.code === '42501' ? 403
    : e.code === 'PGRST116' ? 406
    : e.code === 'PGRST200' ? 400
    : e.code === '23505' ? 409
    : e.code === '23503' ? 409
    : e.code === 'P0001' ? 400
    : e.code && /^2[23]/.test(e.code) ? 400 : 400;
  json(res, status, {
    code: e.code || 'unknown', message: e.message,
    details: e.detail ?? null, hint: e.hint ?? null,
  });
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function withCaller(req, fn) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const claims = verify(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (claims) {
      await client.query('SET LOCAL ROLE authenticated');
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [claims.sub]);
      await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
      await client.query(`SELECT set_config('request.jwt.claim.email', $1, true)`, [claims.email || '']);
    } else {
      await client.query('SET LOCAL ROLE anon');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'anon', true)`);
    }
    const out = await fn(client, claims);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* the transaction is already gone */ }
    throw e;
  } finally {
    client.release();
  }
}

// --------------------------------------------------------------- auth
async function handleAuth(req, res, url) {
  const body = (await readBody(req)).toString() || '{}';
  const parsed = (() => { try { return JSON.parse(body); } catch { return {}; } })();
  const p = url.pathname.replace('/auth/v1', '');

  if (p === '/token') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const { rows } = await pool.query(
        `SELECT u.* FROM auth.users u JOIN auth.shim_credentials c ON c.user_id = u.id
          WHERE lower(u.email) = lower($1) AND c.password = $2`,
        [parsed.email || '', parsed.password || ''],
      );
      if (!rows.length) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      return json(res, 200, sessionFor(rows[0]));
    }
    if (grant === 'refresh_token') {
      const id = String(parsed.refresh_token || '').replace('refresh-', '');
      const { rows } = await pool.query('SELECT * FROM auth.users WHERE id::text = $1', [id]);
      if (!rows.length) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
      return json(res, 200, sessionFor(rows[0]));
    }
    return json(res, 400, { error: 'unsupported_grant_type' });
  }

  if (p === '/user' && req.method === 'GET') {
    const claims = verify((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!claims) return json(res, 401, { message: 'invalid claim: missing sub claim' });
    const { rows } = await pool.query('SELECT * FROM auth.users WHERE id = $1', [claims.sub]);
    if (!rows.length) return json(res, 404, { message: 'User not found' });
    return json(res, 200, apiUser(rows[0]));
  }

  if (p === '/user' && req.method === 'PUT') {
    const claims = verify((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!claims) return json(res, 401, { message: 'not authenticated' });
    if (parsed.data) {
      await pool.query(
        `UPDATE auth.users SET raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb) || $2::jsonb WHERE id = $1`,
        [claims.sub, JSON.stringify(parsed.data)],
      );
    }
    if (parsed.password) {
      await pool.query('UPDATE auth.shim_credentials SET password = $2 WHERE user_id = $1', [claims.sub, parsed.password]);
    }
    const { rows } = await pool.query('SELECT * FROM auth.users WHERE id = $1', [claims.sub]);
    return json(res, 200, apiUser(rows[0]));
  }

  if (p === '/logout') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }

  if (p === '/signup') {
    const { rows: existing } = await pool.query('SELECT 1 FROM auth.users WHERE lower(email) = lower($1)', [parsed.email || '']);
    if (existing.length) return json(res, 422, { code: 'user_already_exists', message: 'User already registered' });
    const { rows } = await pool.query(
      `INSERT INTO auth.users (email, raw_user_meta_data, email_confirmed_at)
       VALUES ($1, $2::jsonb, now()) RETURNING *`,
      [parsed.email, JSON.stringify((parsed.data ?? parsed.options?.data) || {})],
    );
    await pool.query('INSERT INTO auth.shim_credentials (user_id, email, password) VALUES ($1,$2,$3)',
      [rows[0].id, parsed.email, parsed.password || '']);
    return json(res, 200, sessionFor(rows[0]));
  }

  if (p === '/recover' || p === '/otp' || p === '/verify' || p === '/resend') {
    return json(res, 200, {});
  }
  if (p === '/settings') {
    return json(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
  }
  return json(res, 404, { message: `shim: no auth route ${p}` });
}

// --------------------------------------------------------------- rest
async function handleRest(req, res, url) {
  const rel = url.pathname.replace('/rest/v1/', '');
  const prefer = String(req.headers.prefer || '');
  const wantsOne = String(req.headers.accept || '').includes('vnd.pgrst.object');

  if (rel.startsWith('rpc/')) {
    const name = rel.slice(4);
    const body = (await readBody(req)).toString() || '{}';
    const args = (() => { try { return JSON.parse(body); } catch { return {}; } })();
    const meta = (await procs()).get(name);
    if (!meta) return json(res, 404, { code: 'PGRST202', message: `Could not find the function public.${name}` });
    const names = Object.keys(args);
    const typeOf = (k) => {
      const i = (meta.argnames || []).indexOf(k);
      return i === -1 ? null : (meta.argtypes || [])[i];
    };
    const params = names.map((k) => {
      const v = args[k];
      const t = typeOf(k) || '';
      if (v === null || typeof v !== 'object') return v;
      if (/json/.test(t)) return JSON.stringify(v);
      if (Array.isArray(v)) return v;          // pg renders a Postgres array
      return JSON.stringify(v);
    });
    const call = `public."${name}"(${names.map((k, i) => {
      const t = typeOf(k);
      return `"${k}" => $${i + 1}${t ? `::${t}` : ''}`;
    }).join(', ')})`;
    const setLike = meta.retset || meta.rettype === 'c';
    const sql = setLike
      ? `SELECT coalesce(json_agg(t), '[]'::json) AS r FROM ${call} t`
      : `SELECT to_json(${call}) AS r`;
    try {
      const out = await withCaller(req, async (client) => (await client.query(sql, params)).rows[0].r);
      if (wantsOne && Array.isArray(out)) {
        if (out.length !== 1) return pgError(res, Object.assign(new Error('JSON object requested, multiple (or no) rows returned'), { code: 'PGRST116' }));
        return json(res, 200, out[0]);
      }
      return json(res, 200, out ?? null);
    } catch (e) { return pgError(res, e); }
  }

  const table = rel;
  const { cols, embeds } = parseSelect(url.searchParams.get('select'));
  const scalarCols = cols.filter((c) => c !== '*');
  const selectList = cols.includes('*') || !scalarCols.length ? '*' : [...new Set([...scalarCols, '*'])].includes('*') ? '*' : scalarCols.join(', ');

  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const out = await withCaller(req, async (client) => {
        const params = [];
        const where = buildWhere(params, url, await columnTypes(table));
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        let sql = `SELECT * FROM public."${table}"${clause}${buildOrder(url)}`;
        const limit = url.searchParams.get('limit');
        const offset = url.searchParams.get('offset');
        if (limit) sql += ` LIMIT ${Number(limit)}`;
        if (offset) sql += ` OFFSET ${Number(offset)}`;
        const { rows } = await client.query(sql, params);
        let total = null;
        if (prefer.includes('count=')) {
          const { rows: c } = await client.query(`SELECT count(*)::int AS n FROM public."${table}"${clause}`, params);
          total = c[0].n;
        }
        return { rows: await attachEmbeds(client, table, rows, embeds), total };
      });
      let rows = out.rows;
      if (scalarCols.length && !cols.includes('*')) {
        const keep = scalarCols.map((c) => c.replace(/.*AS\s+"?([^"]+)"?$/i, '$1').replace(/"/g, ''));
        rows = rows.map((r) => {
          const o = {};
          for (const k of keep) o[k] = r[k];
          for (const e of embeds) o[e.alias] = r[e.alias];
          return o;
        });
      }
      const headers = out.total != null
        ? { 'Content-Range': `0-${Math.max(rows.length - 1, 0)}/${out.total}` } : {};
      if (wantsOne) {
        if (rows.length !== 1) {
          return pgError(res, Object.assign(
            new Error(`JSON object requested, multiple (or no) rows returned`),
            { code: 'PGRST116', detail: `Results contain ${rows.length} rows` }));
        }
        return json(res, 200, rows[0], headers);
      }
      return json(res, 200, rows, headers);
    }

    const raw = (await readBody(req)).toString();
    const payload = raw ? JSON.parse(raw) : {};

    if (req.method === 'POST') {
      const list = Array.isArray(payload) ? payload : [payload];
      const rows = await withCaller(req, async (client) => {
        const made = [];
        for (const item of list) {
          const keys = Object.keys(item);
          const vals = keys.map((k) => (item[k] !== null && typeof item[k] === 'object' ? JSON.stringify(item[k]) : item[k]));
          const holes = keys.map((_, i) => `$${i + 1}`);
          let sql = keys.length
            ? `INSERT INTO public."${table}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${holes.join(', ')})`
            : `INSERT INTO public."${table}" DEFAULT VALUES`;
          if (prefer.includes('ignore-duplicates')) {
            const target = url.searchParams.get('on_conflict');
            sql += target
              ? ` ON CONFLICT (${target.split(',').map((c) => `"${c}"`).join(', ')}) DO NOTHING`
              : ' ON CONFLICT DO NOTHING';
          } else if (prefer.includes('merge-duplicates')) {
            const target = url.searchParams.get('on_conflict');
            const conflict = target ? target.split(',').map((c) => `"${c}"`).join(', ') : null;
            sql += conflict
              ? ` ON CONFLICT (${conflict}) DO UPDATE SET ${keys.map((k) => `"${k}" = EXCLUDED."${k}"`).join(', ')}`
              : ' ON CONFLICT DO NOTHING';
          }
          sql += ' RETURNING *';
          const { rows: r } = await client.query(sql, vals);
          made.push(...r);
        }
        return attachEmbeds(client, table, made, embeds);
      });
      if (!prefer.includes('return=representation')) { res.writeHead(201, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }
      return json(res, 201, wantsOne ? (rows[0] ?? null) : rows);
    }

    if (req.method === 'PATCH') {
      const rows = await withCaller(req, async (client) => {
        const keys = Object.keys(payload);
        const params = keys.map((k) => (payload[k] !== null && typeof payload[k] === 'object' ? JSON.stringify(payload[k]) : payload[k]));
        const sets = keys.map((k, i) => `"${k}" = $${i + 1}`);
        const where = buildWhere(params, url, await columnTypes(table));
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const { rows: r } = await client.query(
          `UPDATE public."${table}" SET ${sets.join(', ')}${clause} RETURNING *`, params);
        return attachEmbeds(client, table, r, embeds);
      });
      if (!prefer.includes('return=representation')) { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }
      if (wantsOne && rows.length !== 1) {
        return pgError(res, Object.assign(new Error('JSON object requested, multiple (or no) rows returned'), { code: 'PGRST116' }));
      }
      return json(res, 200, wantsOne ? rows[0] : rows);
    }

    if (req.method === 'DELETE') {
      const rows = await withCaller(req, async (client) => {
        const params = [];
        const where = buildWhere(params, url, await columnTypes(table));
        const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const { rows: r } = await client.query(`DELETE FROM public."${table}"${clause} RETURNING *`, params);
        return r;
      });
      if (!prefer.includes('return=representation')) { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }
      return json(res, 200, rows);
    }
  } catch (e) { return pgError(res, e); }
  return json(res, 405, { message: 'shim: method not handled' });
}

// ------------------------------------------------------------ storage
function diskPath(bucket, name) {
  const safe = name.split('/').map((s) => s.replace(/[^A-Za-z0-9._-]/g, '_')).join('__');
  return path.join(FILES, `${bucket}__${safe}`);
}
async function handleStorage(req, res, url) {
  const p = url.pathname.replace('/storage/v1', '');

  // upload: POST/PUT /object/<bucket>/<path>
  let m = p.match(/^\/object\/(?!(?:sign|list|authenticated|public|info)\b)([^/]+)\/(.+)$/);
  if (m && (req.method === 'POST' || req.method === 'PUT')) {
    const [, bucket, name] = m;
    const data = await readBody(req);
    try {
      await withCaller(req, async (client, claims) => {
        if (req.method === 'PUT') {
          const { rows } = await client.query(
            `UPDATE storage.objects SET updated_at = now(), metadata = $3
              WHERE bucket_id = $1 AND name = $2 RETURNING id`,
            [bucket, name, JSON.stringify({ size: data.length, mimetype: req.headers['content-type'] || 'application/octet-stream' })]);
          if (!rows.length) throw Object.assign(new Error('new row violates row-level security policy'), { code: '42501' });
          return;
        }
        await client.query(
          `INSERT INTO storage.objects (bucket_id, name, owner, metadata)
           VALUES ($1, $2, $3, $4)`,
          [bucket, name, claims?.sub ?? null,
            JSON.stringify({ size: data.length, mimetype: req.headers['content-type'] || 'application/octet-stream' })]);
      });
    } catch (e) { return pgError(res, e); }
    fs.writeFileSync(diskPath(bucket, name), data);
    return json(res, 200, { Key: `${bucket}/${name}`, Id: crypto.randomUUID(), path: name });
  }

  // download: GET /object/authenticated/<bucket>/<path>  (and the public form)
  m = p.match(/^\/object\/(?:authenticated\/|public\/)?([^/]+)\/(.+)$/);
  if (m && req.method === 'GET') {
    const [, bucket, nameRaw] = m;
    const name = decodeURIComponent(nameRaw.split('?')[0]);
    let allowed = false;
    try {
      allowed = await withCaller(req, async (client) => {
        const { rows } = await client.query(
          'SELECT 1 FROM storage.objects WHERE bucket_id = $1 AND name = $2', [bucket, name]);
        return rows.length > 0;
      });
    } catch (e) { return pgError(res, e); }
    if (!allowed) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    const file = diskPath(bucket, name);
    if (!fs.existsSync(file)) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    return res.end(fs.readFileSync(file));
  }

  // signed url: POST /object/sign/<bucket>/<path>
  m = p.match(/^\/object\/sign\/([^/]+)\/(.+)$/);
  if (m && req.method === 'POST') {
    const [, bucket, name] = m;
    await readBody(req);
    let allowed = false;
    try {
      allowed = await withCaller(req, async (client) => {
        const { rows } = await client.query(
          'SELECT 1 FROM storage.objects WHERE bucket_id = $1 AND name = $2', [bucket, decodeURIComponent(name)]);
        return rows.length > 0;
      });
    } catch (e) { return pgError(res, e); }
    if (!allowed) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    return json(res, 200, { signedURL: `/object/sign/${bucket}/${name}?token=shim` });
  }

  // list: POST /object/list/<bucket>
  m = p.match(/^\/object\/list\/([^/]+)$/);
  if (m && req.method === 'POST') {
    const [, bucket] = m;
    const body = (await readBody(req)).toString() || '{}';
    const { prefix = '' } = (() => { try { return JSON.parse(body); } catch { return {}; } })();
    try {
      const rows = await withCaller(req, async (client) => (await client.query(
        `SELECT name, id, updated_at, created_at, metadata FROM storage.objects
          WHERE bucket_id = $1 AND name LIKE $2 || '%'`, [bucket, prefix])).rows);
      return json(res, 200, rows.map((r) => ({ ...r, name: r.name.replace(new RegExp(`^${prefix}/?`), '') })));
    } catch (e) { return pgError(res, e); }
  }

  // delete: DELETE /object/<bucket>  with { prefixes: [...] }
  m = p.match(/^\/object\/([^/]+)$/);
  if (m && req.method === 'DELETE') {
    const [, bucket] = m;
    const body = (await readBody(req)).toString() || '{}';
    const { prefixes = [] } = (() => { try { return JSON.parse(body); } catch { return {}; } })();
    try {
      const gone = await withCaller(req, async (client) => (await client.query(
        'DELETE FROM storage.objects WHERE bucket_id = $1 AND name = ANY($2) RETURNING name',
        [bucket, prefixes])).rows);
      return json(res, 200, gone);
    } catch (e) { return pgError(res, e); }
  }

  return json(res, 404, { message: `shim: no storage route ${req.method} ${p}` });
}

// ----------------------------------------------------------- functions
// Edge functions do not run here. Answering with a clear refusal rather than a
// plausible fake keeps a screen that silently depends on one visible.
const invoked = [];
// The two subscription probes run on nearly every screen. Left refusing, their
// noise buries anything else the console has to say, so they answer with the
// free tier; everything else stays a visible refusal.
const CANNED = {
  'check-subscription': { subscribed: false, tier: 'free', subscription_end: null },
  'check-clinician-subscription': { subscribed: false, tier: 'free', status: 'inactive', trial_ends_at: null, patient_limit: 10 },
};
async function handleFunction(req, res, url) {
  const name = url.pathname.replace('/functions/v1/', '');
  await readBody(req);
  invoked.push(name);
  if (CANNED[name]) return json(res, 200, CANNED[name]);
  return json(res, 503, { error: `shim: edge function '${name}' is not running locally` });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }
  try {
    if (url.pathname === '/__shim/invoked') return json(res, 200, invoked);
    if (url.pathname.startsWith('/auth/v1/')) return await handleAuth(req, res, url);
    if (url.pathname.startsWith('/rest/v1/')) return await handleRest(req, res, url);
    if (url.pathname.startsWith('/storage/v1/')) return await handleStorage(req, res, url);
    if (url.pathname.startsWith('/functions/v1/')) return await handleFunction(req, res, url);
    return json(res, 404, { message: `shim: no route ${url.pathname}` });
  } catch (e) {
    console.error('shim error', req.method, url.pathname, e.message);
    return pgError(res, e);
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`shim on http://127.0.0.1:${PORT}`));
