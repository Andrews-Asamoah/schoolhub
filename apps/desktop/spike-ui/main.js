// Phase 0 spike screen. Everything sensitive runs in Rust: this page only calls the commands listed
// in src-tauri/build.rs and makes HTTP requests through the Tauri HTTP plugin (so no browser CORS,
// and no token or key ever sits in page memory longer than a request).

const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;
const httpFetch = tauri?.http?.fetch;
const $ = (id) => document.getElementById(id);
const logEl = $("log");

function log(message, kind = "") {
  const line = document.createElement("span");
  if (kind) line.className = kind;
  line.textContent = `${new Date().toISOString().slice(11, 23)}  ${message}\n`;
  logEl.append(line);
  logEl.scrollTop = logEl.scrollHeight;
}

/** Runs one check, times it, and logs pass or fail without ever throwing into the page. */
async function run(name, work) {
  const started = performance.now();
  try {
    const result = await work();
    log(`PASS ${name} (${(performance.now() - started).toFixed(0)} ms)${result ? ": " + result : ""}`, "ok");
  } catch (error) {
    log(`FAIL ${name}: ${error?.message ?? error}`, "bad");
  }
}

const school = () => $("school").value.trim();
const user = () => $("user").value.trim();
const api = () => $("api").value.trim().replace(/\/$/, "");
const mock = () => $("mock").value.trim().replace(/\/$/, "");
const sql = (text, params = []) => ({ sql: text, params });

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS attendance (class_id TEXT NOT NULL, date TEXT NOT NULL, student_id TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY (class_id, date, student_id))",
  "CREATE TABLE IF NOT EXISTS outbox (op_id TEXT PRIMARY KEY, seq INTEGER NOT NULL UNIQUE, type TEXT NOT NULL, payload TEXT NOT NULL, captured_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS needs_attention (op_id TEXT PRIMARY KEY, payload TEXT NOT NULL, code TEXT NOT NULL)",
];

async function deviceId() {
  const [row] = await invoke("db_query", { sql: "SELECT v FROM meta WHERE k = 'device_id'", params: [] });
  if (row) return row.v;
  const id = `dev-${crypto.randomUUID().slice(0, 8)}`;
  await invoke("db_exec", { sql: "INSERT INTO meta (k, v) VALUES ('device_id', ?)", params: [id] });
  return id;
}

async function counts() {
  const [row] = await invoke("db_query", {
    sql: "SELECT (SELECT count(*) FROM outbox) AS pending, (SELECT count(*) FROM needs_attention) AS attention, (SELECT count(*) FROM attendance) AS rows",
    params: [],
  });
  return row;
}

async function showOutbox() {
  try {
    const c = await counts();
    $("outbox").textContent = `Local: ${c.pending} waiting to send, ${c.attention} need attention, ${c.rows} attendance rows.`;
  } catch {
    $("outbox").textContent = "Open the database first.";
  }
}

async function record(classId) {
  const date = new Date().toISOString().slice(0, 10);
  const marks = Object.fromEntries(["s1", "s2", "s3", "s4", "s5", "s6"].map((s) => [s, Math.random() < 0.85 ? "P" : "A"]));
  const id = await deviceId();
  // The attendance rows and the outbox command are written in ONE transaction: both or neither.
  await invoke("db_transaction", {
    statements: [
      ...Object.entries(marks).map(([studentId, status]) =>
        sql("INSERT INTO attendance (class_id, date, student_id, status) VALUES (?, ?, ?, ?) ON CONFLICT (class_id, date, student_id) DO UPDATE SET status = excluded.status", [classId, date, studentId, status])),
      sql("INSERT INTO meta (k, v) VALUES ('seq', '1') ON CONFLICT (k) DO UPDATE SET v = CAST(v AS INTEGER) + 1"),
      sql("INSERT INTO outbox (op_id, seq, type, payload, captured_at) VALUES (?, (SELECT CAST(v AS INTEGER) FROM meta WHERE k = 'seq'), 'attendance.record', ?, ?)",
        [`${id}-${crypto.randomUUID()}`, JSON.stringify({ classId, date, marks }), Date.now()]),
    ],
  });
  return `recorded ${classId} ${date}`;
}

async function push() {
  const id = await deviceId();
  const rows = await invoke("db_query", { sql: "SELECT op_id, seq, type, payload, captured_at FROM outbox ORDER BY seq", params: [] });
  if (rows.length === 0) return "nothing to send";
  const ops = rows.map((r) => ({ opId: r.op_id, seq: r.seq, type: r.type, payload: JSON.parse(r.payload), capturedAt: r.captured_at }));
  const body = JSON.stringify({ deviceId: id, ops });
  const headers = { "content-type": "application/json" };
  if ($("chaos").value) headers["x-chaos"] = $("chaos").value;
  const started = performance.now();
  let response;
  try {
    response = await httpFetch(`${mock()}/sync/push`, { method: "POST", headers, body });
  } catch (error) {
    // The point of the test: nothing is deleted locally when the answer never arrives.
    throw new Error(`no answer (${error?.message ?? error}). ${rows.length} command(s) stay in the outbox and will be retried.`);
  }
  const { results } = await response.json();
  await invoke("db_transaction", {
    statements: results.flatMap((r) => [
      ...(r.status === "applied" ? [] : [sql("INSERT OR REPLACE INTO needs_attention (op_id, payload, code) VALUES (?, (SELECT payload FROM outbox WHERE op_id = ?), ?)", [r.opId, r.opId, r.code ?? r.status])]),
      sql("DELETE FROM outbox WHERE op_id = ?", [r.opId]),
    ]),
  });
  const replayed = results.filter((r) => r.replayed).length;
  return `${results.length} command(s), ${body.length} bytes sent, ${(performance.now() - started).toFixed(0)} ms, ${replayed} recognised as already applied`;
}

async function stats() {
  const response = await httpFetch(`${mock()}/sync/stats`);
  const server = await response.json();
  const local = await counts();
  const duplicates = server.maxApplyCount > 1;
  log(`server applied ${server.applied} command(s), most applies of any one command: ${server.maxApplyCount}; local outbox ${local.pending}, needs attention ${local.attention}`, duplicates ? "bad" : "ok");
  return duplicates ? "DUPLICATE APPLY DETECTED" : "no command applied twice";
}

function bind(id, name, work) {
  $(id).addEventListener("click", () => run(name, async () => { const result = await work(); await showOutbox(); return result; }));
}

if (!invoke || !httpFetch) {
  $("env").textContent = "Not running inside the Tauri shell (window.__TAURI__ or its HTTP plugin is missing).";
  log("FAIL not inside Tauri", "bad");
} else {
  invoke("app_info").then((info) => {
    const nav = performance.getEntriesByType("navigation")[0];
    $("env").textContent = `v${info.version} on ${info.os}/${info.arch}. Page ready ${performance.now().toFixed(0)} ms after load started${nav ? ` (DOM interactive ${nav.domInteractive.toFixed(0)} ms)` : ""}.`;
  });

  bind("cred-run", "credential store round trip", async () => {
    const token = `t-${crypto.randomUUID()}`;
    await invoke("session_set", { school: "spike-test", token });
    const back = await invoke("session_get", { school: "spike-test" });
    if (back !== token) throw new Error("the value read back differs");
    await invoke("session_clear", { school: "spike-test" });
    if ((await invoke("session_get", { school: "spike-test" })) !== null) throw new Error("delete did not remove it");
    return "saved, read back, deleted";
  });

  bind("db-open", "open encrypted database", async () => {
    await invoke("db_open", { school: school(), user: user() });
    await invoke("db_transaction", { statements: SCHEMA.map((text) => sql(text)) });
    return `database ready for ${school()} / ${user()}`;
  });

  bind("db-inspect", "database is encrypted at rest", async () => {
    const info = await invoke("db_inspect");
    if (info.plaintext_header) throw new Error("the file starts with the plain SQLite header");
    if (!info.cipher_version) throw new Error("SQLCipher is not active");
    return `${info.bytes} bytes, SQLCipher ${info.cipher_version}, header is not plain SQLite. ${info.path}`;
  });

  bind("db-wipe", "wipe database and key", async () => {
    await invoke("db_wipe", { school: school(), user: user() });
    return "file and key removed. Open again to start empty";
  });

  bind("sign-in", "sign in over Rust HTTP", async () => {
    const response = await httpFetch(`${api()}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-school-subdomain": school() },
      body: JSON.stringify({ email: $("email").value, password: $("password").value }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status} ${body?.message ?? ""}`.trim());
    if (body.twoFactorRedirect) return "2FA required: enter the code and press Submit 2FA code";
    const token = response.headers.get("set-auth-token");
    if (!token) throw new Error("signed in, but no set-auth-token header was visible to the app");
    await invoke("session_set", { school: school(), token });
    return "signed in; bearer token stored in the credential store";
  });

  bind("verify-totp", "2FA over Rust HTTP (cookie must survive between requests)", async () => {
    const response = await httpFetch(`${api()}/api/auth/two-factor/verify-totp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-school-subdomain": school() },
      body: JSON.stringify({ code: $("totp").value.trim() }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status} ${body?.message ?? "the challenge cookie probably did not survive"}`);
    const token = response.headers.get("set-auth-token");
    if (!token) throw new Error("code accepted, but no set-auth-token header came back");
    await invoke("session_set", { school: school(), token });
    return "2FA verified; bearer token stored";
  });

  bind("who-am-i", "stored token is accepted by the API", async () => {
    const token = await invoke("session_get", { school: school() });
    if (!token) throw new Error("no stored token: sign in first");
    const response = await httpFetch(`${api()}/api/auth/get-session`, { headers: { authorization: `Bearer ${token}`, "x-school-subdomain": school() } });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.user) throw new Error(`${response.status} no session`);
    return `signed in as ${body.user.email}`;
  });

  bind("record", "record a register offline", () => record("class-a"));
  bind("record-locked", "record for a locked register", () => record("class-locked"));
  bind("push", "sync now", push);
  bind("stats", "compare local and server", stats);
  $("crash").addEventListener("click", async () => { log("crashing the process now…"); await invoke("spike_crash"); });
  $("clear-log").addEventListener("click", () => { logEl.textContent = ""; });
  showOutbox();
}
