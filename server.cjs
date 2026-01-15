const http = require('http');
const url = require('url');
const { readDB, writeDB, nextId } = require('./db.cjs');

const PORT = 5174;
const BRAND = '#B21A53';

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function authUser(req, db) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const userId = Number(token);
  return db.users.find((u) => u.id === userId) || null;
}

function requireRole(user, roles) {
  return user && roles.includes(user.role);
}

function branchName(db, branchId) {
  const b = db.branches.find((x) => x.id === branchId);
  return b ? b.name : '—';
}

function computePrice(db, product) {
  const settings = db.branchSettings[String(product.branchId)];
  const pagePrice = settings?.pagePrice ?? 10;
  const extras = settings?.extras ?? [];
  const base = (product.pages || 0) * pagePrice;

  let price = base;
  if (product.priceMode === 'FIXED') {
    price = Number(product.fixedPrice ?? 0);
  } else if (product.priceMode === 'AUTO_PLUS_EXTRA') {
    const ex = extras.find((e) => e.key === product.extraKey);
    price = base + Number(ex?.amount ?? 0);
  }

  // discounts
  const oldPrice = price;
  if (product.discountType === 'AMOUNT') {
    price = Math.max(0, price - Number(product.discountValue || 0));
  } else if (product.discountType === 'PERCENT') {
    price = Math.max(0, Math.round(price * (1 - Number(product.discountValue || 0) / 100)));
  }

  return { oldPrice, price };
}

function secureCode() {
  // stronger random (not crypto module dependency)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid confusing chars
  const part = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `PS-${part(4)}-${part(4)}-${part(2)}`; // longer than before
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true });

  const parsed = url.parse(req.url, true);
  const path = parsed.pathname || '';
  const db = readDB();
  const me = authUser(req, db);

  // health
  if (req.method === 'GET' && path === '/api/health') {
    return send(res, 200, { ok: true, brand: BRAND });
  }

  // ---------- AUTH ----------
  if (req.method === 'POST' && path === '/api/auth/login') {
    const body = await parseBody(req);
    const user = db.users.find(
      (u) => u.username === String(body.username || '').trim() && u.password === String(body.password || '')
    );
    if (!user) return send(res, 401, { error: 'INVALID_CREDENTIALS' });

    return send(res, 200, {
      token: String(user.id),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        branchId: user.branchId,
        branchName: user.branchId ? branchName(db, user.branchId) : 'HQ',
        blocked: !!user.blocked,
        lang: user.lang || 'de',
        creditDzd: user.creditDzd || 0
      }
    });
  }

  if (req.method === 'POST' && path === '/api/auth/register') {
    const body = await parseBody(req);
    const username = String(body.username || '').trim();
    const password = String(body.password || '').trim();

    if (!username || !password) return send(res, 400, { error: 'MISSING_FIELDS' });
    if (db.users.some((u) => u.username === username)) return send(res, 409, { error: 'USERNAME_TAKEN' });

    const id = nextId(db, 'users');
    const u = {
      id,
      username,
      password,
      role: 'user',
      branchId: body.branchId ?? null,
      facultyId: body.facultyId ?? null,
      departmentId: body.departmentId ?? null,
      yearId: body.yearId ?? null,
      moduleId: body.moduleId ?? null,
      groupId: body.groupId ?? null,
      creditDzd: 0,
      blocked: false,
      wrongRedeemAttempts: 0,
      blockedCount: 0,
      lang: body.lang || 'de'
    };
    db.users.push(u);
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  // ---------- ME ----------
  if (req.method === 'GET' && path === '/api/me') {
    if (!me) return send(res, 401, { error: 'NO_AUTH' });
    return send(res, 200, {
      id: me.id,
      username: me.username,
      role: me.role,
      branchId: me.branchId,
      branchName: me.branchId ? branchName(db, me.branchId) : 'HQ',
      blocked: !!me.blocked,
      creditDzd: me.creditDzd || 0,
      lang: me.lang || 'de',
      blockedCount: me.blockedCount || 0
    });
  }

  if (req.method === 'PUT' && path === '/api/me/lang') {
    if (!me) return send(res, 401, { error: 'NO_AUTH' });
    const body = await parseBody(req);
    const lang = ['de', 'en', 'fr'].includes(body.lang) ? body.lang : 'de';
    const u = db.users.find((x) => x.id === me.id);
    u.lang = lang;
    writeDB(db);
    return send(res, 200, { ok: true, lang });
  }

  // ---------- BRANCHES & SETTINGS ----------
  if (req.method === 'GET' && path === '/api/branches') {
    return send(res, 200, db.branches);
  }

  if (req.method === 'POST' && path === '/api/branches') {
    if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });
    const body = await parseBody(req);
    const id = nextId(db, 'branches');
    db.branches.push({ id, name: String(body.name || `Filiale ${id}`).trim() });
    db.branchSettings[String(id)] = db.branchSettings[String(id)] || {
      currency: 'DZD',
      pagePrice: 10,
      defaultPriceMode: 'AUTO',
      extras: [
        { key: 'EXTRA1', label: 'Extra 1', amount: 30 },
        { key: 'EXTRA2', label: 'Extra 2', amount: 50 },
        { key: 'EXTRA3', label: 'Extra 3', amount: 80 },
        { key: 'EXTRA4', label: 'Extra 4', amount: 150 }
      ],
      latestN: 20,
      newTagDays: 3
    };
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'PUT' && path.startsWith('/api/branch-settings/')) {
    if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    const branchId = Number(path.split('/').pop());
    // Admin darf nur seine Filiale
    if (me.role === 'admin' && me.branchId !== branchId) return send(res, 403, { error: 'FORBIDDEN' });

    const body = await parseBody(req);
    db.branchSettings[String(branchId)] = { ...db.branchSettings[String(branchId)], ...body };
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && path.startsWith('/api/branch-settings/')) {
    const branchId = Number(path.split('/').pop());
    return send(res, 200, db.branchSettings[String(branchId)] || null);
  }

// ---------- BRANCH (DETAIL) ----------
if (req.method === 'GET' && path.startsWith('/api/branches/')) {
  const id = Number(path.split('/').pop());
  const b = (db.branches || []).find(x => x.id === id);
  if (!b) return send(res, 404, { error: 'NOT_FOUND' });
  return send(res, 200, b);
}

if (req.method === 'PUT' && path.startsWith('/api/branches/')) {
  if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });
  const id = Number(path.split('/').pop());
  const b = (db.branches || []).find(x => x.id === id);
  if (!b) return send(res, 404, { error: 'NOT_FOUND' });
  const body = await parseBody(req);
  b.name = String(body.name ?? b.name).trim();
  writeDB(db);
  return send(res, 200, { ok: true });
}






// ---------- ADMINS LIST (for Supervisor) ----------
if (req.method === 'GET' && path === '/api/admin-list') {
  if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });

  const admins = (db.users || [])
    .filter((u) => u.role === 'admin')
    .map((u) => {
      const br = (db.branches || []).find((b) => b.id === u.branchId);
      return {
        id: u.id,
        username: u.username,
        branchId: u.branchId || null,
        branchName: br ? br.name : null,
        disabled: !!u.disabled,
      };
    });

  return send(res, 200, admins);
}

  // ---------- STRUCTURE CRUD ----------
  // Helpers: list by parent id
  const listBy = (arr, key, val) => arr.filter((x) => x[key] === val);

  // faculties
  if (req.method === 'GET' && path === '/api/faculties') {
    const branchId = parsed.query.branchId ? Number(parsed.query.branchId) : null;
    const out = branchId ? listBy(db.faculties, 'branchId', branchId) : db.faculties;
    return send(res, 200, out);
  }
  if (req.method === 'POST' && path === '/api/faculties') {
    if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    const body = await parseBody(req);
    const branchId = me.role === 'admin' ? me.branchId : Number(body.branchId);
    if (!branchId) return send(res, 400, { error: 'BRANCH_REQUIRED' });
    const id = nextId(db, 'faculties');
    db.faculties.push({ id, branchId, name: String(body.name || '').trim() });
    writeDB(db);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'PUT' && path.startsWith('/api/faculties/')) {
    if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    const id = Number(path.split('/').pop());
    const body = await parseBody(req);
    const f = db.faculties.find((x) => x.id === id);
    if (!f) return send(res, 404, { error: 'NOT_FOUND' });
    if (me.role === 'admin' && f.branchId !== me.branchId) return send(res, 403, { error: 'FORBIDDEN' });
    f.name = String(body.name ?? f.name);
    writeDB(db);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'DELETE' && path.startsWith('/api/faculties/')) {
    if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });
    const id = Number(path.split('/').pop());
    db.faculties = db.faculties.filter((x) => x.id !== id);
    // cascade minimal (optional)
    db.departments = db.departments.filter((x) => x.facultyId !== id);
    db.professors = db.professors.filter((x) => x.facultyId !== id);
    writeDB(db);
    return send(res, 200, { ok: true });
  }

// ---------- DELETE: branches ----------
if (req.method === 'DELETE' && path.startsWith('/api/branches/')) {
  if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });

  const id = Number(path.split('/').pop());
  db.branches = db.branches.filter((x) => x.id !== id);

  // cascade delete everything under branch
  db.faculties = db.faculties.filter((f) => f.branchId !== id);

  const facultyIds = new Set(db.faculties.map((f) => f.id));
  db.departments = db.departments.filter((d) => facultyIds.has(d.facultyId));

  const departmentIds = new Set(db.departments.map((d) => d.id));
  db.years = db.years.filter((y) => departmentIds.has(y.departmentId));

  const yearIds = new Set(db.years.map((y) => y.id));
  db.modules = db.modules.filter((m) => yearIds.has(m.yearId));

  const moduleIds = new Set(db.modules.map((m) => m.id));
  db.groups = db.groups.filter((g) => moduleIds.has(g.moduleId));

  db.professors = db.professors.filter((p) => facultyIds.has(p.facultyId));

  delete db.branchSettings[String(id)];

  writeDB(db);
  return send(res, 200, { ok: true });
}

// ---------- DELETE: departments ----------
if (req.method === 'DELETE' && path.startsWith('/api/departments/')) {
  if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });

  const id = Number(path.split('/').pop());
  db.departments = db.departments.filter((x) => x.id !== id);

  // cascade: years -> modules -> groups
  const yearsToRemove = new Set(db.years.filter((y) => y.departmentId === id).map((y) => y.id));
  db.years = db.years.filter((y) => y.departmentId !== id);

  const modulesToRemove = new Set(db.modules.filter((m) => yearsToRemove.has(m.yearId)).map((m) => m.id));
  db.modules = db.modules.filter((m) => !yearsToRemove.has(m.yearId));

  db.groups = db.groups.filter((g) => !modulesToRemove.has(g.moduleId));

  writeDB(db);
  return send(res, 200, { ok: true });
}

// ---------- DELETE: years ----------
if (req.method === 'DELETE' && path.startsWith('/api/years/')) {
  if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });

  const id = Number(path.split('/').pop());
  db.years = db.years.filter((x) => x.id !== id);

  const modulesToRemove = new Set(db.modules.filter((m) => m.yearId === id).map((m) => m.id));
  db.modules = db.modules.filter((m) => m.yearId !== id);
  db.groups = db.groups.filter((g) => !modulesToRemove.has(g.moduleId));

  writeDB(db);
  return send(res, 200, { ok: true });
}

// ---------- DELETE: modules ----------
if (req.method === 'DELETE' && path.startsWith('/api/modules/')) {
  if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });

  const id = Number(path.split('/').pop());
  db.modules = db.modules.filter((x) => x.id !== id);
  db.groups = db.groups.filter((g) => g.moduleId !== id);

  writeDB(db);
  return send(res, 200, { ok: true });
}

// ---------- DELETE: groups ----------
if (req.method === 'DELETE' && path.startsWith('/api/groups/')) {
  if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });

  const id = Number(path.split('/').pop());
  db.groups = db.groups.filter((x) => x.id !== id);

  writeDB(db);
  return send(res, 200, { ok: true });
}

// ---------- DELETE: professors (Supervisor OR Admin-in-own-branch) ----------
if (req.method === 'DELETE' && path.startsWith('/api/professors/')) {
  if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });

  const id = Number(path.split('/').pop());
  const prof = (db.professors || []).find((p) => p.id === id);
  if (!prof) return send(res, 404, { error: 'NOT_FOUND' });

  // Admin darf nur Professoren löschen, die zu seiner Filiale gehören
  if (me.role === 'admin') {
    const fac = (db.faculties || []).find((f) => f.id === prof.facultyId);
    if (!fac) return send(res, 400, { error: 'FACULTY_MISSING' });
    if (fac.branchId !== me.branchId) return send(res, 403, { error: 'FORBIDDEN' });
  }

  db.professors = (db.professors || []).filter((p) => p.id !== id);

  writeDB(db);
  return send(res, 200, { ok: true });
}





  // departments
  if (req.method === 'GET' && path === '/api/departments') {
    const facultyId = parsed.query.facultyId ? Number(parsed.query.facultyId) : null;
    const out = facultyId ? listBy(db.departments, 'facultyId', facultyId) : db.departments;
    return send(res, 200, out);
  }
  if (req.method === 'POST' && path === '/api/departments') {
    if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    const body = await parseBody(req);
    const facultyId = Number(body.facultyId);
    const fac = db.faculties.find((f) => f.id === facultyId);
    if (!fac) return send(res, 400, { error: 'FACULTY_REQUIRED' });
    if (me.role === 'admin' && fac.branchId !== me.branchId) return send(res, 403, { error: 'FORBIDDEN' });
    const id = nextId(db, 'departments');
    db.departments.push({ id, facultyId, name: String(body.name || '').trim() });
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  // Supervisor darf Departments loeschen (Admin nie)
  if (req.method === 'DELETE' && path.startsWith('/api/departments/')) {
    if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });
    const id = Number(path.split('/').pop());
    const dep = db.departments.find((x) => x.id === id);
    if (!dep) return send(res, 404, { error: 'NOT_FOUND' });
    // cascade: years/modules/groups
    const yearIds = db.years.filter((y) => y.departmentId === id).map((y) => y.id);
    const moduleIds = db.modules.filter((m) => yearIds.includes(m.yearId)).map((m) => m.id);
    db.groups = db.groups.filter((g) => !moduleIds.includes(g.moduleId));
    db.modules = db.modules.filter((m) => !yearIds.includes(m.yearId));
    db.years = db.years.filter((y) => y.departmentId !== id);
    db.departments = db.departments.filter((x) => x.id !== id);
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  // years
  if (req.method === 'GET' && path === '/api/years') {
    const departmentId = parsed.query.departmentId ? Number(parsed.query.departmentId) : null;
    const out = departmentId ? listBy(db.years, 'departmentId', departmentId) : db.years;
    return send(res, 200, out);
  }
  if (req.method === 'POST' && path === '/api/years') {
    if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    const body = await parseBody(req);
    const departmentId = Number(body.departmentId);
    const dep = db.departments.find((d) => d.id === departmentId);
    if (!dep) return send(res, 400, { error: 'DEPARTMENT_REQUIRED' });
    const fac = db.faculties.find((f) => f.id === dep.facultyId);
    if (me.role === 'admin' && fac.branchId !== me.branchId) return send(res, 403, { error: 'FORBIDDEN' });
    const id = nextId(db, 'years');
    db.years.push({ id, departmentId, name: String(body.name || '').trim() });
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'DELETE' && path.startsWith('/api/years/')) {
    if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });
    const id = Number(path.split('/').pop());
    const y = db.years.find((x) => x.id === id);
    if (!y) return send(res, 404, { error: 'NOT_FOUND' });
    const moduleIds = db.modules.filter((m) => m.yearId === id).map((m) => m.id);
    db.groups = db.groups.filter((g) => !moduleIds.includes(g.moduleId));
    db.modules = db.modules.filter((m) => m.yearId !== id);
    db.years = db.years.filter((x) => x.id !== id);
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  // modules
  if (req.method === 'GET' && path === '/api/modules') {
    const yearId = parsed.query.yearId ? Number(parsed.query.yearId) : null;
    const out = yearId ? listBy(db.modules, 'yearId', yearId) : db.modules;
    return send(res, 200, out);
  }
  if (req.method === 'POST' && path === '/api/modules') {
    if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    const body = await parseBody(req);
    const yearId = Number(body.yearId);
    const y = db.years.find((x) => x.id === yearId);
    if (!y) return send(res, 400, { error: 'YEAR_REQUIRED' });
    const dep = db.departments.find((d) => d.id === y.departmentId);
    const fac = db.faculties.find((f) => f.id === dep.facultyId);
    if (me.role === 'admin' && fac.branchId !== me.branchId) return send(res, 403, { error: 'FORBIDDEN' });
    const id = nextId(db, 'modules');
    db.modules.push({ id, yearId, name: String(body.name || '').trim() });
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'DELETE' && path.startsWith('/api/modules/')) {
    if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });
    const id = Number(path.split('/').pop());
    const m = db.modules.find((x) => x.id === id);
    if (!m) return send(res, 404, { error: 'NOT_FOUND' });
    db.groups = db.groups.filter((g) => g.moduleId !== id);
    db.modules = db.modules.filter((x) => x.id !== id);
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  // groups
  if (req.method === 'GET' && path === '/api/groups') {
    const moduleId = parsed.query.moduleId ? Number(parsed.query.moduleId) : null;
    const out = moduleId ? listBy(db.groups, 'moduleId', moduleId) : db.groups;
    return send(res, 200, out);
  }
  if (req.method === 'POST' && path === '/api/groups') {
    if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    const body = await parseBody(req);
    const moduleId = Number(body.moduleId);
    const m = db.modules.find((x) => x.id === moduleId);
    if (!m) return send(res, 400, { error: 'MODULE_REQUIRED' });
    const y = db.years.find((x) => x.id === m.yearId);
    const dep = db.departments.find((d) => d.id === y.departmentId);
    const fac = db.faculties.find((f) => f.id === dep.facultyId);
    if (me.role === 'admin' && fac.branchId !== me.branchId) return send(res, 403, { error: 'FORBIDDEN' });
    const id = nextId(db, 'groups');
    db.groups.push({ id, moduleId, name: String(body.name || '').trim() });
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'DELETE' && path.startsWith('/api/groups/')) {
    if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });
    const id = Number(path.split('/').pop());
    const g = db.groups.find((x) => x.id === id);
    if (!g) return send(res, 404, { error: 'NOT_FOUND' });
    db.groups = db.groups.filter((x) => x.id !== id);
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  // professors
  if (req.method === 'GET' && path === '/api/professors') {
    const facultyId = parsed.query.facultyId ? Number(parsed.query.facultyId) : null;
    const out = facultyId ? listBy(db.professors, 'facultyId', facultyId) : db.professors;
    return send(res, 200, out);
  }
  if (req.method === 'POST' && path === '/api/professors') {
    if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    const body = await parseBody(req);
    const facultyId = Number(body.facultyId);
    const fac = db.faculties.find((f) => f.id === facultyId);
    if (!fac) return send(res, 400, { error: 'FACULTY_REQUIRED' });
    if (me.role === 'admin' && fac.branchId !== me.branchId) return send(res, 403, { error: 'FORBIDDEN' });
    const id = nextId(db, 'professors');
    db.professors.push({ id, facultyId, name: String(body.name || '').trim() });
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  // Professoren loeschen:
  // - Supervisor: immer
  // - Admin: nur in seiner Filiale
  if (req.method === 'DELETE' && path.startsWith('/api/professors/')) {
    if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    const id = Number(path.split('/').pop());
    const p = db.professors.find((x) => x.id === id);
    if (!p) return send(res, 404, { error: 'NOT_FOUND' });
    const fac = db.faculties.find((f) => f.id === p.facultyId);
    if (!fac) return send(res, 400, { error: 'FACULTY_MISSING' });
    if (me.role === 'admin' && fac.branchId !== me.branchId) return send(res, 403, { error: 'FORBIDDEN' });
    db.professors = db.professors.filter((x) => x.id !== id);
    writeDB(db);
    return send(res, 200, { ok: true });
  }


// ---------- STRUCTURE (ALL-IN-ONE) ----------
if (req.method === 'GET' && path === '/api/structure/all') {
  if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });

  // optional filter by branchId
  let branchId = parsed.query.branchId ? Number(parsed.query.branchId) : null;

  // Admin darf nur seine Filiale sehen
  if (me.role === 'admin') branchId = me.branchId;

  const branches = branchId
    ? (db.branches || []).filter(b => b.id === branchId)
    : (db.branches || []);

  const faculties = branchId
    ? (db.faculties || []).filter(f => f.branchId === branchId)
    : (db.faculties || []);

  const facultyIds = new Set(faculties.map(f => f.id));

  const departments = (db.departments || []).filter(d => facultyIds.has(d.facultyId));
  const departmentIds = new Set(departments.map(d => d.id));

  const years = (db.years || []).filter(y => departmentIds.has(y.departmentId));
  const yearIds = new Set(years.map(y => y.id));

  const modules = (db.modules || []).filter(m => yearIds.has(m.yearId));
  const moduleIds = new Set(modules.map(m => m.id));

  const groups = (db.groups || []).filter(g => moduleIds.has(g.moduleId));
  const professors = (db.professors || []).filter(p => facultyIds.has(p.facultyId));

  return send(res, 200, {
    branches,
    branchSettings: db.branchSettings || {},
    faculties,
    departments,
    years,
    modules,
    groups,
    professors
  });
}

// ---------- AUTH LOGOUT ----------
if (req.method === 'POST' && path === '/api/auth/logout') {
  // stateless token auth -> nothing to do server-side
  return send(res, 200, { ok: true });
}



// ---------- USERS LIST ----------
if (req.method === 'GET' && path === '/api/users') {
  if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });

  let users = (db.users || []).map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    branchId: u.branchId ?? null,
    disabled: !!u.disabled,
    failedCodeAttempts: u.failedCodeAttempts ?? 0,
    blockedCount: u.blockedCount ?? 0,
    lastBlockedAt: u.lastBlockedAt ?? null
  }));

  // Admin sieht nur User seiner Filiale (optional – je nach deinem Konzept)
  if (me.role === 'admin') {
    users = users.filter(u => u.role !== 'supervisor' && (u.branchId === me.branchId || u.role === 'user'));
  }

  return send(res, 200, users);
}







  // ---------- PRODUCTS ----------
  if (req.method === 'GET' && path === '/api/products') {
    // user sees only matching + visible
    let out = db.products.slice();

    const q = parsed.query;
    const latestN = q.latestN ? Number(q.latestN) : null;

    // role scoping
    if (me?.role === 'admin') out = out.filter((p) => p.branchId === me.branchId);
    if (me?.role === 'user') {
      if (me.branchId) out = out.filter((p) => p.branchId === me.branchId);
      out = out.filter((p) => p.visible === true);
      // match hierarchy if set
      const matchKeys = ['facultyId', 'departmentId', 'yearId', 'moduleId', 'groupId'];
      for (const k of matchKeys) {
        if (me[k]) out = out.filter((p) => p[k] === me[k]);
      }
    }

    // optional filters
    const filters = ['branchId', 'facultyId', 'departmentId', 'yearId', 'moduleId', 'groupId', 'professorId'];
    for (const f of filters) {
      if (q[f]) out = out.filter((p) => p[f] === Number(q[f]));
    }

    // order newest first
    out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    if (latestN) out = out.slice(0, latestN);

    // attach computed prices + branchName
    out = out.map((p) => {
      const price = computePrice(db, p);
      return { ...p, ...price, branchName: branchName(db, p.branchId) };
    });

    return send(res, 200, out);
  }

  if (req.method === 'PUT' && path.startsWith('/api/products/')) {
    if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    const id = Number(path.split('/').pop());
    const body = await parseBody(req);
    const p = db.products.find((x) => x.id === id);
    if (!p) return send(res, 404, { error: 'NOT_FOUND' });
    if (me.role === 'admin' && p.branchId !== me.branchId) return send(res, 403, { error: 'FORBIDDEN' });

    // editable fields
    const editable = [
      'title',
      'pages',
      'priceMode',
      'fixedPrice',
      'extraKey',
      'discountType',
      'discountValue',
      'note',
      'visible'
    ];
    for (const k of editable) {
      if (k in body) p[k] = body[k];
    }
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'DELETE' && path.startsWith('/api/products/')) {
    if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    const id = Number(path.split('/').pop());
    const p = db.products.find((x) => x.id === id);
    if (!p) return send(res, 404, { error: 'NOT_FOUND' });
    if (me.role === 'admin' && p.branchId !== me.branchId) return send(res, 403, { error: 'FORBIDDEN' });
    db.products = db.products.filter((x) => x.id !== id);
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  // ---------- ADMIN ACCOUNTS (Supervisor) ----------
  if (req.method === 'POST' && path === '/api/admins') {
    if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });
    const body = await parseBody(req);
    const username = String(body.username || '').trim();
    const password = String(body.password || '').trim();
    const branchId = Number(body.branchId);

    if (!username || !password || !branchId) return send(res, 400, { error: 'MISSING_FIELDS' });
    if (db.users.some((u) => u.username === username)) return send(res, 409, { error: 'USERNAME_TAKEN' });

    const id = nextId(db, 'users');
    db.users.push({
      id,
      username,
      password,
      role: 'admin',
      branchId,
      creditDzd: 0,
      blocked: false,
      wrongRedeemAttempts: 0,
      blockedCount: 0,
      lang: 'de'
    });
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && path === '/api/admins') {
    if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });
    const admins = db.users
      .filter((u) => u.role === 'admin')
      .map((a) => ({ id: a.id, username: a.username, branchId: a.branchId, branchName: branchName(db, a.branchId) }));
    return send(res, 200, admins);
  }

  // ---------- USER BLOCK/UNBLOCK ----------
  if (req.method === 'POST' && path === '/api/users/unblock') {
    if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    const body = await parseBody(req);
    const userId = Number(body.userId);
    const u = db.users.find((x) => x.id === userId && x.role === 'user');
    if (!u) return send(res, 404, { error: 'NOT_FOUND' });
    // admin can only unblock within same branch
    if (me.role === 'admin' && u.branchId !== me.branchId) return send(res, 403, { error: 'FORBIDDEN' });

    u.blocked = false;
    u.wrongRedeemAttempts = 0;
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  // ---------- CODES ----------
  // generate codes
  if (req.method === 'POST' && path === '/api/codes/generate') {
    if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });
    const body = await parseBody(req);
    const amount = Number(body.amount);
    const count = Math.max(1, Math.min(100, Number(body.count || 1)));
    if (![500, 1000, 2000].includes(amount)) return send(res, 400, { error: 'INVALID_AMOUNT' });

    for (let i = 0; i < count; i++) {
      const id = nextId(db, 'codes');
      db.codes.push({
        id,
        code: secureCode(),
        amount,
        status: 'FRESH',
        visibleToAdminUserId: null,
        soldByAdminUserId: null,
        consumedByUserId: null,
        createdAt: new Date().toISOString()
      });
    }
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  // list codes (supervisor sees all, admin sees only assigned to him)
  if (req.method === 'GET' && path === '/api/codes') {
    if (!requireRole(me, ['supervisor', 'admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    let out = db.codes.slice();
    if (me.role === 'admin') out = out.filter((c) => c.visibleToAdminUserId === me.id);

    // group sorting: fresh -> sold -> consumed
    const rank = (s) => (s === 'FRESH' ? 0 : s === 'SOLD' ? 1 : 2);
    out.sort((a, b) => rank(a.status) - rank(b.status));

    return send(res, 200, out);
  }

  // set visible for specific admin
  if (req.method === 'POST' && path === '/api/codes/set-visible') {
    if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });
    const body = await parseBody(req);
    const codeId = Number(body.codeId);
    const adminUserId = Number(body.adminUserId);

    const c = db.codes.find((x) => x.id === codeId);
    if (!c) return send(res, 404, { error: 'NOT_FOUND' });
    if (c.status !== 'FRESH') return send(res, 400, { error: 'ONLY_FRESH_CAN_CHANGE_VISIBILITY' });

    const admin = db.users.find((u) => u.id === adminUserId && u.role === 'admin');
    if (!admin) return send(res, 400, { error: 'ADMIN_NOT_FOUND' });

    c.visibleToAdminUserId = adminUserId;
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  // hide from admin (only if not sold)
  if (req.method === 'POST' && path === '/api/codes/hide') {
    if (!requireRole(me, ['supervisor'])) return send(res, 403, { error: 'FORBIDDEN' });
    const body = await parseBody(req);
    const codeId = Number(body.codeId);
    const c = db.codes.find((x) => x.id === codeId);
    if (!c) return send(res, 404, { error: 'NOT_FOUND' });
    if (c.status !== 'FRESH') return send(res, 400, { error: 'CANNOT_HIDE_AFTER_SOLD' });

    c.visibleToAdminUserId = null;
    writeDB(db);
    return send(res, 200, { ok: true });
  }

  // admin marks sold + copy
  if (req.method === 'POST' && path === '/api/codes/mark-sold') {
    if (!requireRole(me, ['admin'])) return send(res, 403, { error: 'FORBIDDEN' });
    const body = await parseBody(req);
    const codeId = Number(body.codeId);
    const c = db.codes.find((x) => x.id === codeId);
    if (!c) return send(res, 404, { error: 'NOT_FOUND' });
    if (c.visibleToAdminUserId !== me.id) return send(res, 403, { error: 'NOT_ASSIGNED' });
    if (c.status !== 'FRESH') return send(res, 400, { error: 'ALREADY_SOLD_OR_USED' });

    c.status = 'SOLD';
    c.soldByAdminUserId = me.id;
    writeDB(db);
    return send(res, 200, { ok: true, code: c.code, amount: c.amount });
  }

  // user redeems (must be SOLD)
  if (req.method === 'POST' && path === '/api/codes/redeem') {
    if (!requireRole(me, ['user'])) return send(res, 403, { error: 'FORBIDDEN' });

    const u = db.users.find((x) => x.id === me.id);
    if (u.blocked) return send(res, 403, { error: 'USER_BLOCKED' });

    const body = await parseBody(req);
    const input = String(body.code || '').trim().toUpperCase();
    const c = db.codes.find((x) => x.code === input);

    if (!c || c.status !== 'SOLD') {
      u.wrongRedeemAttempts = Number(u.wrongRedeemAttempts || 0) + 1;

      if (u.wrongRedeemAttempts >= 3) {
        u.blocked = true;
        u.blockedCount = Number(u.blockedCount || 0) + 1;
        db.blockEvents.push({
          id: nextId(db, 'blockEvents'),
          userId: u.id,
          at: new Date().toISOString(),
          reason: '3_WRONG_CODE_ATTEMPTS'
        });
      }
      writeDB(db);
      return send(res, 404, { error: 'CODE_NOT_FOUND' });
    }

    // consume
    c.status = 'CONSUMED';
    c.consumedByUserId = u.id;
    u.creditDzd = Number(u.creditDzd || 0) + Number(c.amount || 0);
    u.wrongRedeemAttempts = 0;
    writeDB(db);
    return send(res, 200, { ok: true, newCredit: u.creditDzd });
  }

  // fallback
  return send(res, 404, { error: 'NOT_FOUND', path });
});

server.listen(PORT, () => {
  console.log(`API-Server läuft ✅ http://localhost:${PORT}`);
});
