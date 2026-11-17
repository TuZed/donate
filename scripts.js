"use strict";

(() => {
  /* =========================================================
     CẤU HÌNH SUPABASE — ĐIỀN THÔNG TIN CỦA BẠN
     ========================================================= */
  const SUPABASE_URL = "https://ktrapgpglbsqukipzook.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_nRjbF6SkyRBoh_3wzevbeA_G9XOdDGc";

  /* =========================================================
     CONSTANTS
     ========================================================= */
  const TABLE = "people";
  const PREVIEW_SPEED = 80;
  const DISPLAY_SPEED = 120;

  const prefersReducedMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =========================================================
     KHỞI TẠO SUPABASE CLIENT
     ========================================================= */
  if (!window.supabase) {
    document.body.innerHTML =
      '<p style="padding:24px;font-family:sans-serif;color:#c03939">' +
      "Không tải được Supabase JS. Kiểm tra kết nối mạng và thử lại." +
      "</p>";
    return;
  }

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* =========================================================
     STATE
     ========================================================= */
  let people = [];          // { id, name, money, created_at }
  let isLoading = true;
  let isMutating = false;

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
  const form            = document.getElementById("entryForm");
  const nameInput       = document.getElementById("nameInput");
  const moneyInput      = document.getElementById("moneyInput");
  const nameErrorEl     = document.getElementById("nameError");
  const moneyErrorEl    = document.getElementById("moneyError");
  const countEl         = document.getElementById("count");
  const totalEl         = document.getElementById("total");
  const tableBody       = document.getElementById("tableBody");
  const clearBtn        = document.getElementById("clearBtn");
  const openDisplayBtn  = document.getElementById("openDisplayBtn");
  const submitBtn       = document.getElementById("submitBtn");
  const displayCountEl  = document.getElementById("displayCount");
  const displayTotalEl  = document.getElementById("displayTotal");
  const fullscreenBtn   = document.getElementById("fullscreenBtn");
  const syncStatusInput = document.getElementById("syncStatusInput");
  const syncStatusDisplay = document.getElementById("syncStatusDisplay");

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
    return {
      id: raw.id,
      name,
      money,
      created_at: raw.created_at
    };
  }

  function sanitizeList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(sanitizePerson).filter(Boolean);
  }

  function setSyncStatus(message, isError = false) {
    const targets = [syncStatusInput, syncStatusDisplay].filter(Boolean);
    targets.forEach((el) => {
      el.textContent = message || "";
      el.classList.toggle("sync-status--error", Boolean(isError));
    });
  }

  function setBusy(busy) {
    isMutating = busy;
    if (submitBtn) submitBtn.disabled = busy || isLoading;
    if (clearBtn) clearBtn.disabled = busy || isLoading;
    if (openDisplayBtn) openDisplayBtn.disabled = busy || isLoading;
  }

  /* =========================================================
     SUPABASE DATA ACCESS
     ========================================================= */
  async function fetchPeople() {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, name, money, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return sanitizeList(data || []);
  }

  async function insertPerson(name, money) {
    const { error } = await supabase
      .from(TABLE)
      .insert([{ name, money }]);

    if (error) throw error;
  }

  async function deleteAllPeople() {
    // Xoá tất cả: điều kiện luôn đúng với id > 0
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .gt("id", 0);

    if (error) throw error;
  }

  /* =========================================================
     MARQUEE (giữ nguyên cơ chế cũ)
     ========================================================= */
  class Marquee {
    constructor(rootEl, speed) {
      this.root = rootEl;
      this.track = rootEl.querySelector(".track");
      this.groups = Array.from(rootEl.querySelectorAll(".group"));
      if (this.groups.length < 2) {
        throw new Error("Marquee cần ít nhất 2 .group.");
      }
      this.speed = speed;
      this.x = 0;
      this.lastTime = 0;
      this.rafId = null;
      this.groupWidth = 0;
      this.isRunning = false;
    }

    setItems(nodes) {
      this.groups.forEach((g) => g.replaceChildren());

      if (!nodes || nodes.length === 0) {
        this.groups.forEach((g) => {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "Chưa có dữ liệu — hãy thêm người tham gia.";
          g.appendChild(empty);
        });
        this.groupWidth = this.groups[0].scrollWidth;
        this.stop();
        this.x = 0;
        this.track.style.transform = "translateX(0)";
        return;
      }

      if (prefersReducedMotion) {
        nodes.forEach((n) => this.groups[0].appendChild(n));
        this.groups[1].replaceChildren();
        this.groupWidth = this.groups[0].scrollWidth;
        this.stop();
        this.x = 0;
        this.track.style.transform = "translateX(0)";
        return;
      }

      const fillGroup = (group) => {
        nodes.forEach((n) => group.appendChild(n.cloneNode(true)));
      };
      this.groups.forEach(fillGroup);

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
      if (this.isRunning || this.groupWidth <= 0) return;
      const viewportWidth = this.root.clientWidth || 0;
      if (this.groupWidth < viewportWidth) {
        this.track.style.transform = "translateX(0)";
        return;
      }
      this.isRunning = true;
      this.lastTime = 0;
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
      if (dt > 0.1) dt = 0.1;
      this.lastTime = now;
      this.x -= this.speed * dt;
      while (this.x <= -this.groupWidth) this.x += this.groupWidth;
      this.track.style.transform = `translateX(${this.x}px)`;
      this.rafId = requestAnimationFrame((n) => this.tick(n));
    }
  }

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
    if (activeMarquee) {
      activeMarquee.setItems(people.map(makeMarqueeItem));
    }

    const sum = people.reduce((t, p) => t + p.money, 0);

    if (countEl) countEl.textContent = people.length;
    if (totalEl) totalEl.textContent = formatMoney(sum);
    if (displayCountEl) displayCountEl.textContent = people.length;
    if (displayTotalEl) displayTotalEl.textContent = formatMoney(sum);

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

    setBusy(isMutating);
  }

  /* =========================================================
     LOAD / REFRESH
     ========================================================= */
  async function refreshFromSupabase(showLoading = true) {
    if (showLoading) {
      isLoading = true;
      setSyncStatus("Đang tải dữ liệu…");
      setBusy(false);
    }

    try {
      people = await fetchPeople();
      render();
      setSyncStatus(`Đã đồng bộ · ${people.length} người`);
    } catch (err) {
      console.error("Lỗi tải dữ liệu Supabase:", err);
      setSyncStatus(
        "Không tải được dữ liệu. Kiểm tra kết nối và cấu hình Supabase.",
        true
      );
      // Giữ dữ liệu cũ (nếu có) để giao diện không trắng
    } finally {
      isLoading = false;
      setBusy(isMutating);
    }
  }

  /* =========================================================
     REALTIME — LẮNG NGHE THAY ĐỔI TỪ MÁY KHÁC
     ========================================================= */
  function subscribeRealtime() {
    const channel = supabase
      .channel("people-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE },
        (payload) => {
          // Đơn giản và an toàn: tải lại danh sách mỗi khi có thay đổi
          console.debug("Realtime change:", payload.eventType);
          refreshFromSupabase(false);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.debug("Realtime đã kết nối.");
        }
      });

    return channel;
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
  async function handleSubmit(e) {
    e.preventDefault();
    if (isMutating || isLoading) return;

    const data = validateForm();
    if (!data) return;

    setBusy(true);
    setSyncStatus("Đang lưu…");

    try {
      await insertPerson(data.name, data.money);
      form.reset();
      nameInput.focus();
      await refreshFromSupabase(false);
      setSyncStatus("Đã lưu thành công.");
    } catch (err) {
      console.error("Lỗi thêm người:", err);
      setSyncStatus("Không lưu được. Vui lòng thử lại.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleClearAll() {
    if (isMutating || isLoading || people.length === 0) return;
    if (!confirm("Bạn có chắc muốn xoá toàn bộ danh sách trên Supabase?")) {
      return;
    }

    setBusy(true);
    setSyncStatus("Đang xoá…");

    try {
      await deleteAllPeople();
      await refreshFromSupabase(false);
      setSyncStatus("Đã xoá toàn bộ danh sách.");
    } catch (err) {
      console.error("Lỗi xoá dữ liệu:", err);
      setSyncStatus("Không xoá được. Vui lòng thử lại.", true);
    } finally {
      setBusy(false);
    }
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
          "Vui lòng cho phép popup hoặc mở thủ công:\n\n" +
          url.toString()
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
  if (form) form.addEventListener("submit", handleSubmit);
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
  (async function init() {
    setBusy(false);
    await refreshFromSupabase(true);
    subscribeRealtime();
  })();
})();
