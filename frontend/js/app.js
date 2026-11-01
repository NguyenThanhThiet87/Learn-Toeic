class App {
  constructor() {
    this.currentSessionId = null;
    this.sessionData = null;
    this.currentQuestionIdx = 0;
    this.completedQuestions = new Set();
    this.completedItems = {}; // { "1": [0, 1, 2, 3], "2": [0, 1] }

    // DOM Elements
    this.sessionSelect = document.getElementById("session-select");
    this.btnOpenCrawl = document.getElementById("btn-open-crawl");
    this.navP1 = document.getElementById("nav-p1");
    this.navP2 = document.getElementById("nav-p2");
    this.navProgressBadge = document.getElementById("nav-progress-badge");
    this.workspaceGrid = document.getElementById("workspace-grid");
    this.imageCard = document.getElementById("image-card");
    this.qImage = document.getElementById("q-image");
    this.qTitle = document.getElementById("q-title");
    this.qPartBadge = document.getElementById("q-part-badge");
    this.btnResetQ = document.getElementById("btn-reset-q");
    this.btnPrev = document.getElementById("btn-prev-q");
    this.btnNext = document.getElementById("btn-next-q");

    // Modal
    this.modalOverlay = document.getElementById("modal-crawl");
    this.modalClose = document.getElementById("modal-close");
    this.crawlForm = document.getElementById("crawl-form");
    this.inputCrawlUrl = document.getElementById("crawl-url");
    this.inputCrawlToken = document.getElementById("crawl-token");
    this.crawlProgress = document.getElementById("crawl-progress");
    this.progressBar = document.getElementById("progress-bar-fill");
    this.progressText = document.getElementById("progress-text");
    this.btnStartCrawl = document.getElementById("btn-start-crawl");

    // Submodules
    this.audioController = new AudioController();
    this.translator = new HighlightTranslator();
    this.dictationEngine = new DictationEngine(
      (qNum) => this.onQuestionCompleted(qNum),
      (qNum, indices) => this.onItemCompleted(qNum, indices)
    );

    this.bindEvents();
    this.init();
  }

  async init() {
    await this.loadSessionsList();
  }

  async loadSessionsList() {
    try {
      const resp = await fetch("/api/sessions");
      const sessions = await resp.json();

      this.sessionSelect.innerHTML = "";
      if (sessions.length === 0) {
        this.sessionSelect.innerHTML = "<option value=''>Chưa có đề nào (Hãy bấm Cào Đề Mới)</option>";
        this.openCrawlModal();
        return;
      }

      sessions.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.session_id;
        opt.textContent = `${s.title} (${s.total_questions} câu)`;
        this.sessionSelect.appendChild(opt);
      });

      // Load first session or saved session
      const saved = localStorage.getItem("active_toeic_session");
      const targetId = sessions.some(s => s.session_id === saved) ? saved : sessions[0].session_id;
      this.sessionSelect.value = targetId;
      await this.loadSession(targetId);
    } catch (err) {
      console.error("Lỗi tải danh sách đề:", err);
    }
  }

  async loadSession(sessionId) {
    this.currentSessionId = sessionId;
    localStorage.setItem("active_toeic_session", sessionId);

    try {
      const resp = await fetch(`/api/sessions/${sessionId}`);
      this.sessionData = await resp.json();

      // Merge progress from Server (MongoDB) + localStorage
      const serverProg = this.sessionData.progress || {};
      let localProg = {};
      try {
        const rawLocal = localStorage.getItem(`progress_${sessionId}`);
        if (rawLocal) localProg = JSON.parse(rawLocal);
      } catch (e) {}

      // Legacy completed_${sessionId} support
      let legacyCompleted = [];
      try {
        const rawLegacy = localStorage.getItem(`completed_${sessionId}`);
        if (rawLegacy) legacyCompleted = JSON.parse(rawLegacy);
      } catch (e) {}

      const mergedQuestions = new Set([
        ...(serverProg.completed_questions || []),
        ...(localProg.completed_questions || []),
        ...legacyCompleted
      ]);
      this.completedQuestions = mergedQuestions;

      const mergedItems = {};
      const sItems = serverProg.completed_items || {};
      const lItems = localProg.completed_items || {};
      const allKeys = new Set([...Object.keys(sItems), ...Object.keys(lItems)]);
      allKeys.forEach((k) => {
        const combined = new Set([...(sItems[k] || []), ...(lItems[k] || [])]);
        mergedItems[k] = [...combined].sort((a, b) => a - b);
      });

      // Ensure any question marked completed also has all its items marked completed
      const questions = this.sessionData.questions || [];
      questions.forEach((q) => {
        const qKey = String(q.question_number);
        const totalItems = (q.items || []).length;
        if (this.completedQuestions.has(q.question_number)) {
          mergedItems[qKey] = Array.from({ length: totalItems }, (_, i) => i);
        } else if (mergedItems[qKey] && mergedItems[qKey].length === totalItems && totalItems > 0) {
          this.completedQuestions.add(q.question_number);
        }
      });
      this.completedItems = mergedItems;

      this.renderNavButtons();
      this.updateProgressBadge();

      // Determine starting question index (saved last_question_idx or first incomplete)
      let startIdx = 0;
      if (typeof localProg.last_question_idx === "number") {
        startIdx = localProg.last_question_idx;
      } else if (typeof serverProg.last_question_idx === "number") {
        startIdx = serverProg.last_question_idx;
      } else {
        const firstIncomplete = questions.findIndex(q => !this.completedQuestions.has(q.question_number));
        if (firstIncomplete >= 0) startIdx = firstIncomplete;
      }
      if (startIdx < 0 || startIdx >= questions.length) startIdx = 0;

      this.goToQuestion(startIdx, false);
    } catch (err) {
      alert("Không tải được dữ liệu đề thi: " + err);
    }
  }

  renderNavButtons() {
    this.navP1.innerHTML = "";
    this.navP2.innerHTML = "";

    const questions = this.sessionData.questions || [];
    questions.forEach((q, idx) => {
      const btn = document.createElement("button");
      btn.className = "q-btn";
      btn.textContent = q.question_number;
      btn.id = `nav-btn-${idx}`;

      this.applyNavBtnState(btn, q);

      btn.addEventListener("click", () => this.goToQuestion(idx));

      if (q.part === 1) {
        this.navP1.appendChild(btn);
      } else {
        this.navP2.appendChild(btn);
      }
    });
  }

  applyNavBtnState(btn, q) {
    if (!btn || !q) return;
    const qNum = q.question_number;
    const doneItems = this.completedItems[String(qNum)] || [];
    btn.classList.remove("completed", "partial");
    if (this.completedQuestions.has(qNum)) {
      btn.classList.add("completed");
    } else if (doneItems.length > 0) {
      btn.classList.add("partial");
    }
  }

  updateProgressBadge() {
    if (!this.navProgressBadge || !this.sessionData) return;
    const total = (this.sessionData.questions || []).length || 31;
    const done = this.completedQuestions.size;
    this.navProgressBadge.textContent = `Đã hoàn thành: ${done} / ${total} câu`;
  }

  async syncProgress() {
    if (!this.currentSessionId) return;
    const payload = {
      completed_questions: [...this.completedQuestions].sort((a, b) => a - b),
      completed_items: this.completedItems,
      last_question_idx: this.currentQuestionIdx
    };

    localStorage.setItem(`progress_${this.currentSessionId}`, JSON.stringify(payload));
    localStorage.setItem(`completed_${this.currentSessionId}`, JSON.stringify(payload.completed_questions));

    try {
      await fetch(`/api/sessions/${this.currentSessionId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn("Không thể đồng bộ tiến độ lên server, đã lưu tại localStorage:", err);
    }
  }

  goToQuestion(idx, autoPlay = true) {
    const questions = this.sessionData.questions || [];
    if (idx < 0 || idx >= questions.length) return;

    this.currentQuestionIdx = idx;
    const q = questions[idx];

    // Update active nav button
    document.querySelectorAll(".q-btn").forEach(b => b.classList.remove("active"));
    const curBtn = document.getElementById(`nav-btn-${idx}`);
    if (curBtn) {
      curBtn.classList.add("active");
      curBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }

    // Update Title & Badge
    if (this.qTitle) this.qTitle.textContent = q.title;
    if (this.qPartBadge) {
      this.qPartBadge.textContent = q.part === 1 ? "Part 1 (Mô tả hình ảnh)" : "Part 2 (Hỏi - Đáp)";
    }

    // Update Image (Part 1 vs Part 2)
    if (q.part === 1 && q.image_file) {
      this.workspaceGrid.classList.add("with-image");
      this.imageCard.style.display = "flex";
      this.qImage.src = q.image_file;
    } else {
      this.workspaceGrid.classList.remove("with-image");
      this.imageCard.style.display = "none";
    }

    // Load Audio
    this.audioController.load(q.audio_file);

    // Update Translator context
    this.translator.setItems(q.items, this.currentSessionId, q.question_number);

    // Load Dictation Items with saved completed item indices
    const qKey = String(q.question_number);
    const savedItemIndices = this.completedItems[qKey] || (
      this.completedQuestions.has(q.question_number)
        ? (q.items || []).map((_, i) => i)
        : []
    );
    this.dictationEngine.loadQuestion(q, savedItemIndices);

    // Update Nav Buttons State
    if (this.btnPrev) this.btnPrev.disabled = (idx === 0);
    this.updateNextBtnState();

    // Save current question index
    this.syncProgress();

    // Auto play audio when switching question
    if (autoPlay) {
      setTimeout(() => {
        this.audioController.play();
      }, 250);
    }
  }

  updateNextBtnState() {
    const questions = this.sessionData.questions || [];
    const isLast = (this.currentQuestionIdx === questions.length - 1);
    const q = questions[this.currentQuestionIdx];
    const isCompleted = q ? this.completedQuestions.has(q.question_number) : false;

    if (this.btnNext) {
      if (isLast) {
        this.btnNext.innerHTML = "🎉 Đã Hoàn Thành Hết";
        this.btnNext.disabled = true;
        this.btnNext.classList.remove("btn-next-active");
      } else {
        this.btnNext.innerHTML = "Câu Tiếp Theo (Ctrl+Enter) →";
        this.btnNext.disabled = false;
        if (isCompleted) {
          this.btnNext.classList.add("btn-next-active");
        } else {
          this.btnNext.classList.remove("btn-next-active");
        }
      }
    }
  }

  onItemCompleted(qNum, completedIndices) {
    const qKey = String(qNum);
    this.completedItems[qKey] = completedIndices;

    const questions = this.sessionData.questions || [];
    const q = questions[this.currentQuestionIdx];
    if (q && q.question_number === qNum) {
      const totalItems = (q.items || []).length;
      if (completedIndices.length < totalItems) {
        this.completedQuestions.delete(qNum);
      }
      const navBtn = document.getElementById(`nav-btn-${this.currentQuestionIdx}`);
      this.applyNavBtnState(navBtn, q);
    }

    this.updateProgressBadge();
    this.updateNextBtnState();
    this.syncProgress();
  }

  onQuestionCompleted(qNum) {
    this.completedQuestions.add(qNum);
    const questions = this.sessionData.questions || [];
    const q = questions[this.currentQuestionIdx];
    if (q && q.question_number === qNum) {
      this.completedItems[String(qNum)] = (q.items || []).map((_, i) => i);
      const navBtn = document.getElementById(`nav-btn-${this.currentQuestionIdx}`);
      this.applyNavBtnState(navBtn, q);
    }

    this.updateProgressBadge();
    this.updateNextBtnState();
    this.syncProgress();

    console.log(`Câu ${qNum} đã hoàn thành chính xác 100%!`);
  }

  resetCurrentQuestion() {
    const questions = this.sessionData ? (this.sessionData.questions || []) : [];
    const q = questions[this.currentQuestionIdx];
    if (!q) return;

    const qNum = q.question_number;
    this.completedQuestions.delete(qNum);
    delete this.completedItems[String(qNum)];

    this.dictationEngine.resetQuestion();

    const navBtn = document.getElementById(`nav-btn-${this.currentQuestionIdx}`);
    this.applyNavBtnState(navBtn, q);
    this.updateProgressBadge();
    this.updateNextBtnState();
    this.syncProgress();
  }

  nextQuestion() {
    const questions = this.sessionData.questions || [];
    if (this.currentQuestionIdx < questions.length - 1) {
      this.goToQuestion(this.currentQuestionIdx + 1);
    }
  }

  prevQuestion() {
    if (this.currentQuestionIdx > 0) {
      this.goToQuestion(this.currentQuestionIdx - 1);
    }
  }

  openCrawlModal() {
    if (this.modalOverlay) {
      this.modalOverlay.style.display = "flex";
      this.inputCrawlUrl.focus();
    }
  }

  closeCrawlModal() {
    if (this.modalOverlay) {
      this.modalOverlay.style.display = "none";
      this.crawlProgress.style.display = "none";
      this.progressBar.style.width = "0%";
      this.btnStartCrawl.disabled = false;
    }
  }

  async handleCrawlSubmit(e) {
    e.preventDefault();
    const url = this.inputCrawlUrl.value.trim();
    const token = this.inputCrawlToken.value.trim();

    if (!url) {
      alert("Vui lòng dán link bài thi Parroto!");
      return;
    }

    this.btnStartCrawl.disabled = true;
    this.crawlProgress.style.display = "flex";
    this.progressBar.style.width = "10%";
    this.progressText.textContent = "Đang kết nối Parroto và xác thực...";

    // Poll status interval
    const pollInterval = setInterval(async () => {
      try {
        const sResp = await fetch("/api/crawl-status");
        const s = await sResp.json();
        if (s.percentage) {
          this.progressBar.style.width = `${s.percentage}%`;
        }
        if (s.message) {
          this.progressText.textContent = s.message;
        }
      } catch (err) {}
    }, 800);

    try {
      const resp = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, token: token || null })
      });

      clearInterval(pollInterval);
      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.detail || "Không thể cào bài thi");
      }

      this.progressBar.style.width = "100%";
      this.progressText.textContent = "Cào dữ liệu thành công! Đang nạp bài tập...";

      setTimeout(async () => {
        this.closeCrawlModal();
        await this.loadSessionsList();
        this.sessionSelect.value = data.session_id;
        await this.loadSession(data.session_id);
      }, 800);

    } catch (err) {
      clearInterval(pollInterval);
      this.btnStartCrawl.disabled = false;
      this.progressText.textContent = "Lỗi: " + err.message;
      this.progressText.style.color = "var(--accent-red)";
    }
  }

  bindEvents() {
    this.sessionSelect.addEventListener("change", (e) => {
      if (e.target.value) {
        this.loadSession(e.target.value);
      }
    });

    this.btnOpenCrawl.addEventListener("click", () => this.openCrawlModal());
    this.modalClose.addEventListener("click", () => this.closeCrawlModal());
    this.crawlForm.addEventListener("submit", (e) => this.handleCrawlSubmit(e));

    this.btnPrev.addEventListener("click", () => this.prevQuestion());
    this.btnNext.addEventListener("click", () => this.nextQuestion());
    if (this.btnResetQ) {
      this.btnResetQ.addEventListener("click", () => this.resetCurrentQuestion());
    }

    // Global shortcut Ctrl+Enter for Next Question
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.altKey) && e.key === "Enter") {
        e.preventDefault();
        this.nextQuestion();
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
});
