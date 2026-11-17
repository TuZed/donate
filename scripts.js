"use strict";

(() => {
  /* =========================================================
     CONSTANTS
     ========================================================= */
  const STORAGE_KEY   = "danh_sach_tham_gia_v3";
  const SYNC_CHANNEL  = "danh_sach_tham_gia_sync";
  const PREVIEW_SPEED = 80;   // px/giây — marquee nhỏ
  const DISPLAY_SPEED = 120;  // px/giây — marquee lớn

  const prefersReducedMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =========================================================
     STATE
     ========================================================= */
  let people = [];

  /* =========================================================
     MODE DETECTION
     ========================================================= */
  const isDisplayMode =
    new URLSearchParams(location.search).get("mode") === "display";

  document.body.classList.toggle("mode-display", isDisplayMode);
  document.body.classList.toggle("mode-input", !isDisplayMode);

  /* =========================================================
     DOM REFERENCES
     ========================================================= */
  const form          = document.getElementById("entryForm");
  const nameInput     = document.getElementById("nameInput");
  const moneyInput    = document.getElementById("moneyInput");
  const nameErrorEl   = document.getElementById("nameError");
  const moneyErrorEl  = document.getElementById("moneyError");
  const countEl       = document.getElementById("count");
  const totalEl       = document.getElementById("total");
  const tableBody     = document.getElementById("tableBody");
  const clearBtn      = document.getElementById("clearBtn");
  const openDisplayBtn = document.getElementById("openDisplayBtn");
  const displayCountEl = document.getElementById("displayCount");
  const displayTotalEl = document.getElementById("displayTotal");
  const fullscreenBtn  = document.getElementById("fullscreenBtn");

  const previewMarqueeEl = document.querySelector('[data-marquee="preview"]');
  const displayMarqueeEl = document.querySelector('[data-marquee="display"]');

  /* =========================================================
     UTILITIES
     ========================================================= */
  function formatMoney(n) {
    return Number(n).toLocaleString("vi-VN") + "đ";
  }

  function sanitizePerson(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const money = Number(raw.money);
    if (!name || !Number.isFinite(money) || money < 0) return null;
    return { name, money };
  }

  function sanitizeList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(sanitizePerson).filter(Boolean);
  }

  /* =========================================================
     PERSISTENCE
     ========================================================= */
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return sanitizeList(JSON.parse(raw));
    } catch (e) {
      console.warn("Không đọc được dữ liệu đã lưu:", e);
      return [];
    }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
    } catch (e) {
      console.warn("Không ghi được vào localStorage:", e);
    }
  }

  /* =========================================================
     CROSS-TAB SYNC
     ========================================================= */
  let syncChannel = null;
  try {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL);
  } catch (e) {
    syncChannel = null;
    console.warn("BroadcastChannel không khả dụng — dùng storage event.");
  }

  function broadcastChange() {
    if (!syncChannel) return;
    try { syncChannel.postMessage({ type: "sync", people }); }
    catch (e) { console.warn("Broadcast lỗi:", e); }
  }

  function applyRemotePeople(newPeople) {
    const clean = sanitizeList(newPeople);
    const currentSer = JSON.stringify(people);
    const nextSer = JSON.stringify(clean);
    if (currentSer === nextSer) return; // tránh render thừa
    people = clean;
    render();
  }

  if (syncChannel) {
    syncChannel.addEventListener("message", (e) => {
      if (!e.data || e.data.type !== "sync") return;
      applyRemotePeople(e.data.people);
    });
  }

  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      applyRemotePeople(JSON.parse(e.newValue));
    } catch (err) {
      console.warn("Storage event không hợp lệ:", err);
    }
  });

  /* =========================================================
     MARQUEE
     ========================================================= */
  class Marquee {
    constructor(rootEl, speed) {
      this.root   = rootEl;
      this.track  = rootEl.querySelector(".track");
      this.groups = Array.from(rootEl.querySelectorAll(".group"));

      if (this.groups.length < 2) {
        throw new Error("Marquee cần ít nhất 2 .group bên trong .track.");
      }

      this.speed     = speed;
      this.x         = 0;
      this.lastTime  = 0;
      this.rafId     = null;
      this.groupWidth = 0;
      this.isRunning = false;
    }

    setItems(nodes) {
      // Xoá nội dung cũ
      this.groups.forEach((g) => g.replaceChildren());

      // ----- Trạng thái rỗng -----
      if (!nodes || nodes.length === 0) {
        this.groups.forEach((g) => {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent =
            "Trường THPT chuyên Nguyễn Chí Thanh — Lâm Đồng";
          g.appendChild(empty);
        });
        this.groupWidth = this.groups[0].scrollWidth;
        this.stop();
        this.x = 0;
        this.track.style.transform = "translateX(0)";
        return;
      }

      // ----- Giảm chuyển động: chỉ hiển thị tĩnh, cho phép cuộn ngang -----
      if (prefersReducedMotion) {
        nodes.forEach((n) => this.groups[0].appendChild(n));
        this.groups[1].replaceChildren();
        this.groupWidth = this.groups[0].scrollWidth;
        this.stop();
        this.x = 0;
        this.track.style.transform = "translateX(0)";
        return;
      }

      // ----- Bình thường: nhân bản vào cả 2 group -----
      const fillGroup = (group) => {
        nodes.forEach((n) => group.appendChild(n.cloneNode(true)));
      };
      this.groups.forEach(fillGroup);

      // Đảm bảo mỗi group đủ rộng để phủ viewport
      const viewportWidth = this.root.clientWidth || 0;
      if (viewportWidth > 0) {
        this.groups.forEach((group) => {
          let safety = 0;
          while (group.scrollWidth < viewportWidth && safety < 20) {
            nodes.forEach((n) => group.appendChild(n.cloneNode(true)));
            safety++;
          }
        });
      }

      this.groupWidth = this.groups[0].scrollWidth;
      this.x = 0;
      this.lastTime = 0;
      this.track.style.transform = "translateX(0)";
      this.start();
    }

    start() {
      if (this.isRunning) return;
      if (this.groupWidth <= 0) return;

      const viewportWidth = this.root.clientWidth || 0;
      if (this.groupWidth < viewportWidth) {
        // Nội dung chưa đủ rộng để cuộn mượt — đứng yên
        this.track.style.transform = "translateX(0)";
        return;
      }

      this.isRunning = true;
      this.lastTime  = 0;
      this.rafId = requestAnimationFrame((now) => this.tick(now));
    }

    stop() {
      this.isRunning = false;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }

    tick(now) {
      if (!this.isRunning) return;

      if (!this.lastTime) this.lastTime = now;
      let dt = (now - this.lastTime) / 1000;
      if (dt > 0.1) dt = 0.1; // chống nhảy khi tab được phục hồi
      this.lastTime = now;

      this.x -= this.speed * dt;

      // Bọc vòng: track chứa 2 group giống nhau
      while (this.x <= -this.groupWidth) {
        this.x += this.groupWidth;
      }

      this.track.style.transform = `translateX(${this.x}px)`;
      this.rafId = requestAnimationFrame((n) => this.tick(n));
    }
  }

  // Chỉ khởi tạo marquee cho view đang hoạt động
  let activeMarquee = null;
  if (isDisplayMode && displayMarqueeEl) {
    activeMarquee = new Marquee(displayMarqueeEl, DISPLAY_SPEED);
  } else if (previewMarqueeEl) {
    activeMarquee = new Marquee(previewMarqueeEl, PREVIEW_SPEED);
  }

  /* =========================================================
     ITEM FACTORY
     ========================================================= */
  function makeMarqueeItem(person) {
    const box = document.createElement("div");
    box.className = "item";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = person.name;

    const money = document.createElement("div");
    money.className = "money";
    money.textContent = formatMoney(person.money);

    box.append(name, money);
    return box;
  }

  /* =========================================================
     RENDER
     ========================================================= */
  function render() {
    // Marquee
    if (activeMarquee) {
      const nodes = people.map(makeMarqueeItem);
      activeMarquee.setItems(nodes);
    }

    const sum = people.reduce((t, p) => t + p.money, 0);

    // Input view — stats
    if (countEl) countEl.textContent = people.length;
    if (totalEl) totalEl.textContent = formatMoney(sum);

    // Input view — bảng lịch sử
    if (tableBody) {
      tableBody.replaceChildren();

      if (people.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.className = "table-empty";
        td.colSpan = 3;
        td.textContent = "Chưa có ai đăng ký.";
        tr.appendChild(td);
        tableBody.appendChild(tr);
      } else {
        people.forEach((person, index) => {
          const tr = document.createElement("tr");

          const stt = document.createElement("td");
          stt.textContent = String(index + 1);

          const nameTd = document.createElement("td");
          nameTd.textContent = person.name;

          const moneyTd = document.createElement("td");
          moneyTd.textContent = formatMoney(person.money);

          tr.append(stt, nameTd, moneyTd);
          tableBody.appendChild(tr);
        });
      }
    }

    // Display view — stats
    if (displayCountEl) displayCountEl.textContent = people.length;
    if (displayTotalEl) displayTotalEl.textContent = formatMoney(sum);
  }

  /* =========================================================
     FORM VALIDATION
     ========================================================= */
  function setError(input, errorEl, message) {
    if (!input || !errorEl) return;
    input.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError(input, errorEl) {
    if (!input || !errorEl) return;
    input.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");
    errorEl.textContent = "";
    errorEl.hidden = true;
  }

  function validateForm() {
    let firstInvalid = null;

    const name = (nameInput.value || "").trim();
    if (!name) {
      setError(nameInput, nameErrorEl, "Vui lòng nhập họ tên.");
      firstInvalid = firstInvalid || nameInput;
    } else {
      clearError(nameInput, nameErrorEl);
    }

    const moneyRaw = moneyInput.value;
    const money = Number(moneyRaw);
    if (moneyRaw === "" || !Number.isFinite(money) || money < 0) {
      setError(moneyInput, moneyErrorEl, "Số tiền phải là số không âm.");
      firstInvalid = firstInvalid || moneyInput;
    } else {
      clearError(moneyInput, moneyErrorEl);
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return null;
    }

    return { name, money };
  }

  /* =========================================================
     ACTIONS
     ========================================================= */
  function commitChange() {
    saveToStorage();
    broadcastChange();
    render();
  }

  function handleSubmit(e) {
    e.preventDefault();
    const data = validateForm();
    if (!data) return;

    people.unshift({ name: data.name, money: data.money });
    commitChange();

    form.reset();
    nameInput.focus();
  }

  function handleClearAll() {
    if (people.length === 0) return;
    if (!confirm("Bạn có chắc muốn xoá toàn bộ danh sách?")) return;
    people = [];
    commitChange();
  }

  function handleOpenDisplay() {
    const url = new URL(location.href);
    url.searchParams.set("mode", "display");
    const win = window.open(
      url.toString(),
      "display_screen",
      "popup=yes,width=1280,height=800"
    );
    if (!win) {
      alert(
        "Trình duyệt chặn cửa sổ bật lên.\n" +
        "Vui lòng cho phép popup hoặc mở thủ công:\n\n" + url.toString()
      );
    }
  }

  function handleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((err) =>
        console.warn("Không thoát được fullscreen:", err)
      );
    } else {
      document.documentElement.requestFullscreen().catch((err) =>
        console.warn("Không vào được fullscreen:", err)
      );
    }
  }

  function updateFullscreenIcon() {
    if (!fullscreenBtn) return;
    const isFs = Boolean(document.fullscreenElement);
    fullscreenBtn.textContent = isFs ? "✕" : "⛶";
    fullscreenBtn.setAttribute(
      "aria-label",
      isFs ? "Thoát toàn màn hình" : "Bật toàn màn hình"
    );
  }

  /* =========================================================
     EVENT BINDING
     ========================================================= */
  if (form) {
    form.addEventListener("submit", handleSubmit);
  }

  if (nameInput) {
    nameInput.addEventListener("input", () => clearError(nameInput, nameErrorEl));
  }
  if (moneyInput) {
    moneyInput.addEventListener("input", () => clearError(moneyInput, moneyErrorEl));
  }

  if (clearBtn) clearBtn.addEventListener("click", handleClearAll);
  if (openDisplayBtn) openDisplayBtn.addEventListener("click", handleOpenDisplay);
  if (fullscreenBtn) fullscreenBtn.addEventListener("click", handleFullscreen);

  document.addEventListener("fullscreenchange", updateFullscreenIcon);
  updateFullscreenIcon();

  // Re-render khi viewport thay đổi (debounced)
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      render();
    }, 200);
  });

  /* =========================================================
     INITIALIZATION
     ========================================================= */
  people = loadFromStorage();
  render();
})();