class VocabularyManager {
  constructor() {
    this.vocabList = [];
    this.filterStatus = "all"; // all | learning | mastered
    this.searchQuery = "";
    this.activeTab = "list"; // list | flashcard
    this.flashcardIdx = 0;
    this.flashcardFlipped = false;

    // DOM Elements
    this.btnOpenVocab = document.getElementById("btn-open-vocab");
    this.vocabCountBadge = document.getElementById("vocab-count");
    this.modalVocab = document.getElementById("modal-vocab");
    this.btnCloseVocab = document.getElementById("modal-vocab-close");

    // Tabs
    this.tabBtnList = document.getElementById("tab-btn-list");
    this.tabBtnFlashcard = document.getElementById("tab-btn-flashcard");
    this.viewList = document.getElementById("vocab-view-list");
    this.viewFlashcard = document.getElementById("vocab-view-flashcard");

    // List controls
    this.searchInput = document.getElementById("vocab-search");
    this.filterSelect = document.getElementById("vocab-filter");
    this.listContainer = document.getElementById("vocab-items-container");

    // Quick add form
    this.addForm = document.getElementById("vocab-quick-add-form");
    this.inputNewWord = document.getElementById("new-vocab-word");
    this.inputNewMeaning = document.getElementById("new-vocab-meaning");
    this.inputNewContext = document.getElementById("new-vocab-context");
    this.btnAutoLookup = document.getElementById("btn-auto-lookup");

    // Flashcard elements
    this.fcCard = document.getElementById("flashcard-box");
    this.fcCounter = document.getElementById("fc-counter");
    this.fcWord = document.getElementById("fc-word");
    this.fcPhonetic = document.getElementById("fc-phonetic");
    this.fcPos = document.getElementById("fc-pos");
    this.fcMeaning = document.getElementById("fc-meaning");
    this.fcContextEn = document.getElementById("fc-context-en");
    this.fcContextVi = document.getElementById("fc-context-vi");
    this.btnFcPrev = document.getElementById("btn-fc-prev");
    this.btnFcNext = document.getElementById("btn-fc-next");
    this.btnFcSpeak = document.getElementById("btn-fc-speak");
    this.btnFcMaster = document.getElementById("btn-fc-master");

    this.bindEvents();
    this.refreshVocabulary();
  }

  async refreshVocabulary() {
    try {
      const resp = await fetch("/api/vocabulary");
      if (resp.ok) {
        this.vocabList = await resp.json();
        if (this.vocabCountBadge) {
          this.vocabCountBadge.textContent = this.vocabList.length;
        }
        this.renderList();
        this.renderFlashcard();
      }
    } catch (err) {
      console.error("Lỗi tải sổ từ vựng:", err);
    }
  }

  openModal() {
    if (this.modalVocab) {
      this.modalVocab.style.display = "flex";
      this.refreshVocabulary();
    }
  }

  closeModal() {
    if (this.modalVocab) {
      this.modalVocab.style.display = "none";
    }
  }

  switchTab(tab) {
    this.activeTab = tab;
    if (tab === "list") {
      this.tabBtnList.classList.add("active");
      this.tabBtnFlashcard.classList.remove("active");
      this.viewList.style.display = "flex";
      this.viewFlashcard.style.display = "none";
      this.renderList();
    } else {
      this.tabBtnFlashcard.classList.add("active");
      this.tabBtnList.classList.remove("active");
      this.viewList.style.display = "none";
      this.viewFlashcard.style.display = "flex";
      this.flashcardIdx = 0;
      this.flashcardFlipped = false;
      this.renderFlashcard();
    }
  }

  getFilteredList() {
    return this.vocabList.filter((item) => {
      if (this.filterStatus === "learning" && item.mastered) return false;
      if (this.filterStatus === "mastered" && !item.mastered) return false;

      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        const matchWord = (item.word || "").toLowerCase().includes(q);
        const matchMeaning = (item.meaning || "").toLowerCase().includes(q);
        const matchCtx = (item.context_en || "").toLowerCase().includes(q);
        return matchWord || matchMeaning || matchCtx;
      }
      return true;
    });
  }

  speak(text) {
    if ("speechSynthesis" in window && text) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    }
  }

  renderList() {
    if (!this.listContainer) return;
    const items = this.getFilteredList();

    if (items.length === 0) {
      this.listContainer.innerHTML = `
        <div class="vocab-empty-state">
          Chưa có từ vựng nào trong danh sách này. Bạn hãy bôi đen từ mới trong lúc làm bài hoặc thêm từ ở khung phía trên nhé!
        </div>
      `;
      return;
    }

    this.listContainer.innerHTML = "";
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = `vocab-item-card ${item.mastered ? "vocab-mastered" : ""}`;

      card.innerHTML = `
        <div class="vocab-card-main">
          <div class="vocab-word-header">
            <button type="button" class="btn-tts-mini" data-speak="${this.escapeHtml(item.word)}" title="Nghe phát âm">🔊</button>
            <span class="vocab-word-text">${this.escapeHtml(item.word)}</span>
            ${item.phonetic ? `<span class="vocab-phonetic-text">${this.escapeHtml(item.phonetic)}</span>` : ""}
            ${item.part_of_speech ? `<span class="tooltip-pos-badge">${this.escapeHtml(item.part_of_speech)}</span>` : ""}
            ${item.question_number ? `<span class="vocab-q-tag">Câu ${item.question_number}</span>` : ""}
          </div>
          <div class="vocab-meaning-text">${this.escapeHtml(item.meaning)}</div>
          ${item.context_en ? `
            <div class="vocab-context-line">
              <span class="en">"${this.escapeHtml(item.context_en)}"</span>
              ${item.context_vi ? `<span class="vi"> — ${this.escapeHtml(item.context_vi)}</span>` : ""}
            </div>
          ` : ""}
        </div>
        <div class="vocab-card-actions">
          <button type="button" class="btn-vocab-status ${item.mastered ? "mastered" : ""}" data-master="${this.escapeHtml(item.word_key)}">
            ${item.mastered ? "✓ Đã thuộc" : "○ Đang học"}
          </button>
          <button type="button" class="btn-vocab-delete" data-delete="${this.escapeHtml(item.word_key)}" title="Xóa từ này">🗑</button>
        </div>
      `;

      this.listContainer.appendChild(card);
    });

    // Bind actions
    this.listContainer.querySelectorAll("[data-speak]").forEach((btn) => {
      btn.addEventListener("click", () => this.speak(btn.getAttribute("data-speak")));
    });

    this.listContainer.querySelectorAll("[data-master]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.getAttribute("data-master");
        await fetch(`/api/vocabulary/${encodeURIComponent(key)}/master`, { method: "PATCH" });
        await this.refreshVocabulary();
      });
    });

    this.listContainer.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.getAttribute("data-delete");
        await fetch(`/api/vocabulary/${encodeURIComponent(key)}`, { method: "DELETE" });
        await this.refreshVocabulary();
      });
    });
  }

  renderFlashcard() {
    const items = this.getFilteredList();
    if (!this.fcCard) return;

    if (items.length === 0) {
      this.fcCounter.textContent = "0 / 0";
      this.fcWord.textContent = "Chưa có từ vựng";
      this.fcPhonetic.textContent = "";
      this.fcPos.textContent = "";
      this.fcMeaning.textContent = "Hãy lưu từ mới khi luyện nghe để ôn tập Flashcard!";
      this.fcContextEn.textContent = "";
      this.fcContextVi.textContent = "";
      return;
    }

    if (this.flashcardIdx >= items.length) this.flashcardIdx = 0;
    if (this.flashcardIdx < 0) this.flashcardIdx = items.length - 1;

    const cur = items[this.flashcardIdx];
    this.fcCounter.textContent = `Thẻ ${this.flashcardIdx + 1} / ${items.length}`;
    this.fcWord.textContent = cur.word;
    this.fcPhonetic.textContent = cur.phonetic || "";
    this.fcPos.textContent = cur.part_of_speech || "";
    this.fcMeaning.textContent = cur.meaning || "";
    this.fcContextEn.textContent = cur.context_en ? `"${cur.context_en}"` : "";
    this.fcContextVi.textContent = cur.context_vi || "";

    if (this.btnFcMaster) {
      this.btnFcMaster.textContent = cur.mastered ? "✓ Đã thuộc" : "Đánh dấu Đã thuộc";
      this.btnFcMaster.className = `btn-ctrl ${cur.mastered ? "btn-mastered-active" : ""}`;
    }

    if (this.flashcardFlipped) {
      this.fcCard.classList.add("flipped");
    } else {
      this.fcCard.classList.remove("flipped");
    }
  }

  bindEvents() {
    if (this.btnOpenVocab) {
      this.btnOpenVocab.addEventListener("click", () => this.openModal());
    }
    if (this.btnCloseVocab) {
      this.btnCloseVocab.addEventListener("click", () => this.closeModal());
    }

    if (this.tabBtnList) {
      this.tabBtnList.addEventListener("click", () => this.switchTab("list"));
    }
    if (this.tabBtnFlashcard) {
      this.tabBtnFlashcard.addEventListener("click", () => this.switchTab("flashcard"));
    }

    if (this.searchInput) {
      this.searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.trim();
        this.renderList();
      });
    }

    if (this.filterSelect) {
      this.filterSelect.addEventListener("change", (e) => {
        this.filterStatus = e.target.value;
        this.flashcardIdx = 0;
        this.renderList();
        this.renderFlashcard();
      });
    }

    // Auto lookup button in quick add form
    if (this.btnAutoLookup) {
      this.btnAutoLookup.addEventListener("click", async () => {
        const w = this.inputNewWord.value.trim();
        if (!w) return;
        this.btnAutoLookup.textContent = "⏳...";
        try {
          const resp = await fetch(`/api/lookup-word?text=${encodeURIComponent(w)}`);
          if (resp.ok) {
            const d = await resp.json();
            this.inputNewMeaning.value = d.detailed_meaning || d.primary_meaning || "";
            this.inputNewWord.dataset.phonetic = d.phonetic || "";
            this.inputNewWord.dataset.pos = d.part_of_speech || "";
          }
        } catch (err) {}
        this.btnAutoLookup.textContent = "🔍 Tra nghĩa";
      });
    }

    // Quick add form submit
    if (this.addForm) {
      this.addForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const word = this.inputNewWord.value.trim();
        let meaning = this.inputNewMeaning.value.trim();
        const contextEn = this.inputNewContext.value.trim();

        if (!word) return;

        let phonetic = this.inputNewWord.dataset.phonetic || "";
        let pos = this.inputNewWord.dataset.pos || "";

        if (!meaning) {
          try {
            const r = await fetch(`/api/lookup-word?text=${encodeURIComponent(word)}`);
            if (r.ok) {
              const d = await r.json();
              meaning = d.detailed_meaning || d.primary_meaning || "";
              phonetic = d.phonetic || "";
              pos = d.part_of_speech || "";
            }
          } catch (err) {}
        }

        await fetch("/api/vocabulary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word,
            phonetic,
            part_of_speech: pos,
            meaning: meaning || "Chưa có nghĩa",
            context_en: contextEn,
            context_vi: ""
          })
        });

        this.inputNewWord.value = "";
        this.inputNewMeaning.value = "";
        this.inputNewContext.value = "";
        delete this.inputNewWord.dataset.phonetic;
        delete this.inputNewWord.dataset.pos;
        await this.refreshVocabulary();
      });
    }

    // Flashcard controls
    if (this.fcCard) {
      this.fcCard.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        this.flashcardFlipped = !this.flashcardFlipped;
        this.renderFlashcard();
      });
    }

    if (this.btnFcPrev) {
      this.btnFcPrev.addEventListener("click", () => {
        this.flashcardIdx--;
        this.flashcardFlipped = false;
        this.renderFlashcard();
      });
    }

    if (this.btnFcNext) {
      this.btnFcNext.addEventListener("click", () => {
        this.flashcardIdx++;
        this.flashcardFlipped = false;
        this.renderFlashcard();
      });
    }

    if (this.btnFcSpeak) {
      this.btnFcSpeak.addEventListener("click", (e) => {
        e.stopPropagation();
        const items = this.getFilteredList();
        if (items[this.flashcardIdx]) {
          this.speak(items[this.flashcardIdx].word);
        }
      });
    }

    if (this.btnFcMaster) {
      this.btnFcMaster.addEventListener("click", async (e) => {
        e.stopPropagation();
        const items = this.getFilteredList();
        const cur = items[this.flashcardIdx];
        if (cur) {
          await fetch(`/api/vocabulary/${encodeURIComponent(cur.word_key)}/master`, { method: "PATCH" });
          await this.refreshVocabulary();
        }
      });
    }
  }

  escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.vocabManager = new VocabularyManager();
});
