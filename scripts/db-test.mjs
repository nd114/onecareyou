// scripts/db-test.sh for machines with no psql (Windows, mostly).
//
// Same compatibility shim (read out of db-test.sh itself, so the two cannot
// drift), same replay, same per-file ON_ERROR_STOP semantics: statements are
// sent one at a time in autocommit, as psql sends them, so a migration that
// fails halfway leaves its earlier statements applied exactly as it would there.
//
//   node scripts/db-test.mjs                 replay everything, run every suite
//   node scripts/db-test.mjs institution     only suites whose name matches
//   node scripts/db-test.mjs --file x.sql    one file against the replayed db
//
// Connection: PGHOST (127.0.0.1), PGPORT (5432), PGUSER (postgres), DBNAME
// (onecare_test). Needs a Postgres 16 with trust auth on loopback; no psql.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const [arg2, arg3] = process.argv.slice(2);
const HOST = process.env.PGHOST || '127.0.0.1';
const PORT = process.env.PGPORT || 5432;
const USER = process.env.PGUSER || 'postgres';
const DBNAME = process.env.DBNAME || 'onecare_test';
const conn = (db) => new pg.Client({ host: HOST, port: PORT, user: USER, database: db });

export function split(sql) {
  const out = []; let cur = ''; let i = 0; const n = sql.length;
  while (i < n) {
    const c = sql[i], d = sql[i + 1];
    if (c === '-' && d === '-') { const j = sql.indexOf('\n', i); const e = j < 0 ? n : j; cur += sql.slice(i, e); i = e; continue; }
    if (c === '/' && d === '*') {
      let depth = 1, j = i + 2;
      while (j < n && depth) { if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; } else if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; } else j++; }
      cur += sql.slice(i, j); i = j; continue;
    }
    if (c === "'" ) {
      const esc = /[eE]$/.test(cur) && !/[A-Za-z0-9_][eE]$/.test(cur);
      let j = i + 1;
      while (j < n) {
        if (esc && sql[j] === '\\') { j += 2; continue; }
        if (sql[j] === "'") { if (sql[j + 1] === "'") { j += 2; continue; } break; }
        j++;
      }
      cur += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '"') { const j = sql.indexOf('"', i + 1); cur += sql.slice(i, j + 1); i = j + 1; continue; }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m && !/[A-Za-z0-9_]$/.test(cur)) {
        const tag = m[0]; const j = sql.indexOf(tag, i + tag.length);
        const e = j < 0 ? n : j + tag.length; cur += sql.slice(i, e); i = e; continue;
      }
    }
    if (c === ';') { if (cur.trim()) out.push(cur); cur = ''; i++; continue; }
    cur += c; i++;
  }
  if (cur.replace(/--[^\n]*/g, '').trim()) out.push(cur);
  return out;
}

async function runFile(client, file, sqlText) {
  const sql = sqlText ?? fs.readFileSync(file, 'utf8');
  for (const stmt of split(sql)) {
    try { await client.query(stmt); }
    catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      return { ok: false, err: `ERROR: ${e.message}`, stmt: stmt.trim().slice(0, 160) };
    }
  }
  return { ok: true };
}

async function main() {
  const shimSrc = fs.readFileSync(path.join(repo, 'scripts/db-test.sh'), 'utf8').replace(/\r\n/g, '\n');
  const shim = /run_sql <<'SQL' >\/dev\/null\n([\s\S]*?)\nSQL\n/.exec(shimSrc)[1];

  if (arg2 === '--file') {
    const c = conn(DBNAME); await c.connect();
    c.on('notice', (m) => console.log('NOTICE:', m.message));
    const r = await runFile(c, arg3);
    console.log(r.ok ? 'ok' : `${r.err}\n   at: ${r.stmt}`);
    await c.end(); process.exit(r.ok ? 0 : 1);
  }

  const admin = conn('postgres'); await admin.connect();
  console.log(`→ recreating ${DBNAME}`);
  await admin.query(`DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DBNAME}`);
  await admin.end();

  const c = conn(DBNAME); await c.connect();
  console.log('→ applying compatibility shim');
  const s = await runFile(c, null, shim);
  if (!s.ok) { console.error('shim failed', s); process.exit(2); }

  console.log('→ replaying migrations');
  let applied = 0, skipped = 0;
  const mdir = path.join(repo, 'supabase/migrations');
  for (const f of fs.readdirSync(mdir).filter((f) => f.endsWith('.sql')).sort()) {
    const r = await runFile(c, path.join(mdir, f));
    if (r.ok) applied++; else { skipped++; console.log(`  ! ${f}\n      ${r.err}`); }
  }
  console.log(`   ${applied} applied, ${skipped} could not be replayed`);

  console.log('→ running tests');
  let pass = 0, fail = 0; const failed = [];
  const tdir = path.join(repo, 'supabase/tests');
  const filter = arg2 || '';
  for (const f of fs.readdirSync(tdir).filter((f) => f.endsWith('.test.sql')).sort()) {
    if (filter && !f.includes(filter)) continue;
    const r = await runFile(c, path.join(tdir, f));
    if (r.ok) { pass++; console.log(`  ok   ${f}`); }
    else { fail++; failed.push(f); console.log(`  FAIL ${f}\n         ${r.err}`); }
  }

  if (!filter) {
    console.log("→ checking the client's names against the schema");
    const src = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else src.push(fs.readFileSync(p, 'utf8')); } };
    walk(path.join(repo, 'src'));
    const all = src.join('\n');
    const fns = [...new Set([...all.matchAll(/rpc\('([a-z_]+)'/g)].map((m) => m[1]))];
    const rels = [...new Set([...all.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]))];
    let missing = 0;
    for (const fn of fns) {
      const r = await c.query(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1 LIMIT 1`, [fn]);
      if (!r.rowCount) { console.log(`  MISSING FUNCTION  ${fn}`); missing++; }
    }
    for (const t of rels) {
      const r = await c.query(`SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1) OR EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id=$1)`, [t]);
      if (!r.rowCount) { console.log(`  MISSING RELATION  ${t}`); missing++; }
    }
    console.log(missing ? `  ${missing} name(s) the client uses do not exist` : '  all client names resolve');
    fail += missing;
  }
  await c.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { failed.forEach((f) => console.log(`  ${f}`)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(2); });
