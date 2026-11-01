class App {
  constructor() {
    this.currentSessionId = null;
    this.sessionData = null;
    this.currentQuestionIdx = 0;
    this.completedQuestions = new Set();

    // DOM Elements
    this.sessionSelect = document.getElementById("session-select");
    this.btnOpenCrawl = document.getElementById("btn-open-crawl");
    this.navP1 = document.getElementById("nav-p1");
    this.navP2 = document.getElementById("nav-p2");
    this.workspaceGrid = document.getElementById("workspace-grid");
    this.imageCard = document.getElementById("image-card");
    this.qImage = document.getElementById("q-image");
    this.qTitle = document.getElementById("q-title");
    this.qPartBadge = document.getElementById("q-part-badge");
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
    this.dictationEngine = new DictationEngine((qNum) => this.onQuestionCompleted(qNum));

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

      // Load completed questions from localStorage
      const savedCompleted = localStorage.getItem(`completed_${sessionId}`);
      this.completedQuestions = savedCompleted ? new Set(JSON.parse(savedCompleted)) : new Set();

      this.renderNavButtons();
      this.goToQuestion(0);
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

      if (this.completedQuestions.has(q.question_number)) {
        btn.classList.add("completed");
      }

      btn.addEventListener("click", () => this.goToQuestion(idx));

      if (q.part === 1) {
        this.navP1.appendChild(btn);
      } else {
        this.navP2.appendChild(btn);
      }
    });
  }

  goToQuestion(idx) {
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
    this.translator.setItems(q.items);

    // Load Dictation Items
    this.dictationEngine.loadQuestion(q);

    // Update Nav Buttons State
    if (this.btnPrev) this.btnPrev.disabled = (idx === 0);
    this.updateNextBtnState();

    // Auto play audio when switching question
    setTimeout(() => {
      this.audioController.play();
    }, 250);
  }

  updateNextBtnState() {
    const questions = this.sessionData.questions || [];
    const isLast = (this.currentQuestionIdx === questions.length - 1);
    const q = questions[this.currentQuestionIdx];
    const isCompleted = this.completedQuestions.has(q.question_number);

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

  onQuestionCompleted(qNum) {
    this.completedQuestions.add(qNum);
    localStorage.setItem(`completed_${this.currentSessionId}`, JSON.stringify([...this.completedQuestions]));

    // Update Nav Button
    const navBtn = document.getElementById(`nav-btn-${this.currentQuestionIdx}`);
    if (navBtn) navBtn.classList.add("completed");

    this.updateNextBtnState();

    // Play subtle audio cue or notification
    console.log(`Câu ${qNum} đã hoàn thành chính xác 100%!`);
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
