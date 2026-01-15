const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { PDFDocument } = require("pdf-lib");

const app = express();
const PORT = process.env.PORT || 5173;

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

const DB_PATH = path.join(process.cwd(), "db.json");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function loadDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}
let db = loadDB();
if (!db) {
  db = {
    users: [],
    codes: [],
    blockEvents: [],
    products: [],
    orders: [],
    settings: {
      currency: "DZD",
      recentProductsDefaultLimit: 20,
      newBadgeDays: 3,
      pricePerPage: 10,
      extras: { extra1: 30, extra2: 50, extra3: 80, extra4: 150 }
    },
    catalogs: {
      branches: [],
      faculties: [],
      tracks: [],
      years: [],
      modules: [],
      groups: [],
      professors: []
    },
    _ids: { users: 0, codes: 0, products: 0, orders: 0, blockEvents: 0, catalogs: 0 }
  };
  saveDB();
}

function nextId(key) {
  db._ids[key] = (db._ids[key] || 0) + 1;
  saveDB();
  return db._ids[key];
}

function requireAuth(req, res, next) {
  const token = req.headers["x-token"];
  if (!token) return res.status(401).json({ error: "Missing token" });
  const user = db.users.find((u) => String(u.id) === String(token));
  if (!user) return res.status(401).json({ error: "Invalid token" });
  req.user = user;
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

function safeTrim(x) {
  return String(x || "").trim();
}

function randomCode() {
  // Starker Code, nicht erratbar: 12 Zeichen in 3 Blöcken
  // Zeichen ohne O/0/I/1 um Verwechslungen zu vermeiden
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}
function uniqueCode() {
  let c = randomCode();
  while (db.codes.some((x) => x.code === c)) c = randomCode();
  return c;
}

function computePrice(product) {
  const s = db.settings;
  const pages = product.pages || 1;

  // Basis
  let base = pages * (Number(s.pricePerPage) || 0);

  // Pricing mode
  // mode: "auto" | "auto_plus_extra" | "fixed"
  let price = base;
  if (product.mode === "fixed") {
    price = Number(product.fixedPrice || 0);
  } else if (product.mode === "auto_plus_extra") {
    const key = product.extraKey || "";
    const extra = Number(s.extras?.[key] || 0);
    price = base + extra;
  }

  // Rabatt (optional)
  // discountType: "none" | "percent" | "fixed"
  // discountValue: number
  const original = price;
  if (product.discountType === "percent") {
    const p = Number(product.discountValue || 0);
    price = Math.max(0, Math.round(original * (1 - p / 100)));
  } else if (product.discountType === "fixed") {
    const d = Number(product.discountValue || 0);
    price = Math.max(0, original - d);
  }

  return { originalPrice: original, finalPrice: price };
}

function matchesUserProfile(product, user) {
  if (!user?.profile) return false;
  if (user.role !== "user") return true;

  // Branch muss matchen
  if (product.branch !== user.branch) return false;

  // Hierarchie match
  const p = user.profile;
  // Wenn irgendein Feld nicht gesetzt ist, lassen wir es passieren (flexibel)
  if (p.facultyId && product.facultyId && Number(product.facultyId) !== Number(p.facultyId)) return false;
  if (p.trackId && product.trackId && Number(product.trackId) !== Number(p.trackId)) return false;
  if (p.yearId && product.yearId && Number(product.yearId) !== Number(p.yearId)) return false;
  if (p.moduleId && product.moduleId && Number(product.moduleId) !== Number(p.moduleId)) return false;
  if (p.groupId && product.groupId && Number(product.groupId) !== Number(p.groupId)) return false;

  return true;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || "";
    const base = crypto.randomBytes(8).toString("hex");
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});
const upload = multer({ storage });

app.use("/uploads", express.static(UPLOADS_DIR));
app.use("/", express.static(path.join(process.cwd(), "public")));

// ---------------- AUTH ----------------
app.post("/api/auth/login", (req, res) => {
  const username = safeTrim(req.body.username);
  const password = safeTrim(req.body.password);
  const user = db.users.find((u) => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: "Falsche Zugangsdaten" });
  res.json({
    token: String(user.id),
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      branch: user.branch,
      creditDzd: user.creditDzd,
      blocked: user.blocked,
      profile: user.profile || null
    }
  });
});


app.post('/api/auth/logout', (req, res) => res.json({ ok: true }));
app.get('/api/auth/logout', (req, res) => res.json({ ok: true }));




app.post("/api/auth/register", (req, res) => {
  // Demo-Registrierung (ohne echtes OTP): du kannst später OTP/Google integrieren
  const username = safeTrim(req.body.username);
  const password = safeTrim(req.body.password);
  const branch = safeTrim(req.body.branch) || "Filiale 1";

  if (username.length < 3 || password.length < 3) return res.status(400).json({ error: "Username/Passwort zu kurz" });
  if (db.users.some((u) => u.username === username)) return res.status(400).json({ error: "Username existiert bereits" });

  const id = nextId("users");
  const user = {
    id,
    username,
    password,
    role: "user",
    branch,
    profile: {},
    creditDzd: 0,
    blocked: false,
    wrongRedeemAttempts: 0
  };
  db.users.push(user);
  saveDB();

  res.json({
    token: String(user.id),
    user: { id: user.id, username: user.username, role: user.role, branch: user.branch, creditDzd: 0, blocked: false, profile: {} }
  });
});

// ---------------- SETTINGS ----------------
app.get("/api/settings", requireAuth, (_req, res) => {
  res.json(db.settings);
});

app.post("/api/settings", requireAuth, requireRole("admin", "supervisor"), (req, res) => {
  const s = db.settings;
  if (req.body.pricePerPage != null) s.pricePerPage = Number(req.body.pricePerPage) || 0;
  if (req.body.newBadgeDays != null) s.newBadgeDays = Number(req.body.newBadgeDays) || 0;
  if (req.body.recentProductsDefaultLimit != null) s.recentProductsDefaultLimit = Number(req.body.recentProductsDefaultLimit) || 20;
  if (req.body.extras) {
    s.extras = {
      extra1: Number(req.body.extras.extra1 || 0),
      extra2: Number(req.body.extras.extra2 || 0),
      extra3: Number(req.body.extras.extra3 || 0),
      extra4: Number(req.body.extras.extra4 || 0)
    };
  }
  saveDB();
  res.json({ ok: true, settings: db.settings });
});

// ---------------- CATALOGS ----------------
app.get("/api/catalogs", requireAuth, (_req, res) => {
  res.json(db.catalogs);
});

app.post("/api/catalogs/branch", requireAuth, requireRole("supervisor"), (req, res) => {
  const name = safeTrim(req.body.name);
  if (!name) return res.status(400).json({ error: "Name erforderlich" });
  if (db.catalogs.branches.includes(name)) return res.status(400).json({ error: "Existiert bereits" });
  db.catalogs.branches.push(name);
  saveDB();
  res.json({ ok: true, branches: db.catalogs.branches });
});

app.post("/api/catalogs/faculty", requireAuth, requireRole("supervisor"), (req, res) => {
  const branch = safeTrim(req.body.branch);
  const name = safeTrim(req.body.name);
  if (!branch || !name) return res.status(400).json({ error: "branch und name erforderlich" });
  const id = nextId("catalogs");
  const item = { id, branch, name };
  db.catalogs.faculties.push(item);
  saveDB();
  res.json({ ok: true, item });
});

app.post("/api/catalogs/track", requireAuth, requireRole("supervisor"), (req, res) => {
  const facultyId = Number(req.body.facultyId);
  const name = safeTrim(req.body.name);
  if (!facultyId || !name) return res.status(400).json({ error: "facultyId und name erforderlich" });
  const id = nextId("catalogs");
  const item = { id, facultyId, name };
  db.catalogs.tracks.push(item);
  saveDB();
  res.json({ ok: true, item });
});

app.post("/api/catalogs/year", requireAuth, requireRole("supervisor"), (req, res) => {
  const trackId = Number(req.body.trackId);
  const name = safeTrim(req.body.name);
  if (!trackId || !name) return res.status(400).json({ error: "trackId und name erforderlich" });
  const id = nextId("catalogs");
  const item = { id, trackId, name };
  db.catalogs.years.push(item);
  saveDB();
  res.json({ ok: true, item });
});

app.post("/api/catalogs/module", requireAuth, requireRole("supervisor"), (req, res) => {
  const yearId = Number(req.body.yearId);
  const name = safeTrim(req.body.name);
  if (!yearId || !name) return res.status(400).json({ error: "yearId und name erforderlich" });
  const id = nextId("catalogs");
  const item = { id, yearId, name };
  db.catalogs.modules.push(item);
  saveDB();
  res.json({ ok: true, item });
});

app.post("/api/catalogs/group", requireAuth, requireRole("supervisor"), (req, res) => {
  const moduleId = Number(req.body.moduleId);
  const name = safeTrim(req.body.name);
  if (!moduleId || !name) return res.status(400).json({ error: "moduleId und name erforderlich" });
  const id = nextId("catalogs");
  const item = { id, moduleId, name };
  db.catalogs.groups.push(item);
  saveDB();
  res.json({ ok: true, item });
});

app.post("/api/catalogs/professor", requireAuth, requireRole("supervisor", "admin"), (req, res) => {
  // Admin darf Professoren nicht global verwalten -> nur Supervisor
  if (req.user.role === "admin") return res.status(403).json({ error: "Nur Supervisor" });

  const facultyId = Number(req.body.facultyId);
  const name = safeTrim(req.body.name);
  if (!facultyId || !name) return res.status(400).json({ error: "facultyId und name erforderlich" });
  const id = nextId("catalogs");
  const item = { id, facultyId, name };
  db.catalogs.professors.push(item);
  saveDB();
  res.json({ ok: true, item });
});

// ---------------- ADMINS management (Supervisor) ----------------
app.get("/api/admins", requireAuth, requireRole("supervisor"), (_req, res) => {
  const admins = db.users.filter((u) => u.role === "admin").map((u) => ({ id: u.id, username: u.username, branch: u.branch }));
  res.json({ admins });
});

app.post("/api/admins", requireAuth, requireRole("supervisor"), (req, res) => {
  const username = safeTrim(req.body.username);
  const password = safeTrim(req.body.password);
  const branch = safeTrim(req.body.branch);

  if (!username || !password || !branch) return res.status(400).json({ error: "username/password/branch erforderlich" });
  if (db.users.some((u) => u.username === username)) return res.status(400).json({ error: "Username existiert bereits" });

  const id = nextId("users");
  const admin = { id, username, password, role: "admin", branch, creditDzd: 0, blocked: false, wrongRedeemAttempts: 0 };
  db.users.push(admin);
  saveDB();
  res.json({ ok: true, admin: { id, username, branch } });
});

// ---------------- USERS management (Admin/Supervisor) ----------------
app.get("/api/users", requireAuth, requireRole("admin", "supervisor"), (req, res) => {
  const users = db.users
    .filter((u) => u.role === "user")
    .filter((u) => (req.user.role === "admin" ? u.branch === req.user.branch : true))
    .map((u) => ({
      id: u.id,
      username: u.username,
      branch: u.branch,
      blocked: u.blocked,
      wrongRedeemAttempts: u.wrongRedeemAttempts || 0,
      creditDzd: u.creditDzd || 0
    }));
  res.json({ users });
});

app.post("/api/users/unblock", requireAuth, requireRole("admin", "supervisor"), (req, res) => {
  const userId = Number(req.body.userId);
  const u = db.users.find((x) => x.id === userId && x.role === "user");
  if (!u) return res.status(404).json({ error: "User nicht gefunden" });

  // Admin darf nur eigene Filiale
  if (req.user.role === "admin" && u.branch !== req.user.branch) return res.status(403).json({ error: "Forbidden" });

  u.blocked = false;
  u.wrongRedeemAttempts = 0;
  saveDB();
  res.json({ ok: true });
});

app.get("/api/block-events", requireAuth, requireRole("admin", "supervisor"), (req, res) => {
  const events = db.blockEvents
    .filter((e) => (req.user.role === "admin" ? e.branch === req.user.branch : true))
    .slice()
    .reverse();
  res.json({ events });
});

// ---------------- PROFILE (User) ----------------
app.post("/api/profile", requireAuth, requireRole("user"), (req, res) => {
  const u = req.user;
  u.profile = u.profile || {};
  const p = u.profile;

  const facultyId = req.body.facultyId != null ? Number(req.body.facultyId) : null;
  const trackId = req.body.trackId != null ? Number(req.body.trackId) : null;
  const yearId = req.body.yearId != null ? Number(req.body.yearId) : null;
  const moduleId = req.body.moduleId != null ? Number(req.body.moduleId) : null;
  const groupId = req.body.groupId != null ? Number(req.body.groupId) : null;

  if (facultyId) p.facultyId = facultyId;
  if (trackId) p.trackId = trackId;
  if (yearId) p.yearId = yearId;
  if (moduleId) p.moduleId = moduleId;
  if (groupId) p.groupId = groupId;

  saveDB();
  res.json({ ok: true, profile: u.profile });
});

// ---------------- CODES ----------------
app.post("/api/codes/generate", requireAuth, requireRole("supervisor"), (req, res) => {
  const amount = Number(req.body.amount);
  const count = Math.max(1, Math.min(50, Number(req.body.count || 1)));
  const adminId = Number(req.body.adminId);

  if (![500, 1000, 2000].includes(amount)) return res.status(400).json({ error: "Ungültiger Betrag" });
  const admin = db.users.find((u) => u.role === "admin" && u.id === adminId);
  if (!admin) return res.status(400).json({ error: "Admin nicht gefunden" });

  const created = [];
  for (let i = 0; i < count; i++) {
    const id = nextId("codes");
    const code = uniqueCode();
    const item = {
      id,
      code,
      amount,
      branch: admin.branch,
      assignedAdminId: admin.id,
      visibleToAdmin: true,
      sold: false,
      redeemed: false,
      soldAt: null,
      redeemedAt: null,
      soldByAdminId: null,
      redeemedByUserId: null,
      createdAt: Date.now()
    };
    db.codes.push(item);
    created.push(item);
  }
  saveDB();
  res.json({ ok: true, created });
});

app.get("/api/codes/supervisor", requireAuth, requireRole("supervisor"), (_req, res) => {
  // Supervisor sieht alle
  res.json({ codes: db.codes.slice().reverse(), admins: db.users.filter((u) => u.role === "admin").map((a) => ({ id: a.id, username: a.username, branch: a.branch })) });
});

app.get("/api/codes/admin", requireAuth, requireRole("admin"), (req, res) => {
  // Admin sieht nur seine sichtbaren Codes
  const codes = db.codes.filter((c) => c.assignedAdminId === req.user.id && c.visibleToAdmin).slice().reverse();
  res.json({ codes });
});

app.post("/api/codes/toggle-visible", requireAuth, requireRole("supervisor"), (req, res) => {
  const codeId = Number(req.body.codeId);
  const visible = !!req.body.visible;

  const c = db.codes.find((x) => x.id === codeId);
  if (!c) return res.status(404).json({ error: "Code nicht gefunden" });

  if (c.sold) return res.status(400).json({ error: "Verkaufte Codes können nicht versteckt werden" });

  c.visibleToAdmin = visible;
  saveDB();
  res.json({ ok: true });
});

app.post("/api/codes/mark-sold", requireAuth, requireRole("admin"), (req, res) => {
  const codeId = Number(req.body.codeId);
  const c = db.codes.find((x) => x.id === codeId);

  if (!c) return res.status(404).json({ error: "Code nicht gefunden" });
  if (c.assignedAdminId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
  if (!c.visibleToAdmin) return res.status(400).json({ error: "Code ist nicht sichtbar" });
  if (c.redeemed) return res.status(400).json({ error: "Code ist bereits eingelöst" });

  c.sold = true;
  c.soldAt = Date.now();
  c.soldByAdminId = req.user.id;
  saveDB();
  res.json({ ok: true, code: c });
});

app.post("/api/codes/redeem", requireAuth, requireRole("user"), (req, res) => {
  const u = req.user;
  if (u.blocked) return res.status(403).json({ error: "Konto gesperrt. Bitte Admin kontaktieren." });

  const input = safeTrim(req.body.code).toUpperCase();
  if (!input) return res.status(400).json({ error: "Code erforderlich" });

  const c = db.codes.find((x) => x.code === input);

  // Sicherheit: Code muss existieren UND verkauft sein
  if (!c || !c.sold) {
    u.wrongRedeemAttempts = Number(u.wrongRedeemAttempts || 0) + 1;

    if (u.wrongRedeemAttempts >= 3) {
      u.blocked = true;
      const id = nextId("blockEvents");
      db.blockEvents.push({
        id,
        userId: u.id,
        username: u.username,
        branch: u.branch,
        reason: "3x falscher Code",
        at: Date.now()
      });
    }
    saveDB();
    return res.status(400).json({ error: "Dieser Code existiert nicht." });
  }

  // Branch Check: User muss gleiche Filiale haben
  if (c.branch !== u.branch) {
    u.wrongRedeemAttempts = Number(u.wrongRedeemAttempts || 0) + 1;
    if (u.wrongRedeemAttempts >= 3) {
      u.blocked = true;
      const id = nextId("blockEvents");
      db.blockEvents.push({
        id,
        userId: u.id,
        username: u.username,
        branch: u.branch,
        reason: "3x falscher Code (Filiale)",
        at: Date.now()
      });
    }
    saveDB();
    return res.status(400).json({ error: "Dieser Code existiert nicht." });
  }

  if (c.redeemed) return res.status(400).json({ error: "Code wurde bereits benutzt." });

  // Erfolg
  c.redeemed = true;
  c.redeemedAt = Date.now();
  c.redeemedByUserId = u.id;
  u.creditDzd = Number(u.creditDzd || 0) + Number(c.amount || 0);
  u.wrongRedeemAttempts = 0;

  saveDB();
  res.json({ ok: true, added: c.amount, creditDzd: u.creditDzd });
});

app.get("/api/codes/stats", requireAuth, requireRole("supervisor"), (_req, res) => {
  const admins = db.users.filter((u) => u.role === "admin").map((a) => ({ id: a.id, username: a.username, branch: a.branch }));

  const perAdmin = admins.map((a) => {
    const codes = db.codes.filter((c) => c.assignedAdminId === a.id);
    const visible = codes.filter((c) => c.visibleToAdmin && !c.sold && !c.redeemed);
    const sold = codes.filter((c) => c.sold && !c.redeemed);
    const redeemed = codes.filter((c) => c.redeemed);

    const sumVisible = visible.reduce((acc, x) => acc + Number(x.amount || 0), 0);
    const sumSold = sold.reduce((acc, x) => acc + Number(x.amount || 0), 0);
    const sumRedeemed = redeemed.reduce((acc, x) => acc + Number(x.amount || 0), 0);

    return { adminId: a.id, admin: a.username, branch: a.branch, sumVisible, sumSold, sumRedeemed, countVisible: visible.length, countSold: sold.length, countRedeemed: redeemed.length };
  });

  const totalVisible = perAdmin.reduce((acc, x) => acc + x.sumVisible, 0);
  const totalSold = perAdmin.reduce((acc, x) => acc + x.sumSold, 0);
  const totalRedeemed = perAdmin.reduce((acc, x) => acc + x.sumRedeemed, 0);

  res.json({ totalVisible, totalSold, totalRedeemed, perAdmin });
});

// ---------------- PRODUCTS ----------------
app.post(
  "/api/products/upload",
  requireAuth,
  requireRole("admin", "supervisor"),
  upload.fields([{ name: "pdf", maxCount: 1 }, { name: "thumb", maxCount: 1 }]),
  async (req, res) => {
    try {
      const pdfFile = req.files?.pdf?.[0];
      const thumbFile = req.files?.thumb?.[0];
      if (!pdfFile) return res.status(400).json({ error: "PDF fehlt" });

      // branch: Admin fix, Supervisor wählbar
      let branch = req.user.role === "admin" ? req.user.branch : safeTrim(req.body.branch);
      if (!branch) branch = "Filiale 1";

      const title = safeTrim(req.body.title) || (pdfFile.originalname || "Dokument").replace(/\.[^.]+$/, "");
      const facultyId = Number(req.body.facultyId || 0) || null;
      const trackId = Number(req.body.trackId || 0) || null;
      const yearId = Number(req.body.yearId || 0) || null;
      const moduleId = Number(req.body.moduleId || 0) || null;
      const groupId = Number(req.body.groupId || 0) || null;
      const professorId = Number(req.body.professorId || 0) || null;

      // Pages zählen (pdf-lib)
      const bytes = fs.readFileSync(pdfFile.path);
      const pdfDoc = await PDFDocument.load(bytes);
      const pages = pdfDoc.getPageCount() || 1;

      const mode = safeTrim(req.body.mode) || "auto"; // auto | auto_plus_extra | fixed
      const fixedPrice = Number(req.body.fixedPrice || 0) || 0;
      const extraKey = safeTrim(req.body.extraKey) || "";
      const discountType = safeTrim(req.body.discountType) || "none";
      const discountValue = Number(req.body.discountValue || 0) || 0;

      const id = nextId("products");
      const product = {
        id,
        title,
        branch,
        facultyId,
        trackId,
        yearId,
        moduleId,
        groupId,
        professorId,
        pages,
        mode,
        fixedPrice,
        extraKey,
        discountType,
        discountValue,
        note: safeTrim(req.body.note) || "",
        hidden: false,
        createdAt: Date.now(),
        pdfPath: `/uploads/${path.basename(pdfFile.path)}`,
        thumbPath: thumbFile ? `/uploads/${path.basename(thumbFile.path)}` : ""
      };

      db.products.push(product);
      saveDB();

      const price = computePrice(product);
      res.json({
        ok: true,
        product: {
          ...product,
          originalPrice: price.originalPrice,
          price: price.finalPrice
        }
      });
    } catch (e) {
      res.status(500).json({ error: "Upload fehlgeschlagen", details: String(e?.message || e) });
    }
  }
);

app.post(
  "/api/products/upload-multiple",
  requireAuth,
  requireRole("admin", "supervisor"),
  upload.fields([{ name: "pdfs", maxCount: 20 }, { name: "thumbs", maxCount: 20 }]),
  async (req, res) => {
    try {
      const pdfs = req.files?.pdfs || [];
      const thumbs = req.files?.thumbs || [];
      if (!pdfs.length) return res.status(400).json({ error: "PDFs fehlen" });

      let branch = req.user.role === "admin" ? req.user.branch : safeTrim(req.body.branch);
      if (!branch) branch = "Filiale 1";

      const facultyId = Number(req.body.facultyId || 0) || null;
      const trackId = Number(req.body.trackId || 0) || null;
      const yearId = Number(req.body.yearId || 0) || null;
      const moduleId = Number(req.body.moduleId || 0) || null;
      const groupId = Number(req.body.groupId || 0) || null;
      const professorId = Number(req.body.professorId || 0) || null;

      const mode = safeTrim(req.body.mode) || "auto";
      const fixedPrice = Number(req.body.fixedPrice || 0) || 0;
      const extraKey = safeTrim(req.body.extraKey) || "";
      const discountType = safeTrim(req.body.discountType) || "none";
      const discountValue = Number(req.body.discountValue || 0) || 0;
      const note = safeTrim(req.body.note) || "";

      const created = [];
      for (let i = 0; i < pdfs.length; i++) {
        const pdfFile = pdfs[i];
        const thumbFile = thumbs[i] || null;
        const title = (pdfFile.originalname || "Dokument").replace(/\.[^.]+$/, "");

        const bytes = fs.readFileSync(pdfFile.path);
        const pdfDoc = await PDFDocument.load(bytes);
        const pages = pdfDoc.getPageCount() || 1;

        const id = nextId("products");
        const product = {
          id,
          title,
          branch,
          facultyId,
          trackId,
          yearId,
          moduleId,
          groupId,
          professorId,
          pages,
          mode,
          fixedPrice,
          extraKey,
          discountType,
          discountValue,
          note,
          hidden: false,
          createdAt: Date.now(),
          pdfPath: `/uploads/${path.basename(pdfFile.path)}`,
          thumbPath: thumbFile ? `/uploads/${path.basename(thumbFile.path)}` : ""
        };

        db.products.push(product);
        const price = computePrice(product);
        created.push({ ...product, originalPrice: price.originalPrice, price: price.finalPrice });
      }
      saveDB();
      res.json({ ok: true, createdCount: created.length, products: created });
    } catch (e) {
      res.status(500).json({ error: "Batch Upload fehlgeschlagen", details: String(e?.message || e) });
    }
  }
);

app.get("/api/products", requireAuth, (req, res) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 20)));
  const offset = Math.max(0, Number(req.query.offset || 0));

  const items = db.products
    .filter((p) => !p.hidden)
    .filter((p) => matchesUserProfile(p, req.user))
    .sort((a, b) => b.createdAt - a.createdAt);

  const slice = items.slice(offset, offset + limit).map((p) => {
    const price = computePrice(p);
    return {
      id: p.id,
      title: p.title,
      pages: p.pages,
      branch: p.branch,
      facultyId: p.facultyId,
      trackId: p.trackId,
      yearId: p.yearId,
      moduleId: p.moduleId,
      groupId: p.groupId,
      professorId: p.professorId,
      note: p.note,
      createdAt: p.createdAt,
      thumbPath: p.thumbPath,
      originalPrice: price.originalPrice,
      price: price.finalPrice,
      discountType: p.discountType,
      discountValue: p.discountValue
    };
  });

  res.json({ ok: true, total: items.length, offset, limit, products: slice });
});

app.get("/api/products/admin", requireAuth, requireRole("admin", "supervisor"), (req, res) => {
  const branch = req.user.role === "admin" ? req.user.branch : safeTrim(req.query.branch) || "";
  const items = db.products
    .filter((p) => (branch ? p.branch === branch : true))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => {
      const price = computePrice(p);
      return { ...p, originalPrice: price.originalPrice, price: price.finalPrice };
    });

  res.json({ ok: true, products: items });
});

app.post("/api/products/update", requireAuth, requireRole("admin", "supervisor"), (req, res) => {
  const id = Number(req.body.id);
  const p = db.products.find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: "Produkt nicht gefunden" });

  // Admin darf nur eigene Filiale
  if (req.user.role === "admin" && p.branch !== req.user.branch) return res.status(403).json({ error: "Forbidden" });

  if (req.body.mode) p.mode = safeTrim(req.body.mode);
  if (req.body.fixedPrice != null) p.fixedPrice = Number(req.body.fixedPrice || 0);
  if (req.body.extraKey != null) p.extraKey = safeTrim(req.body.extraKey);
  if (req.body.discountType != null) p.discountType = safeTrim(req.body.discountType);
  if (req.body.discountValue != null) p.discountValue = Number(req.body.discountValue || 0);
  if (req.body.note != null) p.note = safeTrim(req.body.note);
  if (req.body.hidden != null) p.hidden = !!req.body.hidden;

  saveDB();
  const price = computePrice(p);
  res.json({ ok: true, product: { ...p, originalPrice: price.originalPrice, price: price.finalPrice } });
});

// ---------------- ORDERS (basic) ----------------
app.post("/api/orders/create", requireAuth, requireRole("user"), (req, res) => {
  const u = req.user;
  if (u.blocked) return res.status(403).json({ error: "Konto gesperrt. Keine Käufe möglich." });

  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: "Warenkorb leer" });

  // Produkte validieren
  const products = items.map((it) => {
    const p = db.products.find((x) => x.id === Number(it.productId));
    if (!p || p.hidden) return null;
    if (!matchesUserProfile(p, u)) return null;
    const qty = Math.max(1, Number(it.qty || 1));
    const price = computePrice(p).finalPrice;
    return { productId: p.id, title: p.title, qty, unitPrice: price, lineTotal: price * qty };
  }).filter(Boolean);

  if (!products.length) return res.status(400).json({ error: "Keine gültigen Produkte" });

  const sum = products.reduce((acc, x) => acc + x.lineTotal, 0);
  if (Number(u.creditDzd || 0) < sum) return res.status(400).json({ error: "Nicht genug Guthaben" });

  u.creditDzd = Number(u.creditDzd || 0) - sum;

  const id = nextId("orders");
  const order = {
    id,
    userId: u.id,
    username: u.username,
    branch: u.branch,
    items: products,
    sum,
    status: "paid", // paid -> printed
    createdAt: Date.now(),
    printedAt: null
  };
  db.orders.push(order);
  saveDB();
  res.json({ ok: true, orderId: order.id, creditDzd: u.creditDzd });
});

app.get("/api/orders/admin", requireAuth, requireRole("admin", "supervisor"), (req, res) => {
  const orders = db.orders
    .filter((o) => (req.user.role === "admin" ? o.branch === req.user.branch : true))
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json({ ok: true, orders });
});

app.post("/api/orders/mark-printed", requireAuth, requireRole("admin", "supervisor"), (req, res) => {
  const id = Number(req.body.orderId);
  const o = db.orders.find((x) => x.id === id);
  if (!o) return res.status(404).json({ error: "Order nicht gefunden" });
  if (req.user.role === "admin" && o.branch !== req.user.branch) return res.status(403).json({ error: "Forbidden" });

  o.status = "printed";
  o.printedAt = Date.now();
  saveDB();
  res.json({ ok: true });
});

// ---------------- HEALTH ----------------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ Server läuft auf http://localhost:${PORT}`);
});
