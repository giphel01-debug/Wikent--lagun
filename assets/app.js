const currentLang = "en";
let SETTINGS = null;
let APARTMENTS = [];
let ALL_RESERVATIONS = [];

async function boot() {
  const { data: settingsRows } = await sb.from("site_settings").select("*").limit(1);
  SETTINGS = (settingsRows && settingsRows[0]) || {};

  const { data: apts, error } = await sb.from("apartments").select(`
    *,
    apartment_translations(*),
    apartment_photos(*),
    apartment_videos(*),
    apartment_bedrooms(*),
    apartment_amenities(amenity_id, amenities(*))
  `);
  if (error) {
    document.getElementById("content").innerHTML = `<p>Could not load listings. ${error.message}</p>`;
    return;
  }
  APARTMENTS = apts || [];

  const { data: reservations } = await sb.from("reservations").select("*").eq("status", "confirmed");
  ALL_RESERVATIONS = reservations || [];

  renderHero();
  window.addEventListener("hashchange", route);
  route();
}

function getTranslation(apt, lang) {
  const rows = apt.apartment_translations || [];
  const t = rows.find(r => r.language === lang) || {};
  const en = rows.find(r => r.language === "en") || {};
  return {
    name: t.name || en.name || "Untitled listing",
    description: t.description || en.description || ""
  };
}

function xcgToUsd(xcg) {
  return Math.round(xcg / (SETTINGS.usd_to_xcg_rate || 1.82));
}

function whatsappLink(name) {
  const msg = encodeURIComponent(`Hi! I'm interested in ${name} at Wikent @ Lagun.`);
  return `https://wa.me/${SETTINGS.default_whatsapp || ""}?text=${msg}`;
}

function ownerAlertWhatsappLink(lines) {
  const msg = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${SETTINGS.default_whatsapp || ""}?text=${msg}`;
}

function renderHero() {
  const hero = document.getElementById("hero");
  const images = normalizeHeroImages(SETTINGS.hero_images);
  const bg = images[0] ? `background-image:url('${images[0].url}');background-size:cover;background-position:center;` : "";
  const highlights = SETTINGS.hero_highlights || [];

  hero.innerHTML = `
    <div class="hero" id="hero-photo" style="${bg}">
      <div class="hero-shade"></div>
      <div class="hero-content">
        <div class="hero-headline">${SETTINGS.hero_headline || ""}</div>
        <div class="hero-tagline">${SETTINGS.hero_tagline || ""}</div>
        <p class="hero-desc">${SETTINGS.hero_description || ""}</p>
      </div>
      ${highlights.length ? `
        <div class="hero-highlights">
          ${highlights.map(h => `<span class="hero-highlight">${h}</span>`).join("")}
        </div>` : ""}
    </div>`;

  if (images.length > 1) {
    let i = 0;
    setInterval(() => {
      i = (i + 1) % images.length;
      const el = document.getElementById("hero-photo");
      if (el) el.style.backgroundImage = `url('${images[i].url}')`;
    }, 5000);
  }
}

function normalizeHeroImages(raw) {
  return (raw || []).map(item => typeof item === "string" ? { url: item, caption: "" } : item);
}

function route() {
  if (lightboxOpen) { closeLightbox(); }
  const hash = window.location.hash;
  const match = hash.match(/^#\/apt\/(.+)$/);
  if (match) {
    renderDetail(match[1]);
  } else {
    renderHome();
  }
}

function renderHome() {
  const content = document.getElementById("content");
  if (APARTMENTS.length === 0) {
    content.innerHTML = "<p>No listings yet.</p>";
    return;
  }
  content.innerHTML = `
    <div class="grid" id="listings"></div>
    <div class="surface-box mt" style="max-width:340px;margin:28px auto 0;">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;text-align:center;">Check availability</div>
      <div class="chips" id="home-cal-tabs" style="margin:0 0 10px;"></div>
      <div id="home-calendar"></div>
      <div id="home-notify-holder"></div>
    </div>`;
  const grid = document.getElementById("listings");
  APARTMENTS.forEach(apt => {
    const tr = getTranslation(apt, currentLang);
    const amenities = (apt.apartment_amenities || []).map(a => a.amenities).filter(Boolean);
    const sortedPhotos = sortByOrder(apt.apartment_photos);
    const card = document.createElement("a");
    card.className = "card";
    card.href = `#/apt/${apt.id}`;
    card.innerHTML = `
      <div class="roofline"></div>
      <div class="card-photo">${sortedPhotos[0] ? `<img src="${sortedPhotos[0].url}" style="width:100%;height:100%;object-fit:cover;">` : "Photos coming soon"}</div>
      <div class="card-body">
        <div style="font-size:15px;font-weight:600;margin-bottom:4px;">${tr.name}</div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:8px;">${apt.address || ""}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
          ${amenities.map(a => `<span class="badge badge-olive">${a.label}</span>`).join("")}
        </div>
        <div style="font-size:16px;font-weight:600;">
          XCG ${money(apt.weekend_price)}
          ${SETTINGS.show_usd ? `<span class="muted">($${money(xcgToUsd(apt.weekend_price))})</span>` : ""}
          <span class="muted">/ weekend</span>
        </div>
      </div>`;
    grid.appendChild(card);
  });

  renderHomeCalendar();
}

function renderHomeCalendar() {
  let selectedId = APARTMENTS[0] ? APARTMENTS[0].id : null;
  const tabsEl = document.getElementById("home-cal-tabs");

  function drawTabs() {
    tabsEl.innerHTML = APARTMENTS.map(a => {
      const tr = getTranslation(a, currentLang);
      const short = tr.name.length > 16 ? tr.name.slice(0, 14) + "…" : tr.name;
      return `<span class="chip ${a.id === selectedId ? "active" : ""}" data-id="${a.id}">${short}</span>`;
    }).join("");
    tabsEl.querySelectorAll(".chip").forEach(chip => {
      chip.addEventListener("click", () => {
        selectedId = chip.dataset.id;
        document.getElementById("home-notify-holder").innerHTML = "";
        drawTabs();
        drawCalendar();
      });
    });
  }

  function drawCalendar() {
    const apt = APARTMENTS.find(a => a.id === selectedId);
    const holder = document.getElementById("home-calendar");
    if (!apt) { holder.innerHTML = ""; return; }
    const aptReservations = ALL_RESERVATIONS.filter(r => r.apartment_id === selectedId);
    renderCalendar(holder, apt, aptReservations,
      (dateStr) => renderNotifyForm(apt, dateStr, "home-notify-holder"),
      (dateStr) => { window.__pendingBookDate = dateStr; window.location.hash = `#/apt/${apt.id}`; }
    );
  }

  drawTabs();
  drawCalendar();
}

async function renderDetail(id) {
  const apt = APARTMENTS.find(a => a.id === id);
  const content = document.getElementById("content");
  if (!apt) { content.innerHTML = "<p>Listing not found.</p>"; return; }

  sb.from("page_views").insert({ apartment_id: id }).then(() => {});

  const tr = getTranslation(apt, currentLang);
  const amenities = (apt.apartment_amenities || []).map(a => a.amenities).filter(Boolean);
  const bedrooms = apt.apartment_bedrooms || [];
  const photos = sortByOrder(apt.apartment_photos);
  const videos = sortByOrder(apt.apartment_videos);

  const reservations = ALL_RESERVATIONS.filter(r => r.apartment_id === id);

  const galleryHtml = (photos.length || videos.length)
    ? `<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;margin:16px 0;">
        ${photos.map((p, i) => `<img src="${p.url}" class="gallery-photo" data-index="${i}" style="width:220px;height:160px;object-fit:cover;border-radius:12px;flex-shrink:0;cursor:pointer;">`).join("")}
        ${videos.map(v => `<video src="${v.url}" controls style="width:220px;height:160px;object-fit:cover;border-radius:12px;flex-shrink:0;"></video>`).join("")}
      </div>`
    : `<div style="height:160px;background:var(--sand);border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--sand-dark);font-size:13px;margin:16px 0;">Photo and video gallery coming soon</div>`;

  content.innerHTML = `
    <a href="#/" class="muted" style="text-decoration:none;">&larr; Back to all apartments</a>
    ${galleryHtml}
    <h1 style="font-family:Georgia,serif;font-size:22px;margin:0 0 4px;">${tr.name}</h1>
    <div class="muted" style="margin-bottom:14px;">${apt.address || ""}</div>
    <p style="font-size:14px;margin-bottom:12px;">${tr.description}</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
      ${amenities.map(a => `<span class="badge badge-olive">${a.label}</span>`).join("")}
    </div>
    <div class="two-col" style="margin-bottom:20px;">
      <div class="surface-box">
        <div class="muted" style="margin-bottom:8px;">Sleeping and bathrooms</div>
        ${bedrooms.map(b => `<div>${b.count} ${b.bed_type} bed${b.count > 1 ? "s" : ""}</div>`).join("")}
        <div style="margin-top:6px;">${apt.bathrooms_indoor || 0} bathroom${apt.bathrooms_indoor !== 1 ? "s" : ""} indoor${apt.bathrooms_outdoor ? `, ${apt.bathrooms_outdoor} outdoor` : ""}</div>
      </div>
      <div class="surface-box">
        <div class="muted" style="margin-bottom:8px;">Price</div>
        <div style="font-size:18px;font-weight:600;">XCG ${money(apt.weekend_price)} ${SETTINGS.show_usd ? `<span class="muted">($${money(xcgToUsd(apt.weekend_price))})</span>` : ""}</div>
        <div class="muted">Friday to Sunday weekend package</div>
        <div style="margin-top:6px;font-size:13px;">XCG ${money(apt.extra_day_price)} per night for any other stay</div>
        <div style="font-size:13px;">Deposit (bòrg): XCG ${money(apt.deposit)}</div>
      </div>
    </div>
    <div class="surface-box" style="margin-bottom:20px;font-size:13.5px;line-height:1.6;">
      <div><strong>Check in / check out:</strong> ${apt.checkin_checkout_schedule || ""}</div>
      <div><strong>Electricity:</strong> ${apt.electricity_note || ""}</div>
      <div><strong>Water:</strong> ${apt.water_note || ""}</div>
      <div><strong>Cancellation:</strong> ${apt.cancellation_policy || ""}</div>
    </div>
    <div style="margin-bottom:20px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:4px;">Availability</div>
      <div class="muted" style="margin-bottom:10px;">Tap a reserved date to ask to be notified if it opens up.</div>
      <div class="surface-box" id="calendar-holder"></div>
      <div id="notify-holder" class="mt"></div>
    </div>
    <div style="margin-bottom:24px;">
      <a class="btn btn-solid" href="${whatsappLink(tr.name)}" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
    </div>
    <div class="surface-box">
      <div style="font-weight:600;font-size:15px;margin-bottom:12px;">Request to book</div>
      <div id="book-form"></div>
    </div>`;

  renderCalendar(document.getElementById("calendar-holder"), apt, reservations || [],
    (dateStr) => renderNotifyForm(apt, dateStr),
    (dateStr) => renderBookForm(apt, tr, dateStr)
  );
  renderBookForm(apt, tr, window.__pendingBookDate || null);
  window.__pendingBookDate = null;

  content.querySelectorAll(".gallery-photo").forEach(img => {
    img.addEventListener("click", () => openLightbox(photos, Number(img.dataset.index)));
  });
}

function renderCalendar(container, apt, reservations, onReservedClick, onAvailableClick) {
  let monthOffset = 0;

  function draw() {
    const today = new Date();
    const view = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const year = view.getFullYear(), month = view.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const label = view.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    function dateStrFor(day) { return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
    function isReserved(day) {
      const ds = dateStrFor(day);
      return reservations.some(r => ds >= r.check_in && ds < r.check_out);
    }
    function isToday(day) { return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day; }

    let cells = "";
    for (let i = 0; i < firstWeekday; i++) cells += `<span></span>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const reserved = isReserved(d);
      cells += `<span class="calendar-day ${reserved ? "calendar-reserved" : "calendar-avail"} ${isToday(d) ? "calendar-today" : ""}" data-date="${dateStrFor(d)}">${d}</span>`;
    }

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <button class="btn" id="cal-prev">&larr;</button>
        <div style="font-weight:600;">${label}</div>
        <button class="btn" id="cal-next">&rarr;</button>
      </div>
      <div class="calendar-grid" style="margin-bottom:6px;">
        ${["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => `<span class="muted center">${d}</span>`).join("")}
      </div>
      <div class="calendar-grid">${cells}</div>
      <div style="display:flex;gap:14px;margin-top:10px;" class="muted">
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#5B8C5A;margin-right:5px;"></span>Available, tap to book</span>
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#A63D2F;margin-right:5px;"></span>Reserved</span>
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;border:1.5px solid var(--terracotta);margin-right:5px;"></span>Today</span>
      </div>`;

    container.querySelector("#cal-prev").addEventListener("click", () => { monthOffset--; draw(); });
    container.querySelector("#cal-next").addEventListener("click", () => { monthOffset++; draw(); });
    container.querySelectorAll(".calendar-reserved").forEach(el => {
      el.addEventListener("click", () => onReservedClick(el.dataset.date));
    });
    if (onAvailableClick) {
      container.querySelectorAll(".calendar-avail").forEach(el => {
        el.addEventListener("click", () => onAvailableClick(el.dataset.date));
      });
    }
  }
  draw();
}

function renderNotifyForm(apt, dateStr, holderId = "notify-holder") {
  const holder = document.getElementById(holderId);
  holder.innerHTML = `
    <div class="surface-box" style="background:var(--sand);">
      <div style="font-size:13px;margin-bottom:10px;"><strong>${dateStr}</strong> is booked. Leave your info and get notified if it opens up.</div>
      <div class="two-col" style="margin-bottom:10px;">
        <input id="nf-name" placeholder="Full name">
        <input id="nf-phone" placeholder="Phone or WhatsApp">
        <input id="nf-email" placeholder="Email (optional)" style="grid-column:1/-1;">
      </div>
      <button class="btn btn-solid" id="nf-submit">Notify me</button>
    </div>`;
  holder.querySelector("#nf-submit").addEventListener("click", async () => {
    const name = holder.querySelector("#nf-name").value;
    const phone = holder.querySelector("#nf-phone").value;
    const email = holder.querySelector("#nf-email").value;
    await sb.from("leads").insert({
      apartment_id: apt.id, name, phone, email,
      check_in: dateStr, check_out: dateStr,
      source: "notify_me", status: "open"
    });
    const tr = getTranslation(apt, currentLang);
    const waLink = ownerAlertWhatsappLink([
      `Notify me request, ${tr.name}`,
      `Name: ${name}`,
      phone ? `Phone: ${phone}` : null,
      `Wants to know if ${dateStr} opens up.`
    ].filter(Boolean));
    holder.innerHTML = `
      <div class="surface-box" style="background:var(--olive);color:var(--olive-dark);margin-bottom:10px;">Got it, you'll hear from the owner if ${dateStr} opens up.</div>
      <a class="btn btn-solid" href="${waLink}" target="_blank" rel="noopener noreferrer">Also send this to WhatsApp</a>`;
  });
}

function renderBookForm(apt, tr, presetDate) {
  const holder = document.getElementById("book-form");
  const initialCheckIn = presetDate || todayStr();
  const initialCheckOut = addDays(initialCheckIn, 1);
  holder.innerHTML = `
    <div class="two-col" style="">
      <div class="field"><label>Full name</label><input id="bf-name"></div>
      <div class="field"><label>Phone</label><input id="bf-phone"></div>
      <div class="field"><label>Email</label><input id="bf-email"></div>
      <div class="field"><label>Number of guests</label><input id="bf-guests" type="number"></div>
      <div class="field"><label>Check in</label><input type="date" id="bf-checkin" value="${initialCheckIn}" min="${todayStr()}"></div>
      <div class="field"><label>Check out</label><input type="date" id="bf-checkout" value="${initialCheckOut}" min="${addDays(initialCheckIn, 1)}"></div>
    </div>
    <div class="muted" id="bf-summary" style="margin-bottom:12px;"></div>
    <button class="btn btn-solid" id="bf-submit">Send request</button>
    <div id="bf-msg" class="mt"></div>`;

  if (presetDate) {
    setTimeout(() => { holder.scrollIntoView({ behavior: "smooth", block: "center" }); }, 60);
  }

  function updateSummary() {
    const checkIn = holder.querySelector("#bf-checkin").value;
    let checkOut = holder.querySelector("#bf-checkout").value;
    holder.querySelector("#bf-checkout").min = addDays(checkIn, 1);
    if (checkOut <= checkIn) {
      checkOut = addDays(checkIn, 1);
      holder.querySelector("#bf-checkout").value = checkOut;
    }
    const nights = nightsList(checkIn, checkOut).length;
    const total = calculatePrice(apt, checkIn, checkOut);
    holder.querySelector("#bf-summary").textContent = `${nights} night${nights === 1 ? "" : "s"} · Total: XCG ${money(total)}`;
  }
  holder.querySelector("#bf-checkin").addEventListener("change", updateSummary);
  holder.querySelector("#bf-checkout").addEventListener("change", updateSummary);
  updateSummary();

  holder.querySelector("#bf-submit").addEventListener("click", async () => {
    const checkIn = holder.querySelector("#bf-checkin").value;
    const checkOut = holder.querySelector("#bf-checkout").value;
    if (!checkIn || !checkOut || checkOut <= checkIn) { alert("Pick a valid check in and check out date."); return; }
    const name = holder.querySelector("#bf-name").value;
    const phone = holder.querySelector("#bf-phone").value;
    const guests = Number(holder.querySelector("#bf-guests").value || 0);
    await sb.from("leads").insert({
      apartment_id: apt.id,
      name, phone,
      email: holder.querySelector("#bf-email").value,
      guests,
      check_in: checkIn, check_out: checkOut,
      source: "request_to_book", status: "open"
    });
    const total = calculatePrice(apt, checkIn, checkOut);
    const waLink = ownerAlertWhatsappLink([
      `Request to book, ${tr.name}`,
      `Name: ${name}`,
      phone ? `Phone: ${phone}` : null,
      `${checkIn} to ${checkOut}, ${guests} guest${guests === 1 ? "" : "s"}`,
      `Total: XCG ${money(total)}`
    ].filter(Boolean));
    holder.querySelector("#bf-msg").innerHTML = `
      <div class="surface-box" style="background:var(--olive);color:var(--olive-dark);margin-bottom:10px;">Thanks! Your request has been sent. The owner will follow up with you shortly.</div>
      <a class="btn btn-solid" href="${waLink}" target="_blank" rel="noopener noreferrer">Also send this to WhatsApp</a>`;
  });
}

// ---------- Lightbox ----------
let lightboxOpen = false;

function openLightbox(photos, startIndex) {
  let idx = startIndex;
  const overlay = document.createElement("div");
  overlay.id = "lightbox-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(10,9,7,0.95);z-index:1000;display:flex;align-items:center;justify-content:center;flex-direction:column;";
  overlay.innerHTML = `
    <div style="position:absolute;top:16px;right:16px;color:#fff;font-size:28px;cursor:pointer;padding:8px;line-height:1;" id="lb-close">&times;</div>
    <div style="position:absolute;top:16px;left:16px;color:rgba(255,255,255,0.8);font-size:13px;" id="lb-counter"></div>
    <img id="lb-img" style="max-width:92vw;max-height:78vh;object-fit:contain;border-radius:6px;">
    <div style="display:flex;gap:20px;align-items:center;margin-top:18px;">
      <button id="lb-prev" style="background:rgba(255,255,255,0.12);border:none;color:#fff;width:42px;height:42px;border-radius:999px;font-size:18px;cursor:pointer;">&larr;</button>
      <button id="lb-next" style="background:rgba(255,255,255,0.12);border:none;color:#fff;width:42px;height:42px;border-radius:999px;font-size:18px;cursor:pointer;">&rarr;</button>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  lightboxOpen = true;
  history.pushState({ lightbox: true }, "", location.href);

  function render() {
    overlay.querySelector("#lb-img").src = photos[idx].url;
    overlay.querySelector("#lb-counter").textContent = `${idx + 1} / ${photos.length}`;
  }
  render();

  overlay.querySelector("#lb-prev").addEventListener("click", () => { idx = (idx - 1 + photos.length) % photos.length; render(); });
  overlay.querySelector("#lb-next").addEventListener("click", () => { idx = (idx + 1) % photos.length; render(); });
  overlay.querySelector("#lb-close").addEventListener("click", () => { history.back(); });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) history.back(); });
}

function closeLightbox() {
  const overlay = document.getElementById("lightbox-overlay");
  if (overlay) overlay.remove();
  document.body.style.overflow = "";
  lightboxOpen = false;
}

window.addEventListener("popstate", () => {
  if (lightboxOpen) { closeLightbox(); }
});

boot();
