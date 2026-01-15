/* global pdfjsLib */

const API = "";

const el = (id) => document.getElementById(id);

const state = {
  token: null,
  user: null,
  settings: null,
  catalogs: null,

  // user
  userTab: "products",
  products: [],
  productsTotal: 0,
  productsOffset: 0,
  productsLoading: false,
  cart: [],
  history: [],

  // admin/supervisor
  adminTab: "orders",
  supTab: "codes",

  // codes
  supCodes: [],
  adminCodes: [],
  codeAmountTab: 500,

  admins: [],
  users: [],
  blockEvents: [],
  orders: [],
  adminProducts: [],

  // upload selections
  upload: {
    branch: "",
    facultyId: null,
    trackId: null,
    yearId: null,
    moduleId: null,
    groupId: null,
    professorId: null,
    mode: "auto",
    fixedPrice: 0,
    extraKey: "extra1",
    discountType: "none",
    discountValue: 0,
    note: ""
  }
};

function toast(title, msg = "") {
  const host = el("toastHost");
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<b>${escapeHtml(title)}</b><div class="small">${escapeHtml(msg)}</div>`;
  host.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateY(6px)";
    setTimeout(() => t.remove(), 260);
  }, 2400);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

async function apiGet(path) {
  const res = await fetch(API + path, {
    headers: state.token ? { "x-token": state.token } : {}
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { "x-token": state.token } : {})
    },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function apiPostForm(path, formData) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: state.token ? { "x-token": state.token } : {},
    body: formData
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ---------------- THEME ----------------
function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  document.body.classList.toggle("light", saved === "light");
  el("themeBtn").textContent = saved === "light" ? "🌙" : "☀️";
}
function toggleTheme() {
  const isLight = document.body.classList.toggle("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  el("themeBtn").textContent = isLight ? "🌙" : "☀️";
}

// ---------------- AUTH/UI ----------------
function setBrandSub() {
  if (!state.user) {
    el("brandSub").textContent = "—";
    return;
  }
  el("brandSub").textContent = `${state.user.role.toUpperCase()} · ${state.user.username} · ${state.user.branch}`;
}

function setCreditChip() {
  const c = state.user?.creditDzd || 0;
  el("creditChip").textContent = `${c} ${state.settings?.currency || "DZD"}`;
}

function showView(which) {
  el("viewLogin").classList.toggle("hidden", which !== "login");
  el("viewUser").classList.toggle("hidden", which !== "user");
  el("viewAdmin").classList.toggle("hidden", which !== "admin");
  el("viewSupervisor").classList.toggle("hidden", which !== "supervisor");
}

function setTopButtonsVisibility() {
  const logged = !!state.user;
  el("logoutBtn").style.display = logged ? "inline-flex" : "none";
  el("creditChip").style.display = logged ? "inline-flex" : "none";
  el("themeBtn").style.display = "inline-flex";
}

async function login() {
  const username = el("loginUser").value.trim();
  const password = el("loginPass").value.trim();
  const data = await apiPost("/api/auth/login", { username, password });
  state.token = data.token;
  state.user = data.user;

  localStorage.setItem("token", state.token);

  await bootstrapAfterLogin();
  toast("Willkommen", `${state.user.username} (${state.user.role})`);
}

async function register() {
  const username = el("regUser").value.trim();
  const password = el("regPass").value.trim();
  const branch = el("regBranch").value;
  const data = await apiPost("/api/auth/register", { username, password, branch });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem("token", state.token);

  await bootstrapAfterLogin();
  toast("Registriert", "Account erstellt ✅");
}

async function bootstrapAfterLogin() {
  setTopButtonsVisibility();
  setBrandSub();

  state.settings = await apiGet("/api/settings");
  state.catalogs = await apiGet("/api/catalogs");

  // reset paged products
  state.products = [];
  state.productsTotal = 0;
  state.productsOffset = 0;
  state.productsLoading = false;
  state.cart = [];
  state.history = [];

  setCreditChip();
  fillRegisterBranches();

  if (state.user.role === "user") {
    showView("user");
    bindUserTabs();
    await loadUserProducts(true);
    renderUserAll();
  } else if (state.user.role === "admin") {
    showView("admin");
    bindAdminTabs();
    await loadAdminOrders();
    await loadAdminCodes();
    await loadAdminProducts();
    renderAdminAll();
  } else {
    showView("supervisor");
    bindSupervisorTabs();
    await loadSupervisorAdmins();
    await loadSupervisorCodes();
    await loadSupervisorUsers();
    await loadSupervisorStats();
    await loadSupervisorProducts();
    renderSupervisorAll();
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("token");
  setTopButtonsVisibility();
  setBrandSub();
  showView("login");
  toast("Abgemeldet", "Bis bald 👋");
}

// ---------------- INIT LOGIN UI ----------------
function fillRegisterBranches() {
  const sel = el("regBranch");
  if (!sel) return;
  sel.innerHTML = "";
  const branches = state.catalogs?.branches || ["Filiale 1"];
  for (const b of branches) {
    const o = document.createElement("option");
    o.value = b;
    o.textContent = b;
    sel.appendChild(o);
  }
}

// ---------------- USER ----------------
function bindUserTabs() {
  const tabs = el("viewUser").querySelectorAll(".tab");
  tabs.forEach((t) => {
    t.onclick = async () => {
      tabs.forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      state.userTab = t.dataset.tab;
      renderUserAll();

      if (state.userTab === "products" && state.products.length === 0) {
        await loadUserProducts(true);
        renderUserAll();
      }
    };
  });
}

function renderUserAll() {
  const panes = {
    products: el("userTabProducts"),
    cart: el("userTabCart"),
    history: el("userTabHistory"),
    profile: el("userTabProfile"),
    redeem: el("userTabRedeem")
  };
  for (const k in panes) panes[k].classList.toggle("hidden", state.userTab !== k);

  renderUserProducts();
  renderUserCart();
  renderUserHistory();
  renderUserProfile();
  renderUserRedeem();
  updateCartBadge();
  setCreditChip();
}

function updateCartBadge() {
  const n = state.cart.reduce((acc, x) => acc + x.qty, 0);
  el("cartBadge").textContent = String(n);
}

async function loadUserProducts(reset = false) {
  if (state.productsLoading) return;
  state.productsLoading = true;

  try {
    if (reset) {
      state.products = [];
      state.productsOffset = 0;
    }
    const limit = 20;
    const data = await apiGet(`/api/products?limit=${limit}&offset=${state.productsOffset}`);
    state.productsTotal = data.total;
    state.productsOffset += data.products.length;
    state.products.push(...data.products);
  } catch (e) {
    toast("Fehler", e.message);
  } finally {
    state.productsLoading = false;
  }
}

function renderUserProducts() {
  const host = el("userTabProducts");
  if (state.userTab !== "products") return;

  host.innerHTML = `
    <div class="card">
      <div class="kpi">
        <div class="pill">Produkte: ${state.products.length}/${state.productsTotal}</div>
        <button class="btn-sm primary" id="btnMore">Mehr laden</button>
        <button class="btn-sm" id="btnRefresh">Aktualisieren</button>
      </div>
      <hr class="soft"/>
      <div id="prodList"></div>
      <div class="small" style="margin-top:10px;color:var(--muted)">
        Tipp: Bilder werden nur für sichtbare Produkte geladen (leichter für langsames Internet).
      </div>
    </div>
  `;

  host.querySelector("#btnRefresh").onclick = async () => {
    await loadUserProducts(true);
    renderUserAll();
  };
  host.querySelector("#btnMore").onclick = async () => {
    await loadUserProducts(false);
    renderUserAll();
  };

  const list = host.querySelector("#prodList");
  if (!state.products.length) {
    list.innerHTML = `<div class="small">Keine Produkte gefunden (prüfe deine Einstellungen/Filiale).</div>`;
    return;
  }

  list.innerHTML = state.products.map((p) => {
    const discounted = p.originalPrice !== p.price;
    const priceHtml = discounted
      ? `<span class="strike">${p.originalPrice} DZD</span><b>${p.price} DZD</b> <span class="pill-green">↓ Rabatt</span>`
      : `<b>${p.price} DZD</b>`;

    const noteBadge = p.note ? `<span class="pill-red">!</span>` : ``;

    return `
      <div class="row">
        <div style="display:flex;gap:12px;align-items:center;min-width:0;">
          ${p.thumbPath ? `<img class="thumb" src="${p.thumbPath}" alt="thumb" loading="lazy"/>` : `<div class="thumb"></div>`}
          <div style="min-width:0;">
            <div style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(p.title)} ${noteBadge}
            </div>
            <div class="small">${p.pages} Seiten · ${priceHtml}</div>
          </div>
        </div>
        <div class="actions">
          ${p.note ? `<button class="btn-sm" data-note="${p.id}">Hinweis</button>` : ``}
          <button class="btn-sm primary" data-add="${p.id}">In Korb</button>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-add]").forEach((b) => {
    b.onclick = () => {
      const id = Number(b.dataset.add);
      const p = state.products.find((x) => x.id === id);
      if (!p) return;
      const existing = state.cart.find((x) => x.productId === id);
      if (existing) existing.qty += 1;
      else state.cart.push({ productId: id, title: p.title, unitPrice: p.price, qty: 1 });
      toast("Korb", "Produkt hinzugefügt");
      updateCartBadge();
    };
  });

  list.querySelectorAll("[data-note]").forEach((b) => {
    b.onclick = () => {
      const id = Number(b.dataset.note);
      const p = state.products.find((x) => x.id === id);
      if (!p) return;
      toast("Hinweis", p.note || "");
    };
  });
}

function renderUserCart() {
  const host = el("userTabCart");
  if (state.userTab !== "cart") return;

  const sum = state.cart.reduce((acc, x) => acc + x.unitPrice * x.qty, 0);

  host.innerHTML = `
    <div class="card">
      <div class="card-title">Korb</div>
      <div class="small">Summe: <b>${sum} DZD</b></div>
      <hr class="soft"/>
      <div id="cartList"></div>
      <div class="actions" style="margin-top:12px;">
        <button class="btn-sm" id="cartClear">Leeren</button>
        <button class="btn-sm primary" id="cartBuy">Kaufen</button>
      </div>
      <div class="small" style="margin-top:10px;">Gesperrte Konten können nicht kaufen.</div>
    </div>
  `;

  const list = host.querySelector("#cartList");
  if (!state.cart.length) {
    list.innerHTML = `<div class="small">Korb ist leer.</div>`;
    return;
  }

  list.innerHTML = state.cart.map((it) => `
    <div class="row">
      <div style="min-width:0;">
        <div style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(it.title)}</div>
        <div class="small">${it.unitPrice} DZD · Menge: ${it.qty}</div>
      </div>
      <div class="actions">
        <button class="btn-sm" data-minus="${it.productId}">−</button>
        <button class="btn-sm" data-plus="${it.productId}">+</button>
        <button class="btn-sm danger" data-del="${it.productId}">Entfernen</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-minus]").forEach((b) => {
    b.onclick = () => {
      const id = Number(b.dataset.minus);
      const it = state.cart.find((x) => x.productId === id);
      if (!it) return;
      it.qty = Math.max(1, it.qty - 1);
      renderUserAll();
    };
  });
  list.querySelectorAll("[data-plus]").forEach((b) => {
    b.onclick = () => {
      const id = Number(b.dataset.plus);
      const it = state.cart.find((x) => x.productId === id);
      if (!it) return;
      it.qty += 1;
      renderUserAll();
    };
  });
  list.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = () => {
      const id = Number(b.dataset.del);
      state.cart = state.cart.filter((x) => x.productId !== id);
      renderUserAll();
    };
  });

  host.querySelector("#cartClear").onclick = () => {
    state.cart = [];
    toast("Korb", "Geleert");
    renderUserAll();
  };

  host.querySelector("#cartBuy").onclick = async () => {
    try {
      const payload = state.cart.map((x) => ({ productId: x.productId, qty: x.qty }));
      const data = await apiPost("/api/orders/create", { items: payload });
      state.user.creditDzd = data.creditDzd;
      state.history.unshift({ orderId: data.orderId, at: Date.now(), items: [...state.cart] });
      state.cart = [];
      toast("Gekauft ✅", `Bestellung #${data.orderId}`);
      renderUserAll();
    } catch (e) {
      toast("Fehler", e.message);
    }
  };
}

function renderUserHistory() {
  const host = el("userTabHistory");
  if (state.userTab !== "history") return;

  host.innerHTML = `
    <div class="card">
      <div class="card-title">Historie</div>
      <div class="small">Ohne Preise (wie gewünscht). Nur Produkt + Menge.</div>
      <hr class="soft"/>
      <div id="histList"></div>
    </div>
  `;

  const list = host.querySelector("#histList");
  if (!state.history.length) {
    list.innerHTML = `<div class="small">Noch keine Käufe.</div>`;
    return;
  }

  list.innerHTML = state.history.map((h) => `
    <div class="row">
      <div style="min-width:0;">
        <div style="font-weight:900;">Kauf #${h.orderId}</div>
        <div class="small">${new Date(h.at).toLocaleString()}</div>
        <div class="small" style="margin-top:6px;">
          ${h.items.map((it) => `${escapeHtml(it.title)} × ${it.qty}`).join("<br/>")}
        </div>
      </div>
    </div>
  `).join("");
}

function renderUserProfile() {
  const host = el("userTabProfile");
  if (state.userTab !== "profile") return;

  const c = state.catalogs;
  const branch = state.user.branch;

  const faculties = (c.faculties || []).filter((f) => f.branch === branch);
  const prof = state.user.profile || {};

  const selectedFaculty = Number(prof.facultyId || faculties[0]?.id || 0) || 0;
  const tracks = (c.tracks || []).filter((t) => Number(t.facultyId) === selectedFaculty);
  const selectedTrack = Number(prof.trackId || tracks[0]?.id || 0) || 0;

  const years = (c.years || []).filter((y) => Number(y.trackId) === selectedTrack);
  const selectedYear = Number(prof.yearId || years[0]?.id || 0) || 0;

  const modules = (c.modules || []).filter((m) => Number(m.yearId) === selectedYear);
  const selectedModule = Number(prof.moduleId || modules[0]?.id || 0) || 0;

  const groups = (c.groups || []).filter((g) => Number(g.moduleId) === selectedModule);
  const selectedGroup = Number(prof.groupId || groups[0]?.id || 0) || 0;

  host.innerHTML = `
    <div class="card">
      <div class="card-title">Einstellungen</div>
      <div class="small">Filiale ist an dein Konto gebunden: <b>${escapeHtml(branch)}</b></div>
      <hr class="soft"/>

      <div class="grid2">
        <div class="field">
          <label>Fakultät</label>
          <select class="input" id="uFaculty"></select>
        </div>
        <div class="field">
          <label>Fachbereich</label>
          <select class="input" id="uTrack"></select>
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <label>Studienjahr</label>
          <select class="input" id="uYear"></select>
        </div>
        <div class="field">
          <label>Modul</label>
          <select class="input" id="uModule"></select>
        </div>
      </div>

      <div class="field">
        <label>Gruppe</label>
        <select class="input" id="uGroup"></select>
      </div>

      <button class="button full" id="uSave">Speichern</button>
      <div class="small" style="margin-top:10px;">Nach Speichern: Produkte aktualisieren, damit passende Produkte angezeigt werden.</div>
    </div>
  `;

  const selFaculty = host.querySelector("#uFaculty");
  selFaculty.innerHTML = faculties.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("");
  selFaculty.value = String(selectedFaculty || "");

  const selTrack = host.querySelector("#uTrack");
  selTrack.innerHTML = tracks.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  selTrack.value = String(selectedTrack || "");

  const selYear = host.querySelector("#uYear");
  selYear.innerHTML = years.map((y) => `<option value="${y.id}">${escapeHtml(y.name)}</option>`).join("");
  selYear.value = String(selectedYear || "");

  const selModule = host.querySelector("#uModule");
  selModule.innerHTML = modules.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
  selModule.value = String(selectedModule || "");

  const selGroup = host.querySelector("#uGroup");
  selGroup.innerHTML = groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("");
  selGroup.value = String(selectedGroup || "");

  host.querySelector("#uSave").onclick = async () => {
    try {
      await apiPost("/api/profile", {
        facultyId: Number(selFaculty.value || 0) || null,
        trackId: Number(selTrack.value || 0) || null,
        yearId: Number(selYear.value || 0) || null,
        moduleId: Number(selModule.value || 0) || null,
        groupId: Number(selGroup.value || 0) || null
      });
      toast("Gespeichert", "Profil aktualisiert ✅");
      await loadUserProducts(true);
      renderUserAll();
    } catch (e) {
      toast("Fehler", e.message);
    }
  };

  // cascading UI update (ohne full rerender): bei Änderung reloaden wir die Profile-Ansicht
  selFaculty.onchange = () => {
    state.user.profile = state.user.profile || {};
    state.user.profile.facultyId = Number(selFaculty.value || 0) || null;
    state.user.profile.trackId = null;
    state.user.profile.yearId = null;
    state.user.profile.moduleId = null;
    state.user.profile.groupId = null;
    renderUserAll();
  };
  selTrack.onchange = () => {
    state.user.profile.trackId = Number(selTrack.value || 0) || null;
    state.user.profile.yearId = null;
    state.user.profile.moduleId = null;
    state.user.profile.groupId = null;
    renderUserAll();
  };
  selYear.onchange = () => {
    state.user.profile.yearId = Number(selYear.value || 0) || null;
    state.user.profile.moduleId = null;
    state.user.profile.groupId = null;
    renderUserAll();
  };
  selModule.onchange = () => {
    state.user.profile.moduleId = Number(selModule.value || 0) || null;
    state.user.profile.groupId = null;
    renderUserAll();
  };
}

function renderUserRedeem() {
  const host = el("userTabRedeem");
  if (state.userTab !== "redeem") return;

  host.innerHTML = `
    <div class="card">
      <div class="card-title">Code einlösen</div>
      <div class="small">Hinweis: Code ist nur gültig, wenn er vom Admin vorher als „verkauft“ markiert wurde.</div>
      <hr class="soft"/>
      <div class="field">
        <label>Code</label>
        <input class="input" id="redeemCode" inputmode="text" autocomplete="off" placeholder="XXXX-XXXX-XXXX" />
      </div>
      <button class="button full" id="redeemBtn">Einlösen</button>
      <div class="small" style="margin-top:10px;">
        Sicherheit: 3× falscher Code → Konto wird gesperrt.
      </div>
    </div>
  `;

  host.querySelector("#redeemBtn").onclick = async () => {
    try {
      const code = host.querySelector("#redeemCode").value.trim();
      const data = await apiPost("/api/codes/redeem", { code });
      state.user.creditDzd = data.creditDzd;
      setCreditChip();
      toast("Erfolg ✅", `+${data.added} DZD`);
    } catch (e) {
      toast("Fehler", e.message);
      // falls gesperrt, UI aktualisieren
      if (String(e.message || "").includes("gesperrt")) {
        state.user.blocked = true;
      }
    }
  };
}

// ---------------- ADMIN ----------------
function bindAdminTabs() {
  const tabs = el("viewAdmin").querySelectorAll(".tab");
  tabs.forEach((t) => {
    t.onclick = async () => {
      tabs.forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      state.adminTab = t.dataset.tab;
      renderAdminAll();

      if (state.adminTab === "orders") await loadAdminOrders();
      if (state.adminTab === "codes") await loadAdminCodes();
      if (state.adminTab === "products") await loadAdminProducts();
      if (state.adminTab === "users") await loadAdminUsers();
      renderAdminAll();
    };
  });
}

async function loadAdminOrders() {
  const data = await apiGet("/api/orders/admin");
  state.orders = data.orders || [];
}
async function loadAdminCodes() {
  const data = await apiGet("/api/codes/admin");
  state.adminCodes = data.codes || [];
}
async function loadAdminUsers() {
  const data = await apiGet("/api/users");
  state.users = data.users || [];
}
async function loadAdminProducts() {
  const data = await apiGet("/api/products/admin");
  state.adminProducts = data.products || [];
}

function renderAdminAll() {
  const panes = {
    orders: el("adminTabOrders"),
    products: el("adminTabProducts"),
    upload: el("adminTabUpload"),
    codes: el("adminTabCodes"),
    users: el("adminTabUsers"),
    pricing: el("adminTabPricing")
  };
  for (const k in panes) panes[k].classList.toggle("hidden", state.adminTab !== k);

  if (state.adminTab === "orders") renderAdminOrders();
  if (state.adminTab === "codes") renderAdminCodes();
  if (state.adminTab === "users") renderAdminUsers();
  if (state.adminTab === "products") renderAdminProducts();
  if (state.adminTab === "upload") renderUpload("admin");
  if (state.adminTab === "pricing") renderPricing("admin");
  setCreditChip();
}

function renderAdminOrders() {
  const host = el("adminTabOrders");
  host.innerHTML = `
    <div class="card">
      <div class="card-title">Bestellungen</div>
      <div class="small">Drucken in Web ist technisch eingeschränkt: wir nutzen Browser-Print (Rechnung als Seite).</div>
      <hr class="soft"/>
      <div class="actions">
        <button class="btn-sm" id="ordRefresh">Aktualisieren</button>
      </div>
      <hr class="soft"/>
      <div id="ordList"></div>
    </div>
  `;
  host.querySelector("#ordRefresh").onclick = async () => {
    await loadAdminOrders();
    renderAdminAll();
  };

  const list = host.querySelector("#ordList");
  if (!state.orders.length) {
    list.innerHTML = `<div class="small">Keine Bestellungen.</div>`;
    return;
  }

  list.innerHTML = state.orders.map((o) => `
    <div class="row">
      <div style="min-width:0;">
        <div style="font-weight:900;">#${o.id} · ${escapeHtml(o.username)}</div>
        <div class="small">${new Date(o.createdAt).toLocaleString()} · Summe: <b>${o.sum} DZD</b></div>
        <div class="small" style="margin-top:6px;">
          ${o.items.map((it) => `${escapeHtml(it.title)} × ${it.qty}`).join("<br/>")}
        </div>
      </div>
      <div class="actions">
        <span class="${o.status === "printed" ? "pill-green" : "pill-gray"}">${o.status}</span>
        <button class="btn-sm primary" data-print="${o.id}">Rechnung drucken</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-print]").forEach((b) => {
    b.onclick = async () => {
      const id = Number(b.dataset.print);
      const o = state.orders.find((x) => x.id === id);
      if (!o) return;
      printReceipt(o);
      try {
        await apiPost("/api/orders/mark-printed", { orderId: id });
        await loadAdminOrders();
        renderAdminAll();
      } catch (e) {
        toast("Fehler", e.message);
      }
    };
  });
}

function printReceipt(order) {
  const w = window.open("", "_blank");
  const html = `
  <html>
    <head>
      <title>Rechnung #${order.id}</title>
      <style>
        body{ font-family: Arial; margin: 30px; }
        .big{ font-size: 44px; font-weight: 900; }
        .sub{ color:#444;margin-top:6px; }
        table{ width:100%; border-collapse:collapse; margin-top:18px; }
        th,td{ border:1px solid #ccc; padding:10px; text-align:left; }
        .right{ text-align:right; }
        .thanks{ margin-top:22px; font-weight:700; }
        @media print{
          .pagebreak{ page-break-after: always; }
        }
      </style>
    </head>
    <body>
      <div class="big">BESTELLUNG #${order.id}</div>
      <div class="sub">Kunde: <b>${escapeHtml(order.username)}</b></div>
      <div class="sub">Datum: ${new Date(order.createdAt).toLocaleString()}</div>

      <table>
        <tr><th>Produkt</th><th>Menge</th><th class="right">Preis</th><th class="right">Summe</th></tr>
        ${order.items.map(it => `
          <tr>
            <td>${escapeHtml(it.title)}</td>
            <td>${it.qty}</td>
            <td class="right">${it.unitPrice} DZD</td>
            <td class="right">${it.lineTotal} DZD</td>
          </tr>
        `).join("")}
        <tr>
          <td colspan="3" class="right"><b>Gesamt</b></td>
          <td class="right"><b>${order.sum} DZD</b></td>
        </tr>
      </table>

      <div class="thanks">Vielen Dank! — Auf Wiedersehen 👋</div>

      <div class="pagebreak"></div>
      <div style="height: 80vh;"></div>
    </body>
  </html>
  `;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

function renderAdminCodes() {
  const host = el("adminTabCodes");
  host.innerHTML = `
    <div class="card">
      <div class="card-title">Codes</div>
      <div class="small">Nur Codes, die vom Supervisor für dich sichtbar gemacht wurden.</div>
      <hr class="soft"/>
      <div class="actions">
        <button class="btn-sm" id="cRefresh">Aktualisieren</button>
      </div>
      <hr class="soft"/>
      <div id="cList"></div>
    </div>
  `;

  host.querySelector("#cRefresh").onclick = async () => {
    await loadAdminCodes();
    renderAdminAll();
  };

  const list = host.querySelector("#cList");
  if (!state.adminCodes.length) {
    list.innerHTML = `<div class="small">Keine sichtbaren Codes.</div>`;
    return;
  }

  list.innerHTML = state.adminCodes.map((c) => {
    const status = c.redeemed ? "eingelöst" : (c.sold ? "verkauft" : "frisch");
    const pill = c.redeemed ? "pill-red" : (c.sold ? "pill-gray" : "pill-green");
    const btn = c.sold
      ? `<button class="btn-sm" data-copy="${c.id}">Kopieren</button>`
      : `<button class="btn-sm primary" data-sold="${c.id}">Verkauft + Kopieren</button>`;

    return `
      <div class="row">
        <div style="min-width:0;">
          <div style="font-weight:900;">${escapeHtml(c.code)}</div>
          <div class="small">Betrag: <b>${c.amount} DZD</b></div>
        </div>
        <div class="actions">
          <span class="${pill}">${status}</span>
          ${btn}
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-copy]").forEach((b) => {
    b.onclick = () => {
      const id = Number(b.dataset.copy);
      const c = state.adminCodes.find((x) => x.id === id);
      if (!c) return;
      copyToClipboard(`${c.code}`);
      toast("Kopiert", `${c.code} (${c.amount} DZD)`);
    };
  });

  list.querySelectorAll("[data-sold]").forEach((b) => {
    b.onclick = async () => {
      const id = Number(b.dataset.sold);
      try {
        const data = await apiPost("/api/codes/mark-sold", { codeId: id });
        const c = data.code;
        copyToClipboard(`${c.code}`);
        toast("Verkauft + kopiert ✅", `${c.code} (${c.amount} DZD)`);
        await loadAdminCodes();
        renderAdminAll();
      } catch (e) {
        toast("Fehler", e.message);
      }
    };
  });
}

function renderAdminUsers() {
  const host = el("adminTabUsers");
  host.innerHTML = `
    <div class="card">
      <div class="card-title">Benutzer</div>
      <div class="small">Gesperrte Benutzer können nicht kaufen/einlösen. Du kannst entsperren.</div>
      <hr class="soft"/>
      <div class="actions">
        <button class="btn-sm" id="uRefresh">Aktualisieren</button>
      </div>
      <hr class="soft"/>
      <div id="uList"></div>
    </div>
  `;
  host.querySelector("#uRefresh").onclick = async () => {
    await loadAdminUsers();
    renderAdminAll();
  };

  const list = host.querySelector("#uList");
  if (!state.users.length) {
    list.innerHTML = `<div class="small">Keine Benutzer in deiner Filiale.</div>`;
    return;
  }

  list.innerHTML = state.users.map((u) => `
    <div class="row">
      <div style="min-width:0;">
        <div style="font-weight:900;">${escapeHtml(u.username)}</div>
        <div class="small">Credit: <b>${u.creditDzd} DZD</b> · Fehlversuche: ${u.wrongRedeemAttempts}</div>
      </div>
      <div class="actions">
        <span class="${u.blocked ? "pill-red" : "pill-green"}">${u.blocked ? "gesperrt" : "aktiv"}</span>
        ${u.blocked ? `<button class="btn-sm primary" data-unblock="${u.id}">Entsperren</button>` : ``}
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-unblock]").forEach((b) => {
    b.onclick = async () => {
      const id = Number(b.dataset.unblock);
      try {
        await apiPost("/api/users/unblock", { userId: id });
        toast("Entsperrt ✅", "Benutzer wieder aktiv");
        await loadAdminUsers();
        renderAdminAll();
      } catch (e) {
        toast("Fehler", e.message);
      }
    };
  });
}

function renderAdminProducts() {
  const host = el("adminTabProducts");
  host.innerHTML = `
    <div class="card">
      <div class="card-title">Produkte (Filiale ${escapeHtml(state.user.branch)})</div>
      <div class="actions" style="margin-top:10px;">
        <button class="btn-sm" id="pRefresh">Aktualisieren</button>
      </div>
      <hr class="soft"/>
      <div id="pList"></div>
    </div>
  `;

  host.querySelector("#pRefresh").onclick = async () => {
    await loadAdminProducts();
    renderAdminAll();
  };

  const list = host.querySelector("#pList");
  if (!state.adminProducts.length) {
    list.innerHTML = `<div class="small">Noch keine Produkte.</div>`;
    return;
  }

  list.innerHTML = state.adminProducts.map((p) => `
    <div class="row">
      <div style="display:flex;gap:12px;align-items:center;min-width:0;">
        ${p.thumbPath ? `<img class="thumb" src="${p.thumbPath}" loading="lazy" />` : `<div class="thumb"></div>`}
        <div style="min-width:0;">
          <div style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.title)}</div>
          <div class="small">${p.pages} Seiten · <b>${p.price} DZD</b> ${p.originalPrice !== p.price ? `<span class="strike">${p.originalPrice} DZD</span>` : ""}</div>
          <div class="small">${p.hidden ? "Status: verborgen" : "Status: sichtbar"}</div>
        </div>
      </div>
      <div class="actions">
        <button class="btn-sm" data-toggle="${p.id}">${p.hidden ? "Einblenden" : "Ausblenden"}</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-toggle]").forEach((b) => {
    b.onclick = async () => {
      const id = Number(b.dataset.toggle);
      const p = state.adminProducts.find((x) => x.id === id);
      if (!p) return;
      try {
        await apiPost("/api/products/update", { id, hidden: !p.hidden });
        toast("OK", !p.hidden ? "Produkt verborgen" : "Produkt sichtbar");
        await loadAdminProducts();
        renderAdminAll();
      } catch (e) {
        toast("Fehler", e.message);
      }
    };
  });
}

// ---------------- SUPERVISOR ----------------
function bindSupervisorTabs() {
  const tabs = el("viewSupervisor").querySelectorAll(".tab");
  tabs.forEach((t) => {
    t.onclick = async () => {
      tabs.forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      state.supTab = t.dataset.tab;
      renderSupervisorAll();

      if (state.supTab === "codes") await loadSupervisorCodes();
      if (state.supTab === "admins") await loadSupervisorAdmins();
      if (state.supTab === "users") await loadSupervisorUsers();
      if (state.supTab === "security") await loadSupervisorSecurity();
      if (state.supTab === "products") await loadSupervisorProducts();
      renderSupervisorAll();
    };
  });
}

async function loadSupervisorAdmins() {
  const data = await apiGet("/api/admins");
  state.admins = data.admins || [];
}
async function loadSupervisorCodes() {
  const data = await apiGet("/api/codes/supervisor");
  state.supCodes = data.codes || [];
  // data.admins exist too, but we keep /api/admins as source
}
async function loadSupervisorUsers() {
  const data = await apiGet("/api/users");
  state.users = data.users || [];
}
async function loadSupervisorSecurity() {
  const data = await apiGet("/api/block-events");
  state.blockEvents = data.events || [];
}
async function loadSupervisorStats() {
  // prefetch
  try { await apiGet("/api/codes/stats"); } catch {}
}
async function loadSupervisorProducts() {
  const data = await apiGet("/api/products/admin");
  state.adminProducts = data.products || [];
}

function renderSupervisorAll() {
  const panes = {
    codes: el("supTabCodes"),
    admins: el("supTabAdmins"),
    products: el("supTabProducts"),
    upload: el("supTabUpload"),
    users: el("supTabUsers"),
    structure: el("supTabStructure"),
    pricing: el("supTabPricing"),
    security: el("supTabSecurity")
  };
  for (const k in panes) panes[k].classList.toggle("hidden", state.supTab !== k);

  if (state.supTab === "codes") renderSupervisorCodes();
  if (state.supTab === "admins") renderSupervisorAdmins();
  if (state.supTab === "products") renderSupervisorProducts();
  if (state.supTab === "upload") renderUpload("supervisor");
  if (state.supTab === "users") renderSupervisorUsers();
  if (state.supTab === "structure") renderStructure();
  if (state.supTab === "pricing") renderPricing("supervisor");
  if (state.supTab === "security") renderSupervisorSecurity();
  setCreditChip();
}

function renderSupervisorCodes() {
  const host = el("supTabCodes");
  host.innerHTML = `
    <div class="card">
      <div class="card-title">Codes</div>
      <div class="small">Generieren pro Admin (pro Filiale) + Tabs nach Betrag.</div>

      <div class="tabs2">
        <button class="tab2 ${state.codeAmountTab === 500 ? "active" : ""}" data-amt="500">500</button>
        <button class="tab2 ${state.codeAmountTab === 1000 ? "active" : ""}" data-amt="1000">1000</button>
        <button class="tab2 ${state.codeAmountTab === 2000 ? "active" : ""}" data-amt="2000">2000</button>
      </div>

      <div class="grid2">
        <div class="field">
          <label>Admin (Filiale)</label>
          <select class="input" id="genAdmin"></select>
        </div>
        <div class="field">
          <label>Anzahl</label>
          <div style="display:flex;gap:8px;">
            <button class="btn-sm" id="qtyMinus">−</button>
            <input class="input" id="genCount" value="1" inputmode="numeric" />
            <button class="btn-sm" id="qtyPlus">+</button>
          </div>
        </div>
      </div>

      <button class="button full" id="genBtn">Generieren</button>

      <hr class="soft"/>

      <div class="actions">
        <button class="btn-sm" id="supRefresh">Aktualisieren</button>
        <button class="btn-sm primary" id="supStats">Stats</button>
      </div>

      <div id="statsBox" style="margin-top:12px;"></div>
      <hr class="soft"/>
      <div id="codeList"></div>
    </div>
  `;

  // tabs
  host.querySelectorAll("[data-amt]").forEach((b) => {
    b.onclick = () => {
      state.codeAmountTab = Number(b.dataset.amt);
      renderSupervisorAll();
    };
  });

  // admin select
  const sel = host.querySelector("#genAdmin");
  sel.innerHTML = state.admins.map((a) => `<option value="${a.id}">${escapeHtml(a.username)} · ${escapeHtml(a.branch)}</option>`).join("");

  // plus/minus
  const inp = host.querySelector("#genCount");
  host.querySelector("#qtyMinus").onclick = () => {
    const v = Math.max(1, Number(inp.value || 1) - 1);
    inp.value = String(v);
  };
  host.querySelector("#qtyPlus").onclick = () => {
    const v = Math.min(50, Number(inp.value || 1) + 1);
    inp.value = String(v);
  };
  inp.onfocus = () => inp.select();

  host.querySelector("#genBtn").onclick = async () => {
    try {
      const adminId = Number(sel.value);
      const amount = Number(state.codeAmountTab);
      const count = Math.max(1, Math.min(50, Number(inp.value || 1)));
      await apiPost("/api/codes/generate", { adminId, amount, count });
      toast("Codes generiert ✅", `${count} × ${amount} DZD`);
      await loadSupervisorCodes();
      renderSupervisorAll();
    } catch (e) {
      toast("Fehler", e.message);
    }
  };

  host.querySelector("#supRefresh").onclick = async () => {
    await loadSupervisorCodes();
    renderSupervisorAll();
  };

  host.querySelector("#supStats").onclick = async () => {
    try {
      const data = await apiGet("/api/codes/stats");
      const box = host.querySelector("#statsBox");
      box.innerHTML = `
        <div class="kpi">
          <div class="pill">Sichtbar gesamt: ${data.totalVisible} DZD</div>
          <div class="pill">Verkauft gesamt: ${data.totalSold} DZD</div>
          <div class="pill">Eingelöst gesamt: ${data.totalRedeemed} DZD</div>
        </div>
        <div style="margin-top:10px;">
          ${data.perAdmin.map(x => `
            <div class="row">
              <div>
                <div style="font-weight:900;">${escapeHtml(x.admin)} · ${escapeHtml(x.branch)}</div>
                <div class="small">
                  Sichtbar: <b>${x.sumVisible} DZD</b> (${x.countVisible}) ·
                  Verkauft: <b>${x.sumSold} DZD</b> (${x.countSold}) ·
                  Eingelöst: <b>${x.sumRedeemed} DZD</b> (${x.countRedeemed})
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      `;
    } catch (e) {
      toast("Fehler", e.message);
    }
  };

  const list = host.querySelector("#codeList");
  const filtered = state.supCodes.filter((c) => Number(c.amount) === Number(state.codeAmountTab));

  if (!filtered.length) {
    list.innerHTML = `<div class="small">Keine Codes in diesem Betrag.</div>`;
    return;
  }

  list.innerHTML = filtered.map((c) => {
    const status = c.redeemed ? "eingelöst" : (c.sold ? "verkauft" : "frisch");
    const pill = c.redeemed ? "pill-red" : (c.sold ? "pill-gray" : "pill-green");

    const canToggle = !c.sold && !c.redeemed;
    const toggleText = c.visibleToAdmin ? "Verstecken" : "Sichtbar";
    const toggleBtn = canToggle
      ? `<button class="btn-sm" data-toggle="${c.id}" data-visible="${c.visibleToAdmin ? "0" : "1"}">${toggleText}</button>`
      : `<span class="small">—</span>`;

    return `
      <div class="row">
        <div style="min-width:0;">
          <div style="font-weight:900;">${escapeHtml(c.code)}</div>
          <div class="small">
            Admin: <b>${escapeHtml(findAdminName(c.assignedAdminId))}</b> · Filiale: ${escapeHtml(c.branch)}
          </div>
        </div>
        <div class="actions">
          <span class="${pill}">${status}</span>
          <span class="pill-gray">${c.amount} DZD</span>
          ${toggleBtn}
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-toggle]").forEach((b) => {
    b.onclick = async () => {
      const codeId = Number(b.dataset.toggle);
      const visible = b.dataset.visible === "1";
      try {
        await apiPost("/api/codes/toggle-visible", { codeId, visible });
        toast("OK", visible ? "Für Admin sichtbar" : "Versteckt");
        await loadSupervisorCodes();
        renderSupervisorAll();
      } catch (e) {
        toast("Fehler", e.message);
      }
    };
  });
}

function findAdminName(id) {
  const a = state.admins.find((x) => x.id === id);
  return a ? a.username : `Admin#${id}`;
}

function renderSupervisorAdmins() {
  const host = el("supTabAdmins");
  host.innerHTML = `
    <div class="card">
      <div class="card-title">Admins</div>
      <div class="small">Supervisor kann Admin-Konten erstellen und Filiale festlegen.</div>
      <hr class="soft"/>

      <div class="grid2">
        <div class="field">
          <label>Admin Username</label>
          <input class="input" id="aUser" inputmode="text" autocomplete="off"/>
        </div>
        <div class="field">
          <label>Passwort</label>
          <input class="input" id="aPass" type="password"/>
        </div>
      </div>

      <div class="field">
        <label>Filiale</label>
        <select class="input" id="aBranch"></select>
      </div>

      <button class="button full" id="aCreate">Admin erstellen</button>

      <hr class="soft"/>
      <div class="actions">
        <button class="btn-sm" id="aRefresh">Aktualisieren</button>
      </div>
      <hr class="soft"/>
      <div id="aList"></div>
    </div>
  `;

  // branches
  const sel = host.querySelector("#aBranch");
  sel.innerHTML = (state.catalogs?.branches || []).map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");

  host.querySelector("#aCreate").onclick = async () => {
    try {
      const username = host.querySelector("#aUser").value.trim();
      const password = host.querySelector("#aPass").value.trim();
      const branch = sel.value;
      await apiPost("/api/admins", { username, password, branch });
      toast("Admin erstellt ✅", `${username} · ${branch}`);
      await loadSupervisorAdmins();
      renderSupervisorAll();
    } catch (e) {
      toast("Fehler", e.message);
    }
  };

  host.querySelector("#aRefresh").onclick = async () => {
    await loadSupervisorAdmins();
    renderSupervisorAll();
  };

  const list = host.querySelector("#aList");
  if (!state.admins.length) {
    list.innerHTML = `<div class="small">Keine Admins.</div>`;
    return;
  }

  list.innerHTML = state.admins.map((a) => `
    <div class="row">
      <div>
        <div style="font-weight:900;">${escapeHtml(a.username)}</div>
        <div class="small">Filiale: <b>${escapeHtml(a.branch)}</b></div>
      </div>
      <div class="actions">
        <span class="pill-green">Admin</span>
      </div>
    </div>
  `).join("");
}

function renderSupervisorUsers() {
  // gleiche UI wie Admin, aber global
  const host = el("supTabUsers");
  host.innerHTML = `
    <div class="card">
      <div class="card-title">Benutzer</div>
      <div class="small">Supervisor sieht alle Benutzer (alle Filialen) und kann entsperren.</div>
      <hr class="soft"/>
      <div class="actions">
        <button class="btn-sm" id="uRefresh">Aktualisieren</button>
      </div>
      <hr class="soft"/>
      <div id="uList"></div>
    </div>
  `;
  host.querySelector("#uRefresh").onclick = async () => {
    await loadSupervisorUsers();
    renderSupervisorAll();
  };

  const list = host.querySelector("#uList");
  if (!state.users.length) {
    list.innerHTML = `<div class="small">Keine Benutzer.</div>`;
    return;
  }

  list.innerHTML = state.users.map((u) => `
    <div class="row">
      <div style="min-width:0;">
        <div style="font-weight:900;">${escapeHtml(u.username)}</div>
        <div class="small">Filiale: ${escapeHtml(u.branch)} · Credit: <b>${u.creditDzd} DZD</b> · Fehlversuche: ${u.wrongRedeemAttempts}</div>
      </div>
      <div class="actions">
        <span class="${u.blocked ? "pill-red" : "pill-green"}">${u.blocked ? "gesperrt" : "aktiv"}</span>
        ${u.blocked ? `<button class="btn-sm primary" data-unblock="${u.id}">Entsperren</button>` : ``}
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-unblock]").forEach((b) => {
    b.onclick = async () => {
      const id = Number(b.dataset.unblock);
      try {
        await apiPost("/api/users/unblock", { userId: id });
        toast("Entsperrt ✅", "Benutzer wieder aktiv");
        await loadSupervisorUsers();
        renderSupervisorAll();
      } catch (e) {
        toast("Fehler", e.message);
      }
    };
  });
}

function renderSupervisorSecurity() {
  const host = el("supTabSecurity");
  host.innerHTML = `
    <div class="card">
      <div class="card-title">Security</div>
      <div class="small">Block-Historie: Wer wurde wann wegen 3× falschem Code gesperrt?</div>
      <hr class="soft"/>
      <div class="actions">
        <button class="btn-sm" id="sRefresh">Aktualisieren</button>
      </div>
      <hr class="soft"/>
      <div id="sList"></div>
    </div>
  `;
  host.querySelector("#sRefresh").onclick = async () => {
    await loadSupervisorSecurity();
    renderSupervisorAll();
  };

  const list = host.querySelector("#sList");
  if (!state.blockEvents.length) {
    list.innerHTML = `<div class="small">Keine Block-Events.</div>`;
    return;
  }

  list.innerHTML = state.blockEvents.map((e) => `
    <div class="row">
      <div>
        <div style="font-weight:900;">${escapeHtml(e.username)} · ${escapeHtml(e.branch)}</div>
        <div class="small">${new Date(e.at).toLocaleString()} · ${escapeHtml(e.reason)}</div>
      </div>
      <div class="actions">
        <span class="pill-red">BLOCK</span>
      </div>
    </div>
  `).join("");
}

function renderSupervisorProducts() {
  const host = el("supTabProducts");
  host.innerHTML = `
    <div class="card">
      <div class="card-title">Produkte</div>
      <div class="small">Supervisor kann alle Filialen sehen. Filter kommt als nächster Schritt (wenn du willst).</div>
      <hr class="soft"/>
      <div class="actions">
        <button class="btn-sm" id="pRefresh">Aktualisieren</button>
      </div>
      <hr class="soft"/>
      <div id="pList"></div>
    </div>
  `;

  host.querySelector("#pRefresh").onclick = async () => {
    await loadSupervisorProducts();
    renderSupervisorAll();
  };

  const list = host.querySelector("#pList");
  if (!state.adminProducts.length) {
    list.innerHTML = `<div class="small">Noch keine Produkte.</div>`;
    return;
  }

  list.innerHTML = state.adminProducts.slice(0, 50).map((p) => `
    <div class="row">
      <div style="display:flex;gap:12px;align-items:center;min-width:0;">
        ${p.thumbPath ? `<img class="thumb" src="${p.thumbPath}" loading="lazy" />` : `<div class="thumb"></div>`}
        <div style="min-width:0;">
          <div style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.title)}</div>
          <div class="small">Filiale: <b>${escapeHtml(p.branch)}</b> · ${p.pages} Seiten · <b>${p.price} DZD</b></div>
        </div>
      </div>
    </div>
  `).join("");
}

// ---------------- Upload UI ----------------
function renderUpload(mode) {
  const host = mode === "admin" ? el("adminTabUpload") : el("supTabUpload");
  const isAdmin = mode === "admin";

  const branch = isAdmin ? state.user.branch : (state.upload.branch || (state.catalogs?.branches?.[0] || "Filiale 1"));
  state.upload.branch = branch;

  // cascading options
  const c = state.catalogs;
  const faculties = (c.faculties || []).filter((f) => f.branch === branch);
  const facultyId = Number(state.upload.facultyId || faculties[0]?.id || 0) || 0;
  const tracks = (c.tracks || []).filter((t) => Number(t.facultyId) === facultyId);
  const trackId = Number(state.upload.trackId || tracks[0]?.id || 0) || 0;
  const years = (c.years || []).filter((y) => Number(y.trackId) === trackId);
  const yearId = Number(state.upload.yearId || years[0]?.id || 0) || 0;
  const modules = (c.modules || []).filter((m) => Number(m.yearId) === yearId);
  const moduleId = Number(state.upload.moduleId || modules[0]?.id || 0) || 0;
  const groups = (c.groups || []).filter((g) => Number(g.moduleId) === moduleId);
  const groupId = Number(state.upload.groupId || groups[0]?.id || 0) || 0;

  const professors = (c.professors || []).filter((p) => Number(p.facultyId) === facultyId);
  const professorId = Number(state.upload.professorId || professors[0]?.id || 0) || 0;

  // store current
  state.upload.facultyId = facultyId || null;
  state.upload.trackId = trackId || null;
  state.upload.yearId = yearId || null;
  state.upload.moduleId = moduleId || null;
  state.upload.groupId = groupId || null;
  state.upload.professorId = professorId || null;

  host.innerHTML = `
    <div class="card">
      <div class="card-title">Upload</div>
      <div class="small">Mehrere PDFs für den gleichen Professor gleichzeitig möglich.</div>
      <hr class="soft"/>

      <div class="grid2">
        <div class="field">
          <label>Filiale</label>
          ${
            isAdmin
              ? `<input class="input" value="${escapeHtml(branch)}" disabled/>`
              : `<select class="input" id="upBranch"></select>`
          }
        </div>
        <div class="field">
          <label>Fakultät</label>
          <select class="input" id="upFaculty"></select>
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <label>Fachbereich</label>
          <select class="input" id="upTrack"></select>
        </div>
        <div class="field">
          <label>Studienjahr</label>
          <select class="input" id="upYear"></select>
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <label>Modul</label>
          <select class="input" id="upModule"></select>
        </div>
        <div class="field">
          <label>Gruppe</label>
          <select class="input" id="upGroup"></select>
        </div>
      </div>

      <div class="field">
        <label>Professor</label>
        <select class="input" id="upProfessor"></select>
      </div>

      <hr class="soft"/>

      <div class="grid2">
        <div class="field">
          <label>Pricing Mode</label>
          <select class="input" id="upMode">
            <option value="auto">Auto (Seitenpreis)</option>
            <option value="auto_plus_extra">Auto + Extra</option>
            <option value="fixed">Fixpreis</option>
          </select>
        </div>
        <div class="field">
          <label>Extra (nur bei Auto+Extra)</label>
          <select class="input" id="upExtra">
            <option value="extra1">Extra 1</option>
            <option value="extra2">Extra 2</option>
            <option value="extra3">Extra 3</option>
            <option value="extra4">Extra 4</option>
          </select>
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <label>Fixpreis (nur bei Fixpreis)</label>
          <input class="input" id="upFixed" inputmode="numeric" value="${state.upload.fixedPrice || 0}" />
        </div>
        <div class="field">
          <label>Rabatt</label>
          <div class="grid2" style="grid-template-columns: 1fr 1fr;">
            <select class="input" id="upDiscType">
              <option value="none">Kein</option>
              <option value="percent">% Rabatt</option>
              <option value="fixed">Fix Rabatt</option>
            </select>
            <input class="input" id="upDiscVal" inputmode="numeric" value="${state.upload.discountValue || 0}" />
          </div>
        </div>
      </div>

      <div class="field">
        <label>Hinweis (optional)</label>
        <input class="input" id="upNote" value="${escapeHtml(state.upload.note || "")}" />
      </div>

      <hr class="soft"/>

      <div class="field">
        <label>PDF-Datei(en)</label>
        <input class="input" id="upFiles" type="file" accept="application/pdf" multiple />
      </div>

      <button class="button full" id="upBtn">Hochladen</button>
      <div class="small" style="margin-top:10px;">
        Nach Upload bekommst du eine Liste (Name + Preis). Danach kannst du entscheiden: Felder behalten oder leeren.
      </div>
      <div id="upResult" style="margin-top:12px;"></div>
    </div>
  `;

  if (!isAdmin) {
    const selB = host.querySelector("#upBranch");
    selB.innerHTML = (state.catalogs.branches || []).map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
    selB.value = branch;
    selB.onchange = () => {
      state.upload.branch = selB.value;
      // reset chain
      state.upload.facultyId = null; state.upload.trackId = null; state.upload.yearId = null; state.upload.moduleId = null; state.upload.groupId = null; state.upload.professorId = null;
      renderSupervisorAll();
    };
  }

  const selF = host.querySelector("#upFaculty");
  selF.innerHTML = faculties.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("");
  selF.value = String(facultyId || "");
  selF.onchange = () => {
    state.upload.facultyId = Number(selF.value || 0) || null;
    state.upload.trackId = null; state.upload.yearId = null; state.upload.moduleId = null; state.upload.groupId = null;
    state.upload.professorId = null;
    if (isAdmin) renderAdminAll(); else renderSupervisorAll();
  };

  const selT = host.querySelector("#upTrack");
  selT.innerHTML = tracks.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  selT.value = String(trackId || "");
  selT.onchange = () => {
    state.upload.trackId = Number(selT.value || 0) || null;
    state.upload.yearId = null; state.upload.moduleId = null; state.upload.groupId = null;
    if (isAdmin) renderAdminAll(); else renderSupervisorAll();
  };

  const selY = host.querySelector("#upYear");
  selY.innerHTML = years.map((y) => `<option value="${y.id}">${escapeHtml(y.name)}</option>`).join("");
  selY.value = String(yearId || "");
  selY.onchange = () => {
    state.upload.yearId = Number(selY.value || 0) || null;
    state.upload.moduleId = null; state.upload.groupId = null;
    if (isAdmin) renderAdminAll(); else renderSupervisorAll();
  };

  const selM = host.querySelector("#upModule");
  selM.innerHTML = modules.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
  selM.value = String(moduleId || "");
  selM.onchange = () => {
    state.upload.moduleId = Number(selM.value || 0) || null;
    state.upload.groupId = null;
    if (isAdmin) renderAdminAll(); else renderSupervisorAll();
  };

  const selG = host.querySelector("#upGroup");
  selG.innerHTML = groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("");
  selG.value = String(groupId || "");
  selG.onchange = () => {
    state.upload.groupId = Number(selG.value || 0) || null;
  };

  const selP = host.querySelector("#upProfessor");
  selP.innerHTML = professors.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  selP.value = String(professorId || "");
  selP.onchange = () => {
    state.upload.professorId = Number(selP.value || 0) || null;
  };

  const selMode = host.querySelector("#upMode");
  selMode.value = state.upload.mode || "auto";
  selMode.onchange = () => {
    state.upload.mode = selMode.value;
  };

  const selExtra = host.querySelector("#upExtra");
  selExtra.value = state.upload.extraKey || "extra1";
  selExtra.onchange = () => { state.upload.extraKey = selExtra.value; };

  const inpFixed = host.querySelector("#upFixed");
  inpFixed.onfocus = () => inpFixed.select();
  inpFixed.oninput = () => { state.upload.fixedPrice = Number(inpFixed.value || 0) || 0; };

  const selDT = host.querySelector("#upDiscType");
  selDT.value = state.upload.discountType || "none";
  selDT.onchange = () => { state.upload.discountType = selDT.value; };

  const inpDV = host.querySelector("#upDiscVal");
  inpDV.onfocus = () => inpDV.select();
  inpDV.oninput = () => { state.upload.discountValue = Number(inpDV.value || 0) || 0; };

  const inpNote = host.querySelector("#upNote");
  inpNote.oninput = () => { state.upload.note = inpNote.value; };

  host.querySelector("#upBtn").onclick = async () => {
    const files = host.querySelector("#upFiles").files;
    if (!files || !files.length) {
      toast("Fehler", "Bitte PDF auswählen");
      return;
    }

    try {
      // Multi oder Single
      if (files.length === 1) {
        const { pdfFile, thumbBlob } = await preparePdfAndThumb(files[0]);
        const fd = new FormData();
        fd.append("pdf", pdfFile);
        if (thumbBlob) fd.append("thumb", thumbBlob, "thumb.jpg");

        appendUploadMeta(fd, isAdmin);

        const data = await apiPostForm("/api/products/upload", fd);

        showUploadResult(host, [data.product], () => clearOrKeep(host, isAdmin), () => keepFields());
        toast("Upload ✅", "Produkt erstellt");
      } else {
        const fd = new FormData();
        const thumbs = [];
        for (const f of files) {
          const prep = await preparePdfAndThumb(f);
          fd.append("pdfs", prep.pdfFile);
          thumbs.push(prep.thumbBlob);
        }
        thumbs.forEach((tb, i) => {
          if (tb) fd.append("thumbs", tb, `thumb_${i}.jpg`);
        });

        appendUploadMeta(fd, isAdmin);

        const data = await apiPostForm("/api/products/upload-multiple", fd);

        showUploadResult(host, data.products || [], () => clearOrKeep(host, isAdmin), () => keepFields());
        toast("Batch Upload ✅", `${data.createdCount} Produkte`);
      }

      // nach Upload Produkte neu laden (damit sichtbar)
      if (state.user.role === "admin") {
        await loadAdminProducts();
        renderAdminAll();
      } else {
        await loadSupervisorProducts();
        renderSupervisorAll();
      }
    } catch (e) {
      toast("Fehler", e.message);
    }
  };
}

function appendUploadMeta(fd, isAdmin) {
  if (!isAdmin) fd.append("branch", state.upload.branch);

  fd.append("facultyId", state.upload.facultyId || "");
  fd.append("trackId", state.upload.trackId || "");
  fd.append("yearId", state.upload.yearId || "");
  fd.append("moduleId", state.upload.moduleId || "");
  fd.append("groupId", state.upload.groupId || "");
  fd.append("professorId", state.upload.professorId || "");

  fd.append("mode", state.upload.mode || "auto");
  fd.append("fixedPrice", state.upload.fixedPrice || 0);
  fd.append("extraKey", state.upload.extraKey || "");
  fd.append("discountType", state.upload.discountType || "none");
  fd.append("discountValue", state.upload.discountValue || 0);
  fd.append("note", state.upload.note || "");
}

function showUploadResult(host, products, onClear, onKeep) {
  const box = host.querySelector("#upResult");
  const rows = products.map((p) => {
    const discounted = p.originalPrice !== p.price;
    const price = discounted
      ? `<span class="strike">${p.originalPrice} DZD</span> <b>${p.price} DZD</b>`
      : `<b>${p.price} DZD</b>`;
    return `
      <div class="row">
        <div style="min-width:0;">
          <div style="font-weight:900;">${escapeHtml(p.title)}</div>
          <div class="small">${p.pages} Seiten · ${price}</div>
        </div>
      </div>
    `;
  }).join("");

  box.innerHTML = `
    <div class="card" style="margin-top:12px;">
      <div class="card-title">Upload fertig ✅</div>
      <div class="small">Erstellte Produkte:</div>
      <hr class="soft"/>
      ${rows}
      <hr class="soft"/>
      <div class="small">Felder nach Upload:</div>
      <div class="actions" style="margin-top:10px;">
        <button class="btn-sm" id="keepBtn">📌 Behalten</button>
        <button class="btn-sm primary" id="clearBtn">🧹 Leeren</button>
      </div>
    </div>
  `;

  box.querySelector("#clearBtn").onclick = onClear;
  box.querySelector("#keepBtn").onclick = onKeep;
}

function clearOrKeep(host, isAdmin) {
  // Leeren: nur Eingabefelder, Struktur bleibt (damit man schnell weitere PDFs hochladen kann)
  state.upload.note = "";
  // Pricing Felder behalten typischerweise, aber du kannst das auch auf 0 setzen – ich lasse es stabil.
  // state.upload.fixedPrice = 0; state.upload.discountType="none"; state.upload.discountValue=0;
  if (isAdmin) renderAdminAll(); else renderSupervisorAll();
  toast("Felder", "Teilweise geleert (Hinweis) ✅");
}
function keepFields() {
  toast("Felder", "Behalten ✅");
}

async function preparePdfAndThumb(file) {
  const pdfFile = file;

  // Thumbnail aus erster Seite (PDF.js)
  try {
    if (!window.pdfjsLib) return { pdfFile, thumbBlob: null };

    const ab = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    const page = await pdf.getPage(1);

    // Ziel: mittel + kleiner — wir nehmen kleine Fläche
    const viewport = page.getViewport({ scale: 0.9 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.62);
    });

    return { pdfFile, thumbBlob: blob };
  } catch {
    return { pdfFile, thumbBlob: null };
  }
}

function renderPricing(role) {
  const host = role === "admin" ? el("adminTabPricing") : el("supTabPricing");
  const s = state.settings;

  host.innerHTML = `
    <div class="card">
      <div class="card-title">Pricing</div>
      <div class="small">Seitenpreis + 4 Extrapreise. Produkte rechnen automatisch (Auto/Auto+Extra/Fix).</div>
      <hr class="soft"/>

      <div class="grid2">
        <div class="field">
          <label>Preis pro Seite (DZD)</label>
          <input class="input" id="ppp" inputmode="numeric" value="${s.pricePerPage}" />
        </div>
        <div class="field">
          <label>„Neu“-Badge (Tage)</label>
          <input class="input" id="newDays" inputmode="numeric" value="${s.newBadgeDays}" />
        </div>
      </div>

      <div class="grid2">
        <div class="field"><label>Extra 1</label><input class="input" id="e1" inputmode="numeric" value="${s.extras.extra1}" /></div>
        <div class="field"><label>Extra 2</label><input class="input" id="e2" inputmode="numeric" value="${s.extras.extra2}" /></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Extra 3</label><input class="input" id="e3" inputmode="numeric" value="${s.extras.extra3}" /></div>
        <div class="field"><label>Extra 4</label><input class="input" id="e4" inputmode="numeric" value="${s.extras.extra4}" /></div>
      </div>

      <div class="field">
        <label>Letzte Produkte (Default Anzahl)</label>
        <input class="input" id="recent" inputmode="numeric" value="${s.recentProductsDefaultLimit}" />
      </div>

      <button class="button full" id="savePricing">Speichern</button>
    </div>
  `;

  const inputs = ["ppp","newDays","e1","e2","e3","e4","recent"].map((id) => host.querySelector("#"+id));
  inputs.forEach((i) => { i.onfocus = () => i.select(); });

  host.querySelector("#savePricing").onclick = async () => {
    try {
      const payload = {
        pricePerPage: Number(host.querySelector("#ppp").value || 0),
        newBadgeDays: Number(host.querySelector("#newDays").value || 0),
        recentProductsDefaultLimit: Number(host.querySelector("#recent").value || 20),
        extras: {
          extra1: Number(host.querySelector("#e1").value || 0),
          extra2: Number(host.querySelector("#e2").value || 0),
          extra3: Number(host.querySelector("#e3").value || 0),
          extra4: Number(host.querySelector("#e4").value || 0)
        }
      };
      const data = await apiPost("/api/settings", payload);
      state.settings = data.settings;
      toast("Gespeichert ✅", "Pricing aktualisiert");
    } catch (e) {
      toast("Fehler", e.message);
    }
  };
}

function renderStructure() {
  const host = el("supTabStructure");
  const c = state.catalogs;

  host.innerHTML = `
    <div class="card">
      <div class="card-title">Struktur</div>
      <div class="small">Beispieldaten sind schon da. Du kannst später erweitern (CRUD-Ausbau als nächster Schritt).</div>
      <hr class="soft"/>

      <div class="row">
        <div>
          <div style="font-weight:900;">Filialen</div>
          <div class="small">${(c.branches || []).map(escapeHtml).join(" · ")}</div>
        </div>
      </div>

      <hr class="soft"/>
      <div class="row">
        <div>
          <div style="font-weight:900;">Fakultäten</div>
          <div class="small">${(c.faculties || []).map(f => `${escapeHtml(f.branch)}: ${escapeHtml(f.name)}`).join("<br/>")}</div>
        </div>
      </div>

      <hr class="soft"/>
      <div class="row">
        <div>
          <div style="font-weight:900;">Professoren</div>
          <div class="small">${(c.professors || []).map(p => `${escapeHtml(p.name)} (FacultyId ${p.facultyId})`).join("<br/>")}</div>
        </div>
      </div>

      <div class="small" style="margin-top:12px;">
        Wenn du willst, baue ich dir als nächstes eine moderne CRUD-Oberfläche mit Tabs (Filiale/Fakultät/Fachbereich/Jahr/Modul/Gruppe/Professor)
        inklusive Löschen/Umbenennen, mit Bestätigung + Safety.
      </div>
    </div>
  `;
}

// ---------------- UTILS ----------------
function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  });
}

// ---------------- BOOT ----------------
async function boot() {
  initTheme();
  setTopButtonsVisibility();
  fillRegisterBranches();

  el("themeBtn").onclick = toggleTheme;
  el("logoutBtn").onclick = logout;
  el("loginBtn").onclick = () => login().catch((e) => toast("Login fehlgeschlagen", e.message));
  el("registerBtn").onclick = () => register().catch((e) => toast("Register fehlgeschlagen", e.message));

  // Try restore token
  const token = localStorage.getItem("token");
  if (token) {
    try {
      state.token = token;
      // quick auth check: get settings + catalogs to ensure token valid
      state.settings = await apiGet("/api/settings");
      // if ok, we need user data -> simplest: require login re-enter in this prototype
      // (du kannst hier später /api/me machen)
      toast("Info", "Token gespeichert, bitte neu einloggen (Demo).");
      state.token = null;
      localStorage.removeItem("token");
    } catch {
      state.token = null;
      localStorage.removeItem("token");
    }
  }

  // load catalogs for register UI
  try {
    // no auth required here in this build, so we fake with login-required -> leave default
  } catch {}
}
boot();
