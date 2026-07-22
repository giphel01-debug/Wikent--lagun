let SETTINGS = {};
let APARTMENTS = [];
let AMENITIES = [];
let LEADS = [];
let RESERVATIONS = [];
let currentTab = "calendar";
let editingAptId = null;

function showConfirmModal({ title, message, confirmLabel }, onConfirm) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(20,18,14,0.75);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;";
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px;max-width:400px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,0.3);">
      <div style="font-weight:600;font-size:17px;margin-bottom:10px;color:var(--dark, #2B2620);">${title}</div>
      <div style="font-size:13.5px;color:var(--text-secondary);margin-bottom:22px;line-height:1.5;">${message}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" id="modal-cancel">Cancel</button>
        <button class="btn btn-solid" id="modal-confirm" style="background:var(--terracotta);">${confirmLabel || "Yes, continue"}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#modal-cancel").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector("#modal-confirm").addEventListener("click", () => { overlay.remove(); onConfirm(); });
}

function navigate(tab, editId) {
  currentTab = tab;
  editingAptId = editId;
  history.pushState({ ownerTab: currentTab, editingAptId }, "", location.href);
  renderTabs();
  renderTab();
}

window.addEventListener("popstate", (e) => {
  if (e.state && e.state.ownerTab !== undefined) {
    currentTab = e.state.ownerTab;
    editingAptId = e.state.editingAptId;
    renderTabs();
    renderTab();
  }
});

async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { showPanel(); } else { showLogin(); }

  document.getElementById("login-submit").addEventListener("click", async () => {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      document.getElementById("login-msg").textContent = error.message;
    } else {
      showPanel();
    }
  });
}

function showLogin() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("panel").classList.add("hidden");
  document.getElementById("header-actions").innerHTML = "";
}

const VALID_TABS = ["calendar", "apartments", "amenities", "leads", "reminders", "insights", "backup", "settings"];
let highlightLeadId = null;

function applyDeepLinkParams() {
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab");
  const lead = params.get("lead");
  if (tab && VALID_TABS.includes(tab)) {
    currentTab = tab;
  }
  if (lead) {
    highlightLeadId = lead;
  }
}

async function showPanel() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("panel").classList.remove("hidden");
  document.getElementById("header-actions").innerHTML = `<button class="btn" id="logout-btn">Log out</button>`;
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await sb.auth.signOut();
    location.reload();
  });
  await loadAll();
  applyDeepLinkParams();
  renderTabs();
  renderTab();
  history.replaceState({ ownerTab: currentTab, editingAptId }, "", location.pathname);
}

let PAGE_VIEWS = [];

async function loadAll() {
  const { data: settingsRows } = await sb.from("site_settings").select("*").limit(1);
  SETTINGS = (settingsRows && settingsRows[0]) || {};

  const { data: apts } = await sb.from("apartments").select(`
    *, apartment_translations(*), apartment_bedrooms(*), apartment_amenities(amenity_id),
    apartment_photos(*), apartment_videos(*)
  `);
  APARTMENTS = apts || [];

  const { data: amenities } = await sb.from("amenities").select("*");
  AMENITIES = amenities || [];

  const { data: leads } = await sb.from("leads").select("*").order("created_at", { ascending: false });
  LEADS = leads || [];

  const { data: reservations } = await sb.from("reservations").select("*");
  RESERVATIONS = reservations || [];

  const { data: views } = await sb.from("page_views").select("*");
  PAGE_VIEWS = views || [];
}

function renderTabs() {
  const tabs = [
    ["calendar", "Calendar"],
    ["apartments", "Apartments"],
    ["amenities", "Amenities"],
    ["leads", `Leads (${LEADS.filter(l => l.status === "open").length} open)`],
    ["reminders", "Reminders"],
    ["insights", "Insights"],
    ["backup", "Backup"],
    ["settings", "Settings"]
  ];
  document.getElementById("tabs").innerHTML = tabs.map(([key, label]) =>
    `<span class="tab ${currentTab === key ? "active" : ""}" data-tab="${key}">${label}</span>`
  ).join("");
  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => { navigate(t.dataset.tab, null); });
  });
}

function renderTab() {
  const c = document.getElementById("tab-content");
  if (currentTab === "calendar") return renderCalendarTab(c);
  if (currentTab === "apartments") return editingAptId !== null ? renderApartmentEditor(c) : renderApartmentsTab(c);
  if (currentTab === "amenities") return renderAmenitiesTab(c);
  if (currentTab === "leads") return renderLeadsTab(c);
  if (currentTab === "reminders") return renderRemindersTab(c);
  if (currentTab === "insights") return renderInsightsTab(c);
  if (currentTab === "backup") return renderBackupTab(c);
  if (currentTab === "settings") return renderSettingsTab(c);
}

// ---------- Calendar overview ----------
function renderCalendarTab(c) {
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const label = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function isReserved(aptId, day) {
    const ds = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return RESERVATIONS.some(r => r.apartment_id === aptId && r.status === "confirmed" && ds >= r.check_in && ds < r.check_out);
  }

  let rows = "";
  APARTMENTS.forEach(apt => {
    const tr = getTranslationOwner(apt, "en");
    let cells = "";
    for (let d = 1; d <= daysInMonth; d++) {
      cells += `<td style="padding:2px;"><div style="width:18px;height:18px;border-radius:4px;background:${isReserved(apt.id, d) ? "#A63D2F" : "#5B8C5A"};"></div></td>`;
    }
    rows += `<tr><td style="font-size:12px;white-space:nowrap;padding-right:8px;">${tr.name.slice(0, 20)}</td>${cells}</tr>`;
  });

  let header = "";
  for (let d = 1; d <= daysInMonth; d++) header += `<th style="font-size:10px;font-weight:400;color:var(--text-muted);">${d}</th>`;

  c.innerHTML = `
    <div class="surface-box">
      <div style="font-weight:600;margin-bottom:10px;">${label}</div>
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;"><thead><tr><th></th>${header}</tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>`;
}

// ---------- Media (photos and videos) ----------
async function uploadMedia(apartmentId, file, kind, existingItems) {
  const ext = file.name.split(".").pop();
  const path = `${apartmentId}/${uid()}.${ext}`;
  const { error: upErr } = await sb.storage.from("apartment-media").upload(path, file);
  if (upErr) { alert(upErr.message); return; }
  const { data } = sb.storage.from("apartment-media").getPublicUrl(path);
  const table = kind === "video" ? "apartment_videos" : "apartment_photos";
  const maxOrder = (existingItems || []).length ? Math.max(...existingItems.map(i => i.sort_order || 0)) : -1;
  await sb.from(table).insert({ apartment_id: apartmentId, url: data.publicUrl, sort_order: maxOrder + 1 });
}

async function replaceMedia(row, file, kind) {
  const table = kind === "video" ? "apartment_videos" : "apartment_photos";
  const ext = file.name.split(".").pop();
  const path = `${row.apartment_id}/${uid()}.${ext}`;
  const { error: upErr } = await sb.storage.from("apartment-media").upload(path, file);
  if (upErr) { alert(upErr.message); return; }
  const { data } = sb.storage.from("apartment-media").getPublicUrl(path);
  const marker = "/apartment-media/";
  const idx = row.url.indexOf(marker);
  if (idx !== -1) {
    const oldPath = row.url.slice(idx + marker.length);
    await sb.storage.from("apartment-media").remove([oldPath]);
  }
  await sb.from(table).update({ url: data.publicUrl }).eq("id", row.id);
}

async function swapMediaOrder(itemA, itemB, kind) {
  const table = kind === "video" ? "apartment_videos" : "apartment_photos";
  const a = itemA.sort_order || 0, b = itemB.sort_order || 0;
  await sb.from(table).update({ sort_order: b }).eq("id", itemA.id);
  await sb.from(table).update({ sort_order: a }).eq("id", itemB.id);
}

async function deleteMedia(row, kind) {
  const table = kind === "video" ? "apartment_videos" : "apartment_photos";
  const marker = "/apartment-media/";
  const idx = row.url.indexOf(marker);
  if (idx !== -1) {
    const path = row.url.slice(idx + marker.length);
    await sb.storage.from("apartment-media").remove([path]);
  }
  await sb.from(table).delete().eq("id", row.id);
}

// ---------- Apartments ----------
function getTranslationOwner(apt, lang) {
  const rows = apt.apartment_translations || [];
  const t = rows.find(r => r.language === lang) || {};
  const en = rows.find(r => r.language === "en") || {};
  return { name: t.name || en.name || "Untitled", description: t.description || en.description || "" };
}

function renderApartmentsTab(c) {
  let html = `<button class="btn btn-solid" id="add-apt" style="margin-bottom:16px;">+ Add apartment</button>`;
  APARTMENTS.forEach(apt => {
    const tr = getTranslationOwner(apt, "en");
    const aptReservations = RESERVATIONS.filter(r => r.apartment_id === apt.id);
    html += `
      <div class="surface-box mt">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:600;">${tr.name}</div>
            <div class="muted">XCG ${money(apt.weekend_price)} / weekend</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn expand-btn" data-id="${apt.id}">Reservations</button>
            <button class="btn edit-btn" data-id="${apt.id}">Edit</button>
            <button class="btn delete-btn" data-id="${apt.id}">Remove</button>
          </div>
        </div>
        <div class="hidden mt" id="expand-${apt.id}">
          ${aptReservations.map(r => `
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;opacity:${r.status === "cancelled" ? 0.5 : 1};">
              <span>${r.guest_name || "Guest"}, ${r.check_in} to ${r.check_out} ${r.status === "cancelled" ? "(cancelled)" : ""} ${r.checked_in_at ? "· checked in" : ""}</span>
              ${r.status !== "cancelled" ? `<span>
                ${!r.checked_in_at ? `<a href="#" class="confirm-checkin" data-id="${r.id}" style="color:var(--olive-dark);margin-right:10px;">Confirm check in</a>` : ""}
                <a href="#" class="cancel-res" data-id="${r.id}" style="color:var(--terracotta);">Cancel</a>
              </span>` : ""}
            </div>`).join("")}
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;" class="mt res-form" data-apt="${apt.id}">
            <div class="field" style="width:140px;"><label>Guest name</label><input class="res-name" data-apt="${apt.id}"></div>
            <div class="field" style="width:150px;"><label>Guest phone</label><input class="res-phone" data-apt="${apt.id}"></div>
            <div class="field" style="width:150px;"><label>Check in</label><input type="date" class="res-checkin" data-apt="${apt.id}"></div>
            <div class="field" style="width:150px;"><label>Check out</label><input type="date" class="res-checkout" data-apt="${apt.id}"></div>
            <button class="btn btn-solid add-res-btn" data-apt="${apt.id}">Add reservation</button>
          </div>
          <div class="muted mt res-price-preview" data-apt="${apt.id}"></div>
        </div>
      </div>`;
  });
  c.innerHTML = html;

  document.getElementById("add-apt").addEventListener("click", () => { navigate("apartments", "new"); });
  c.querySelectorAll(".edit-btn").forEach(b => b.addEventListener("click", () => { navigate("apartments", b.dataset.id); }));
  c.querySelectorAll(".delete-btn").forEach(b => b.addEventListener("click", () => {
    const apt = APARTMENTS.find(a => a.id === b.dataset.id);
    const name = apt ? getTranslationOwner(apt, "en").name : "this apartment";
    showConfirmModal({
      title: `Delete "${name}"?`,
      message: "This permanently removes the listing along with all its photos, videos, reservations, and leads. This cannot be undone. If you want to be safe, download a backup first from the Backup tab.",
      confirmLabel: "Yes, delete permanently"
    }, async () => {
      await sb.from("apartments").delete().eq("id", b.dataset.id);
      await loadAll(); renderTab();
    });
  }));
  c.querySelectorAll(".expand-btn").forEach(b => b.addEventListener("click", () => {
    document.getElementById(`expand-${b.dataset.id}`).classList.toggle("hidden");
  }));
  c.querySelectorAll(".confirm-checkin").forEach(b => b.addEventListener("click", async (e) => {
    e.preventDefault();
    await sb.from("reservations").update({ checked_in_at: new Date().toISOString() }).eq("id", b.dataset.id);
    await loadAll(); renderTab();
  }));
  c.querySelectorAll(".cancel-res").forEach(b => b.addEventListener("click", (e) => {
    e.preventDefault();
    showConfirmModal({
      title: "Cancel this reservation?",
      message: "This frees up those dates on the calendar again. This can't be undone.",
      confirmLabel: "Yes, cancel it"
    }, async () => {
      await sb.from("reservations").update({ status: "cancelled" }).eq("id", b.dataset.id);
      await loadAll(); renderTab();
    });
  }));
  function updateResPreview(aptId) {
    const apt = APARTMENTS.find(a => a.id === aptId);
    const checkIn = c.querySelector(`.res-checkin[data-apt="${aptId}"]`).value;
    const checkOut = c.querySelector(`.res-checkout[data-apt="${aptId}"]`).value;
    const preview = c.querySelector(`.res-price-preview[data-apt="${aptId}"]`);
    if (!apt || !checkIn || !checkOut || checkOut <= checkIn) { preview.textContent = ""; return; }
    const nights = nightsList(checkIn, checkOut).length;
    const total = calculatePrice(apt, checkIn, checkOut);
    preview.textContent = `${nights} night${nights === 1 ? "" : "s"} · XCG ${money(total)}`;
  }
  c.querySelectorAll(".res-checkin, .res-checkout").forEach(input => {
    input.addEventListener("change", () => updateResPreview(input.dataset.apt));
  });
  c.querySelectorAll(".add-res-btn").forEach(b => b.addEventListener("click", async () => {
    const aptId = b.dataset.apt;
    const name = c.querySelector(`.res-name[data-apt="${aptId}"]`).value;
    const phone = c.querySelector(`.res-phone[data-apt="${aptId}"]`).value;
    const checkIn = c.querySelector(`.res-checkin[data-apt="${aptId}"]`).value;
    const checkOut = c.querySelector(`.res-checkout[data-apt="${aptId}"]`).value;
    if (!checkIn || !checkOut || checkOut <= checkIn) { alert("Pick a valid check in and check out date."); return; }
    await sb.from("reservations").insert({
      apartment_id: aptId, guest_name: name, guest_phone: phone,
      check_in: checkIn, check_out: checkOut, status: "confirmed"
    });
    await loadAll(); renderTab();
  }));
}


function renderApartmentEditor(c) {
  const isNew = editingAptId === "new";
  const apt = isNew ? {
    address: "", weekend_price: 0, extra_day_price: 0, deposit: 0,
    bathrooms_indoor: 0, bathrooms_outdoor: 0, checkin_checkout_schedule: "",
    electricity_note: "", water_note: "", cancellation_policy: "", cleaner_contact: "", arrival_note: "",
    apartment_bedrooms: [], apartment_amenities: [],
    apartment_translations: LANGUAGES.map(l => ({ language: l.code, name: "", description: "", auto_translated: false }))
  } : APARTMENTS.find(a => a.id === editingAptId);

  function fieldRow() {
    return `
      <div class="two-col" style="">
        <div class="field"><label>Address</label><input id="f-address" value="${apt.address || ""}"></div>
        <div class="field"><label>Weekend package price (Friday to Sunday, XCG)</label><input id="f-weekend" type="number" value="${apt.weekend_price || 0}"></div>
        <div class="field"><label>Per night rate for any other stay (XCG)</label><input id="f-extra" type="number" value="${apt.extra_day_price || 0}"></div>
        <div class="muted" style="grid-column:1/-1;margin-top:-8px;margin-bottom:8px;">A stay that includes the full Friday and Saturday night uses the weekend package price. Any other combination of nights, single weeknights, a long weekend, a week in the middle of the month, is charged at the per night rate above.</div>
        <div class="field"><label>Deposit / bòrg (XCG)</label><input id="f-deposit" type="number" value="${apt.deposit || 0}"></div>
        <div class="field"><label>Bathrooms indoor</label><input id="f-bath-in" type="number" value="${apt.bathrooms_indoor || 0}"></div>
        <div class="field"><label>Bathrooms outdoor</label><input id="f-bath-out" type="number" value="${apt.bathrooms_outdoor || 0}"></div>
      </div>
      <div class="field"><label>Amenities</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;" id="amenity-checks">
          ${AMENITIES.map(a => {
            const checked = (apt.apartment_amenities || []).some(x => x.amenity_id === a.id);
            return `<label style="display:flex;align-items:center;gap:5px;font-size:13px;background:${checked ? "var(--olive)" : "var(--sand)"};color:${checked ? "var(--olive-dark)" : "var(--sand-dark)"};padding:5px 10px;border-radius:999px;cursor:pointer;">
              <input type="checkbox" value="${a.id}" ${checked ? "checked" : ""}> ${a.label}
            </label>`;
          }).join("")}
        </div>
      </div>
      <div class="field"><label>Bedrooms, e.g. Queen:3, King:1, Twin:2</label>
        <input id="f-bedrooms" value="${(apt.apartment_bedrooms || []).map(b => `${b.bed_type}:${b.count}`).join(", ")}">
      </div>
      <div class="field"><label>Check in / check out schedule</label><input id="f-schedule" value="${apt.checkin_checkout_schedule || ""}"></div>
      <div class="field"><label>Electricity note</label><input id="f-electricity" value="${apt.electricity_note || ""}"></div>
      <div class="field"><label>Water note</label><input id="f-water" value="${apt.water_note || ""}"></div>
      <div class="field"><label>Cancellation policy</label><textarea id="f-cancellation">${apt.cancellation_policy || ""}</textarea></div>
      <div class="field"><label>Cleaner contact</label><input id="f-cleaner" value="${apt.cleaner_contact || ""}"></div>
      <div class="field"><label>Arrival instructions</label><textarea id="f-arrival">${apt.arrival_note || ""}</textarea></div>`;
  }

  function drawTranslations() {
    const box = c.querySelector("#translation-box");
    const current = apt.apartment_translations.find(x => x.language === "en") || { name: "", description: "" };
    box.innerHTML = `
      <div class="field"><label>Name</label><input id="t-name" value="${current.name || ""}"></div>
      <div class="field"><label>Description</label><textarea id="t-desc">${current.description || ""}</textarea></div>`;
  }

  function saveCurrentLangFields() {
    const nameEl = c.querySelector("#t-name");
    const descEl = c.querySelector("#t-desc");
    if (!nameEl) return;
    let t = apt.apartment_translations.find(x => x.language === "en");
    if (!t) { t = { language: "en", name: "", description: "" }; apt.apartment_translations.push(t); }
    t.name = nameEl.value; t.description = descEl.value; t.auto_translated = false;
  }

  function mediaSection(kind) {
    const items = [...((kind === "video" ? apt.apartment_videos : apt.apartment_photos) || [])]
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const label = kind === "video" ? "Videos" : "Photos";
    if (isNew) {
      return `<div class="field"><label>${label}</label><div class="muted">Save the apartment first, then you can upload ${label.toLowerCase()}.</div></div>`;
    }
    const miniBtn = "font-size:11px;width:22px;height:22px;border-radius:6px;background:var(--sand);color:var(--sand-dark);display:flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;border:1px solid var(--border);";
    return `
      <div class="field">
        <label>${label} (${items.length}${kind === "video" ? " of 5" : " of 15"})</label>
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px;">
          ${items.map((item, i) => `
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
              ${kind === "video"
                ? `<video src="${item.url}" style="width:96px;height:70px;object-fit:cover;border-radius:6px;" muted></video>`
                : `<img src="${item.url}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;">`}
              <div style="display:flex;gap:3px;">
                <a href="#" class="move-media" data-id="${item.id}" data-kind="${kind}" data-dir="-1" style="${miniBtn}${i === 0 ? "opacity:0.35;pointer-events:none;" : ""}">&larr;</a>
                <label for="replace-${item.id}" style="${miniBtn}" title="Replace this file">&#8635;</label>
                <input type="file" id="replace-${item.id}" class="replace-media" data-id="${item.id}" data-kind="${kind}" accept="${kind === "video" ? "video/*" : "image/*"}" style="display:none">
                <a href="#" class="move-media" data-id="${item.id}" data-kind="${kind}" data-dir="1" style="${miniBtn}${i === items.length - 1 ? "opacity:0.35;pointer-events:none;" : ""}">&rarr;</a>
                <a href="#" class="del-media" data-id="${item.id}" data-kind="${kind}" style="${miniBtn}color:var(--terracotta);">&times;</a>
              </div>
            </div>`).join("")}
        </div>
        <input type="file" accept="${kind === "video" ? "video/*" : "image/*"}" class="media-upload" data-kind="${kind}">
      </div>`;
  }

  c.innerHTML = `
    <div class="surface-box">
      <div style="font-weight:600;margin-bottom:12px;">${isNew ? "New apartment" : "Edit apartment"}</div>
      <div style="background:var(--sand);border-radius:10px;padding:12px;margin-bottom:16px;" id="translation-box"></div>
      ${mediaSection("photo")}
      ${mediaSection("video")}
      ${fieldRow()}
      <div style="display:flex;gap:8px;" class="mt">
        <button class="btn btn-solid" id="save-apt">Save</button>
        <button class="btn" id="cancel-apt">Cancel</button>
      </div>
    </div>`;

  drawTranslations();

  if (!isNew) {
    c.querySelectorAll(".media-upload").forEach(input => {
      input.addEventListener("change", async () => {
        if (!input.files[0]) return;
        const kind = input.dataset.kind;
        const existing = kind === "video" ? apt.apartment_videos : apt.apartment_photos;
        await uploadMedia(apt.id, input.files[0], kind, existing);
        await loadAll();
        editingAptId = apt.id;
        renderTab();
      });
    });
    c.querySelectorAll(".replace-media").forEach(input => {
      input.addEventListener("change", async () => {
        if (!input.files[0]) return;
        const kind = input.dataset.kind;
        const list = kind === "video" ? apt.apartment_videos : apt.apartment_photos;
        const item = list.find(x => x.id === input.dataset.id);
        await replaceMedia(item, input.files[0], kind);
        await loadAll();
        editingAptId = apt.id;
        renderTab();
      });
    });
    c.querySelectorAll(".move-media").forEach(a => {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        const kind = a.dataset.kind;
        const dir = Number(a.dataset.dir);
        const items = [...((kind === "video" ? apt.apartment_videos : apt.apartment_photos) || [])]
          .sort((x, y) => (x.sort_order || 0) - (y.sort_order || 0));
        const idx = items.findIndex(x => x.id === a.dataset.id);
        const swapIdx = idx + dir;
        if (swapIdx < 0 || swapIdx >= items.length) return;
        await swapMediaOrder(items[idx], items[swapIdx], kind);
        await loadAll();
        editingAptId = apt.id;
        renderTab();
      });
    });
    c.querySelectorAll(".del-media").forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const kind = a.dataset.kind;
        showConfirmModal({
          title: `Delete this ${kind}?`,
          message: "This can't be undone.",
          confirmLabel: "Yes, delete it"
        }, async () => {
          const list = kind === "video" ? apt.apartment_videos : apt.apartment_photos;
          const item = list.find(x => x.id === a.dataset.id);
          await deleteMedia(item, kind);
          await loadAll();
          editingAptId = apt.id;
          renderTab();
        });
      });
    });
  }

  c.querySelector("#cancel-apt").addEventListener("click", () => { navigate("apartments", null); });

  c.querySelector("#save-apt").addEventListener("click", async () => {
    saveCurrentLangFields();

    const payload = {
      address: c.querySelector("#f-address").value,
      weekend_price: Number(c.querySelector("#f-weekend").value || 0),
      extra_day_price: Number(c.querySelector("#f-extra").value || 0),
      deposit: Number(c.querySelector("#f-deposit").value || 0),
      bathrooms_indoor: Number(c.querySelector("#f-bath-in").value || 0),
      bathrooms_outdoor: Number(c.querySelector("#f-bath-out").value || 0),
      checkin_checkout_schedule: c.querySelector("#f-schedule").value,
      electricity_note: c.querySelector("#f-electricity").value,
      water_note: c.querySelector("#f-water").value,
      cancellation_policy: c.querySelector("#f-cancellation").value,
      cleaner_contact: c.querySelector("#f-cleaner").value,
      arrival_note: c.querySelector("#f-arrival").value
    };

    let apartmentId = apt.id;
    if (isNew) {
      const { data, error } = await sb.from("apartments").insert(payload).select().single();
      if (error) { alert(error.message); return; }
      apartmentId = data.id;
    } else {
      const { error } = await sb.from("apartments").update(payload).eq("id", apartmentId);
      if (error) { alert(error.message); return; }
    }

    // Bedrooms: clear and reinsert
    await sb.from("apartment_bedrooms").delete().eq("apartment_id", apartmentId);
    const bedroomText = c.querySelector("#f-bedrooms").value;
    const bedroomRows = bedroomText.split(",").map(s => {
      const [type, count] = s.split(":").map(x => x && x.trim());
      return type ? { apartment_id: apartmentId, bed_type: type, count: Number(count) || 1 } : null;
    }).filter(Boolean);
    if (bedroomRows.length) await sb.from("apartment_bedrooms").insert(bedroomRows);

    // Amenities: clear and reinsert
    await sb.from("apartment_amenities").delete().eq("apartment_id", apartmentId);
    const checkedAmenities = [...c.querySelectorAll("#amenity-checks input:checked")].map(el => el.value);
    if (checkedAmenities.length) {
      await sb.from("apartment_amenities").insert(checkedAmenities.map(id => ({ apartment_id: apartmentId, amenity_id: id })));
    }

    // Translations: upsert
    const translationRows = apt.apartment_translations.map(t => ({
      apartment_id: apartmentId, language: t.language, name: t.name || "", description: t.description || "", auto_translated: !!t.auto_translated
    }));
    await sb.from("apartment_translations").upsert(translationRows, { onConflict: "apartment_id,language" });

    await loadAll();
    navigate("apartments", null);
  });
}

// ---------- Amenities ----------
function renderAmenitiesTab(c) {
  c.innerHTML = `
    <div class="surface-box" style="max-width:420px;">
      <div class="muted mt" style="margin-bottom:12px;">This is the master list every apartment picks from. Renaming or removing one here updates every listing using it.</div>
      <div id="amenity-list"></div>
      <div style="display:flex;gap:8px;" class="mt">
        <input id="new-amenity" placeholder="New amenity, e.g. Kayak rental">
        <button class="btn btn-solid" id="add-amenity">Add</button>
      </div>
    </div>`;

  function drawList() {
    document.getElementById("amenity-list").innerHTML = AMENITIES.map(a => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
        <span>${a.label}</span>
        <div style="display:flex;gap:6px;">
          <button class="btn rename-btn" data-id="${a.id}">Rename</button>
          <button class="btn remove-btn" data-id="${a.id}">Remove</button>
        </div>
      </div>`).join("");
    c.querySelectorAll(".rename-btn").forEach(b => b.addEventListener("click", async () => {
      const a = AMENITIES.find(x => x.id === b.dataset.id);
      const next = prompt("Rename amenity", a.label);
      if (next && next.trim()) {
        await sb.from("amenities").update({ label: next.trim() }).eq("id", a.id);
        await loadAll(); renderTab();
      }
    }));
    c.querySelectorAll(".remove-btn").forEach(b => b.addEventListener("click", () => {
      showConfirmModal({
        title: "Remove this amenity?",
        message: "It disappears from every apartment currently using it, not just future ones. This can't be undone.",
        confirmLabel: "Yes, remove it"
      }, async () => {
        await sb.from("amenities").delete().eq("id", b.dataset.id);
        await loadAll(); renderTab();
      });
    }));
  }
  drawList();

  document.getElementById("add-amenity").addEventListener("click", async () => {
    const input = document.getElementById("new-amenity");
    if (!input.value.trim()) return;
    await sb.from("amenities").insert({ label: input.value.trim() });
    await loadAll(); renderTab();
  });
}

// ---------- Leads ----------
function renderLeadsTab(c) {
  if (LEADS.length === 0) { c.innerHTML = `<div class="muted">No leads yet.</div>`; return; }
  c.innerHTML = LEADS.map(l => {
    const apt = APARTMENTS.find(a => a.id === l.apartment_id);
    const name = apt ? getTranslationOwner(apt, "en").name : "Unknown apartment";
    const isNotify = l.source === "notify_me";
    const isHighlighted = highlightLeadId === l.id;
    return `
      <div class="surface-box mt lead-card" data-id="${l.id}" style="${isHighlighted ? "border:2px solid var(--terracotta);" : ""}">
        <div style="display:flex;justify-content:space-between;">
          <div>
            <div style="font-weight:600;">${l.name || "Guest"} &middot; ${name}
              <span class="badge ${isNotify ? "badge-terracotta" : "badge-olive"}">${isNotify ? "Notify me" : "Request to book"}</span>
            </div>
            <div class="muted">${l.phone || ""} &middot; ${l.email || ""}</div>
            <div class="muted">${isNotify ? `Wants ${l.check_in} if it opens up` : `${l.check_in} to ${l.check_out}, ${l.guests || 0} guests`}</div>
          </div>
          <div>
            ${l.status === "open"
              ? `<button class="btn ${isNotify ? "" : "btn-solid"} convert-btn" data-id="${l.id}" data-notify="${isNotify}">${isNotify ? "Mark followed up" : "Accept & reserve"}</button>`
              : `<span class="badge badge-olive">${isNotify ? "Followed up" : "Converted"}</span>`}
          </div>
        </div>
      </div>`;
  }).join("");

  if (highlightLeadId) {
    const el = c.querySelector(`.lead-card[data-id="${highlightLeadId}"]`);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    highlightLeadId = null;
  }

  c.querySelectorAll(".convert-btn").forEach(b => b.addEventListener("click", async () => {
    const lead = LEADS.find(l => l.id === b.dataset.id);
    const isNotify = b.dataset.notify === "true";
    if (!isNotify) {
      await sb.from("reservations").insert({
        apartment_id: lead.apartment_id, guest_name: lead.name, guest_phone: lead.phone,
        check_in: lead.check_in, check_out: lead.check_out, status: "confirmed"
      });
    }
    await sb.from("leads").update({ status: "converted" }).eq("id", lead.id);
    await loadAll(); renderTab();
  }));
}

// ---------- Reminders ----------
function hoursBetween(dateStr, now) {
  return (new Date(dateStr + "T00:00:00") - now) / (1000 * 60 * 60);
}
function formatHoursAway(h) {
  if (h < 0) return "overdue";
  if (h < 48) return `in ${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"}`;
  return `in ${Math.round(h / 24)} days`;
}
function buildArrivalMessage(apt, r) {
  const tr = getTranslationOwner(apt, "en");
  return [
    `Hi ${r.guest_name || "there"}! Looking forward to having you at ${tr.name}.`,
    `Check in / check out: ${apt.checkin_checkout_schedule || ""}`,
    apt.address ? `Address: ${apt.address}` : null,
    apt.arrival_note || null,
    `Any questions, just reply here on WhatsApp.`
  ].filter(Boolean).join("\n");
}

function renderRemindersTab(c) {
  const now = new Date();
  const checkinWindow = (SETTINGS.checkin_reminder_amount || 1) * (SETTINGS.checkin_reminder_unit === "hours" ? 1 : 24);
  const checkoutWindow = (SETTINGS.checkout_reminder_amount || 1) * (SETTINGS.checkout_reminder_unit === "hours" ? 1 : 24);

  const dueCheckins = RESERVATIONS
    .filter(r => r.status !== "cancelled" && !r.checked_in_at)
    .map(r => ({ ...r, hoursUntil: hoursBetween(r.check_in, now) }))
    .filter(r => r.hoursUntil <= checkinWindow && r.hoursUntil > -48)
    .sort((a, b) => a.hoursUntil - b.hoursUntil);

  const dueCheckouts = RESERVATIONS
    .filter(r => r.status !== "cancelled")
    .map(r => ({ ...r, hoursUntil: hoursBetween(r.check_out, now) }))
    .filter(r => r.hoursUntil <= checkoutWindow && r.hoursUntil > -48)
    .sort((a, b) => a.hoursUntil - b.hoursUntil);

  function itemHtml(r, showConfirm) {
    const apt = APARTMENTS.find(a => a.id === r.apartment_id);
    if (!apt) return "";
    return `
      <div class="surface-box mt">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-weight:600;">${r.guest_name || "Guest"} &middot; ${getTranslationOwner(apt, "en").name}</div>
            <div class="muted">${r.check_in} to ${r.check_out}</div>
            ${apt.cleaner_contact ? `<div class="muted">Cleaner: ${apt.cleaner_contact}</div>` : ""}
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge badge-terracotta">${formatHoursAway(r.hoursUntil)}</span>
            ${showConfirm && !r.checked_in_at ? `<button class="btn confirm-r" data-id="${r.id}">Confirm check in</button>` : ""}
            <button class="btn msg-btn" data-id="${r.id}">Arrival message</button>
          </div>
        </div>
        <div class="hidden mt" id="msg-${r.id}">
          <textarea style="height:100px;">${buildArrivalMessage(apt, r)}</textarea>
          ${r.guest_phone ? `<a class="btn btn-solid mt" target="_blank" href="https://wa.me/${r.guest_phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(buildArrivalMessage(apt, r))}">Send via WhatsApp</a>` : `<div class="muted mt">No phone on file, copy the text above instead.</div>`}
        </div>
      </div>`;
  }

  c.innerHTML = `
    <div class="muted mt">Based on the reminder windows in Settings, currently ${SETTINGS.checkin_reminder_amount || 1} ${SETTINGS.checkin_reminder_unit || "days"} before check in and ${SETTINGS.checkout_reminder_amount || 1} ${SETTINGS.checkout_reminder_unit || "days"} before check out.</div>
    <div style="font-weight:600;" class="mt">Check ins due soon</div>
    ${dueCheckins.length ? dueCheckins.map(r => itemHtml(r, true)).join("") : `<div class="muted mt">Nothing coming up.</div>`}
    <div style="font-weight:600;" class="mt">Check outs due soon</div>
    ${dueCheckouts.length ? dueCheckouts.map(r => itemHtml(r, false)).join("") : `<div class="muted mt">Nothing coming up.</div>`}`;

  c.querySelectorAll(".confirm-r").forEach(b => b.addEventListener("click", async () => {
    await sb.from("reservations").update({ checked_in_at: new Date().toISOString() }).eq("id", b.dataset.id);
    await loadAll(); renderTab();
  }));
  c.querySelectorAll(".msg-btn").forEach(b => b.addEventListener("click", () => {
    document.getElementById(`msg-${b.dataset.id}`).classList.toggle("hidden");
  }));
}

// ---------- Insights ----------
function renderInsightsTab(c) {
  const perApt = APARTMENTS.map(apt => ({
    apt, tr: getTranslationOwner(apt, "en"),
    views: PAGE_VIEWS.filter(v => v.apartment_id === apt.id).length,
    leadCount: LEADS.filter(l => l.apartment_id === apt.id).length
  }));
  const dayCounts = {};
  LEADS.forEach(l => {
    const d = new Date(l.created_at).toLocaleDateString("en-US", { weekday: "long" });
    dayCounts[d] = (dayCounts[d] || 0) + 1;
  });
  const busiest = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
  const maxViews = Math.max(1, ...perApt.map(p => p.views));

  c.innerHTML = `
    <div class="two-col mt">
      <div class="surface-box">
        <div class="muted">Total views</div>
        <div style="font-size:22px;font-weight:600;">${PAGE_VIEWS.length}</div>
      </div>
      <div class="surface-box">
        <div class="muted">Total leads</div>
        <div style="font-size:22px;font-weight:600;">${LEADS.length}</div>
      </div>
    </div>
    <div style="font-weight:600;" class="mt">Views and leads by apartment</div>
    ${perApt.map(p => `
      <div class="mt" style="margin-top:12px;">
        <div style="font-size:13px;margin-bottom:4px;">${p.tr.name} &middot; ${p.views} views, ${p.leadCount} leads</div>
        <div style="height:8px;border-radius:4px;background:var(--sand);overflow:hidden;">
          <div style="height:100%;width:${(p.views / maxViews) * 100}%;background:var(--terracotta);"></div>
        </div>
      </div>`).join("")}
    <div style="font-weight:600;" class="mt">Busiest day for inquiries</div>
    <div class="muted">${busiest ? `${busiest[0]}, with ${busiest[1]} lead${busiest[1] === 1 ? "" : "s"} so far` : "Not enough data yet"}</div>`;
}

// ---------- Settings ----------
async function uploadSiteImage(file, kind) {
  const ext = file.name.split(".").pop();
  const path = `site/${kind}-${uid()}.${ext}`;
  const { error } = await sb.storage.from("apartment-media").upload(path, file);
  if (error) { alert(error.message); return null; }
  const { data } = sb.storage.from("apartment-media").getPublicUrl(path);
  return data.publicUrl;
}

function normalizeHeroImagesOwner(raw) {
  return (raw || []).map(item => typeof item === "string" ? { url: item, caption: "" } : item);
}

// ---------- Backup ----------
async function exportBackup() {
  const [apts, amens, settingsRes, res, leads] = await Promise.all([
    sb.from("apartments").select(`*, apartment_translations(*), apartment_bedrooms(*), apartment_amenities(*), apartment_photos(*), apartment_videos(*)`),
    sb.from("amenities").select("*"),
    sb.from("site_settings").select("*"),
    sb.from("reservations").select("*"),
    sb.from("leads").select("*")
  ]);
  const backup = {
    exported_at: new Date().toISOString(),
    apartments: apts.data || [],
    amenities: amens.data || [],
    site_settings: settingsRes.data || [],
    reservations: res.data || [],
    leads: leads.data || []
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wikent-lagun-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function restoreBackup(file, statusEl) {
  statusEl.textContent = "Reading file...";
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch (e) {
    statusEl.textContent = "That file doesn't look like a valid backup.";
    return;
  }

  try {
    statusEl.textContent = "Restoring amenities...";
    for (const a of backup.amenities || []) {
      await sb.from("amenities").upsert({ id: a.id, label: a.label, icon: a.icon });
    }

    statusEl.textContent = "Restoring site settings...";
    if (backup.site_settings && backup.site_settings[0]) {
      const s = { ...backup.site_settings[0] };
      const id = s.id;
      delete s.id;
      await sb.from("site_settings").update(s).eq("id", id);
    }

    statusEl.textContent = "Restoring apartments...";
    for (const apt of backup.apartments || []) {
      const { apartment_translations, apartment_bedrooms, apartment_amenities, apartment_photos, apartment_videos, ...aptFields } = apt;
      await sb.from("apartments").upsert(aptFields);

      await sb.from("apartment_bedrooms").delete().eq("apartment_id", apt.id);
      if (apartment_bedrooms && apartment_bedrooms.length) {
        await sb.from("apartment_bedrooms").insert(apartment_bedrooms.map(b => ({ apartment_id: apt.id, bed_type: b.bed_type, count: b.count })));
      }

      await sb.from("apartment_amenities").delete().eq("apartment_id", apt.id);
      if (apartment_amenities && apartment_amenities.length) {
        await sb.from("apartment_amenities").insert(apartment_amenities.map(a => ({ apartment_id: apt.id, amenity_id: a.amenity_id })));
      }

      if (apartment_translations && apartment_translations.length) {
        await sb.from("apartment_translations").upsert(
          apartment_translations.map(t => ({ apartment_id: apt.id, language: t.language, name: t.name || "", description: t.description || "", auto_translated: !!t.auto_translated })),
          { onConflict: "apartment_id,language" }
        );
      }

      await sb.from("apartment_photos").delete().eq("apartment_id", apt.id);
      if (apartment_photos && apartment_photos.length) {
        await sb.from("apartment_photos").insert(apartment_photos.map(p => ({ apartment_id: apt.id, url: p.url, sort_order: p.sort_order })));
      }

      await sb.from("apartment_videos").delete().eq("apartment_id", apt.id);
      if (apartment_videos && apartment_videos.length) {
        await sb.from("apartment_videos").insert(apartment_videos.map(v => ({ apartment_id: apt.id, url: v.url, sort_order: v.sort_order })));
      }
    }

    statusEl.textContent = "Restoring reservations and leads...";
    if (backup.reservations && backup.reservations.length) await sb.from("reservations").upsert(backup.reservations);
    if (backup.leads && backup.leads.length) await sb.from("leads").upsert(backup.leads);

    statusEl.textContent = "Restore complete.";
    await loadAll();
  } catch (e) {
    statusEl.textContent = "Something went wrong partway through: " + e.message + ". Check the Apartments tab to see what did and didn't come back.";
  }
}

function renderBackupTab(c) {
  c.innerHTML = `
    <div class="surface-box" style="max-width:480px;">
      <div style="font-weight:600;margin-bottom:8px;">Download a backup</div>
      <div class="muted" style="margin-bottom:12px;">Saves every apartment, amenity, reservation, lead, and setting to a single file on your device. Worth doing every so often, and definitely before making any big changes.</div>
      <button class="btn btn-solid" id="backup-download">Download backup</button>
    </div>

    <div class="surface-box mt" style="max-width:480px;">
      <div style="font-weight:600;margin-bottom:8px;">Restore from a backup</div>
      <div class="muted" style="margin-bottom:12px;">Brings back anything in the file, including apartments that were deleted. Anything still matching by ID gets updated instead of duplicated. This can overwrite current data, so only use a backup file you trust.</div>
      <input type="file" accept="application/json" id="backup-upload">
      <div id="restore-status" class="muted mt"></div>
    </div>`;

  document.getElementById("backup-download").addEventListener("click", async (e) => {
    e.target.textContent = "Preparing...";
    await exportBackup();
    e.target.textContent = "Download backup";
  });

  document.getElementById("backup-upload").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById("restore-status");
    showConfirmModal({
      title: "Restore from this backup?",
      message: `This will overwrite any current apartment, amenity, reservation, or lead that matches something in "${file.name}". Anything you've changed since this backup was made, on matching records, will be replaced.`,
      confirmLabel: "Yes, restore"
    }, () => restoreBackup(file, statusEl));
  });
}

function renderSettingsTab(c) {
  const heroImages = normalizeHeroImagesOwner(SETTINGS.hero_images);
  const highlights = SETTINGS.hero_highlights || [];

  c.innerHTML = `
    <div class="surface-box" style="max-width:420px;">
      <div class="field"><label>Company name</label><input id="s-name" value="${SETTINGS.company_name || ""}"></div>

      <div style="font-weight:600;margin-top:4px;">Hero content</div>
      <div class="muted" style="margin-bottom:10px;">The headline, tagline, description, and highlight pills shown over the homepage photo.</div>
      <div class="field"><label>Headline</label><input id="s-headline" value="${SETTINGS.hero_headline || ""}"></div>
      <div class="field"><label>Tagline (short, shown in caps)</label><input id="s-tagline" value="${SETTINGS.hero_tagline || ""}"></div>
      <div class="field"><label>Description</label><textarea id="s-description">${SETTINGS.hero_description || ""}</textarea></div>

      <div class="field"><label>Highlight pills (${highlights.length})</label>
        <div id="highlight-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">
          ${highlights.map((h, i) => `
            <div style="display:flex;gap:8px;">
              <input class="highlight-input" data-index="${i}" value="${h}" style="flex:1;">
              <a href="#" class="del-highlight" data-index="${i}" style="background:var(--terracotta);color:#fff;border-radius:999px;width:22px;height:22px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px;text-decoration:none;">&times;</a>
            </div>`).join("")}
        </div>
        <div style="display:flex;gap:8px;">
          <input id="new-highlight" placeholder="e.g. Steps from Playa Lagun" style="flex:1;">
          <button class="btn" id="add-highlight">Add</button>
        </div>
      </div>

      <div class="field mt"><label>Hero slideshow images (${heroImages.length})</label>
        <div id="hero-image-list">
          ${heroImages.map((item, i) => `
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
              <img src="${item.url}" style="width:60px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0;">
              <a href="#" class="del-hero" data-index="${i}" style="background:var(--terracotta);color:#fff;border-radius:999px;width:22px;height:22px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px;text-decoration:none;">&times;</a>
            </div>`).join("")}
        </div>
        <input type="file" accept="image/*" id="s-hero-upload">
        <div class="muted mt">These rotate automatically behind the hero content. A handful, five to eight, works best.</div>
      </div>

      <div class="field"><label>WhatsApp number</label><input id="s-whatsapp" value="${SETTINGS.default_whatsapp || ""}"></div>
      <div class="field"><label>Owner notification email</label><input id="s-email" value="${SETTINGS.owner_notification_email || ""}"></div>
      <div class="field"><label>USD to XCG exchange rate</label><input id="s-rate" type="number" step="0.01" value="${SETTINGS.usd_to_xcg_rate || 1.82}"></div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <input type="checkbox" id="s-showusd" ${SETTINGS.show_usd ? "checked" : ""}> Show USD alongside XCG
      </label>
      <div style="font-weight:600;">Check in and check out reminders</div>
      <div class="two-col" style="">
        <div class="field"><label>Check in reminder</label><input id="s-ci-amt" type="number" value="${SETTINGS.checkin_reminder_amount || 1}"></div>
        <div class="field"><label>Unit</label><select id="s-ci-unit"><option value="hours" ${SETTINGS.checkin_reminder_unit === "hours" ? "selected" : ""}>Hours before</option><option value="days" ${SETTINGS.checkin_reminder_unit !== "hours" ? "selected" : ""}>Days before</option></select></div>
        <div class="field"><label>Check out reminder</label><input id="s-co-amt" type="number" value="${SETTINGS.checkout_reminder_amount || 1}"></div>
        <div class="field"><label>Unit</label><select id="s-co-unit"><option value="hours" ${SETTINGS.checkout_reminder_unit === "hours" ? "selected" : ""}>Hours before</option><option value="days" ${SETTINGS.checkout_reminder_unit !== "hours" ? "selected" : ""}>Days before</option></select></div>
      </div>
      <button class="btn btn-solid mt" id="save-settings">Save settings</button>
    </div>

    <div class="surface-box mt" style="max-width:420px;">
      <div style="font-weight:600;margin-bottom:8px;">Website QR code</div>
      <div class="muted" style="margin-bottom:10px;">Print this and leave it in any of the houses, or put it on a business card. It always points to the homepage.</div>
      <canvas id="qr-canvas"></canvas>
      <div class="mt"><a class="btn" id="qr-download">Download</a></div>
    </div>`;

  document.getElementById("s-hero-upload").addEventListener("change", async (e) => {
    if (!e.target.files[0]) return;
    const url = await uploadSiteImage(e.target.files[0], "hero");
    if (url) {
      const next = [...heroImages, { url, caption: "" }];
      await sb.from("site_settings").update({ hero_images: next }).eq("id", SETTINGS.id);
      await loadAll(); renderTab();
    }
  });

  c.querySelectorAll(".del-hero").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      showConfirmModal({
        title: "Remove this hero photo?",
        message: "It comes out of the homepage rotation right away.",
        confirmLabel: "Yes, remove it"
      }, async () => {
        const next = heroImages.filter((_, i) => i !== Number(a.dataset.index));
        await sb.from("site_settings").update({ hero_images: next }).eq("id", SETTINGS.id);
        await loadAll(); renderTab();
      });
    });
  });

  document.getElementById("add-highlight").addEventListener("click", async () => {
    const input = document.getElementById("new-highlight");
    if (!input.value.trim()) return;
    const next = [...highlights, input.value.trim()];
    await sb.from("site_settings").update({ hero_highlights: next }).eq("id", SETTINGS.id);
    await loadAll(); renderTab();
  });

  c.querySelectorAll(".del-highlight").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      showConfirmModal({
        title: "Remove this highlight?",
        message: "It comes off the homepage right away.",
        confirmLabel: "Yes, remove it"
      }, async () => {
        const next = highlights.filter((_, i) => i !== Number(a.dataset.index));
        await sb.from("site_settings").update({ hero_highlights: next }).eq("id", SETTINGS.id);
        await loadAll(); renderTab();
      });
    });
  });

  c.querySelectorAll(".highlight-input").forEach(input => {
    input.addEventListener("blur", async () => {
      const next = highlights.map((h, i) => i === Number(input.dataset.index) ? input.value : h);
      await sb.from("site_settings").update({ hero_highlights: next }).eq("id", SETTINGS.id);
      await loadAll();
    });
  });

  document.getElementById("save-settings").addEventListener("click", async () => {
    await sb.from("site_settings").update({
      company_name: document.getElementById("s-name").value,
      hero_headline: document.getElementById("s-headline").value,
      hero_tagline: document.getElementById("s-tagline").value,
      hero_description: document.getElementById("s-description").value,
      default_whatsapp: document.getElementById("s-whatsapp").value,
      owner_notification_email: document.getElementById("s-email").value,
      usd_to_xcg_rate: Number(document.getElementById("s-rate").value || 1.82),
      show_usd: document.getElementById("s-showusd").checked,
      checkin_reminder_amount: Number(document.getElementById("s-ci-amt").value || 1),
      checkin_reminder_unit: document.getElementById("s-ci-unit").value,
      checkout_reminder_amount: Number(document.getElementById("s-co-amt").value || 1),
      checkout_reminder_unit: document.getElementById("s-co-unit").value
    }).eq("id", SETTINGS.id);
    await loadAll(); renderTab();
  });

  const canvas = document.getElementById("qr-canvas");
  QRCode.toCanvas(canvas, window.location.origin + "/", { width: 200, margin: 1 }, () => {});
  document.getElementById("qr-download").addEventListener("click", (e) => {
    e.preventDefault();
    const link = document.createElement("a");
    link.download = "wikent-lagun-qr.png";
    link.href = canvas.toDataURL();
    link.click();
  });
}

init();
