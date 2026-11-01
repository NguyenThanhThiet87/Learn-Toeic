class HighlightTranslator {
  constructor() {
    this.tooltip = document.getElementById("translation-tooltip");
    this.currentItems = [];
    this.sessionContext = { session_id: "", question_number: 0 };
    this.init();
  }

  setItems(items, sessionId = "", questionNumber = 0) {
    this.currentItems = items || [];
    this.sessionContext = {
      session_id: sessionId,
      question_number: questionNumber
    };
  }

  init() {
    document.addEventListener("mouseup", (e) => {
      if (this.tooltip && this.tooltip.contains(e.target)) return;
      setTimeout(() => this.handleSelection(e), 20);
    });

    document.addEventListener("keyup", (e) => {
      if (e.key === "Shift" || e.key.startsWith("Arrow")) {
        this.handleSelection(e);
      }
    });

    document.addEventListener("mousedown", (e) => {
      if (this.tooltip && !this.tooltip.contains(e.target)) {
        this.hideTooltip();
      }
    });
  }

  async handleSelection(e) {
    const selection = window.getSelection();
    const rawText = selection.toString().trim();

    if (!rawText || rawText.length < 2) {
      return;
    }

    if (this.tooltip && this.tooltip.contains(selection.anchorNode)) {
      return;
    }

    // Clean stars or stray symbols if user highlighted the hint line partially
    const cleanSelected = rawText.replace(/\*/g, "").replace(/\s+/g, " ").trim();
    if (!cleanSelected || cleanSelected.length < 2) {
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Find context sentence in current TOEIC question
    const contextMatch = this.findContextSentence(cleanSelected);

    // Show initial loading state in tooltip
    this.renderTooltip(rect, {
      word: cleanSelected,
      phonetic: "",
      part_of_speech: "",
      meaning: "Đang tra nghĩa...",
      context_en: contextMatch ? contextMatch.en : "",
      context_vi: contextMatch ? contextMatch.vi : "",
      contextLabel: contextMatch ? contextMatch.label : "Từ vựng",
      loading: true
    });

    // Fetch exact word/phrase translation & dictionary info from backend
    try {
      const resp = await fetch(`/api/lookup-word?text=${encodeURIComponent(cleanSelected)}`);
      if (resp.ok) {
        const dictData = await resp.json();
        const wordCount = cleanSelected.split(/\s+/).length;
        // If user selected almost the entire sentence (>5 words) and we have exact TOEIC sentence translation, prefer sentence translation
        let bestMeaning = dictData.detailed_meaning || dictData.primary_meaning || "";
        if (wordCount >= 6 && contextMatch && contextMatch.vi) {
          bestMeaning = contextMatch.vi;
        }

        this.renderTooltip(rect, {
          word: cleanSelected,
          phonetic: dictData.phonetic || "",
          part_of_speech: dictData.part_of_speech || "",
          meaning: bestMeaning || (contextMatch ? contextMatch.vi : ""),
          context_en: contextMatch ? contextMatch.en : "",
          context_vi: contextMatch ? contextMatch.vi : "",
          contextLabel: contextMatch ? contextMatch.label : "Tra từ",
          loading: false
        });
      }
    } catch (err) {
      if (contextMatch) {
        this.renderTooltip(rect, {
          word: cleanSelected,
          phonetic: "",
          part_of_speech: "",
          meaning: contextMatch.vi,
          context_en: contextMatch.en,
          context_vi: contextMatch.vi,
          contextLabel: contextMatch.label,
          loading: false
        });
      }
    }
  }

  findContextSentence(text) {
    const cleanQuery = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (!cleanQuery) return null;

    let bestMatch = null;
    let highestScore = 0;

    for (const it of this.currentItems) {
      const en = (it.en || "").toLowerCase();
      if (en.includes(cleanQuery)) {
        return {
          en: it.en,
          vi: it.vi,
          label: it.label
        };
      }

      const queryWords = cleanQuery.split(/\s+/);
      const enWords = en.split(/\s+/);
      const common = queryWords.filter(w => enWords.includes(w)).length;
      const score = common / Math.max(queryWords.length, 1);

      if (score > highestScore && score >= 0.4) {
        highestScore = score;
        bestMatch = {
          en: it.en,
          vi: it.vi,
          label: it.label
        };
      }
    }

    return bestMatch || (this.currentItems[0] ? {
      en: this.currentItems[0].en,
      vi: this.currentItems[0].vi,
      label: this.currentItems[0].label
    } : null);
  }

  speakText(text) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      utter.rate = 0.95;
      window.speechSynthesis.speak(utter);
    }
  }

  renderTooltip(rect, data) {
    if (!this.tooltip) return;

    this.tooltip.innerHTML = `
      <div class="tooltip-top-row">
        <div class="tooltip-word-group">
          <button type="button" class="btn-tts-mini" id="tooltip-btn-tts" title="Nghe phát âm">🔊</button>
          <span class="tooltip-word">${this.escapeHtml(data.word)}</span>
          ${data.phonetic ? `<span class="tooltip-phonetic">${this.escapeHtml(data.phonetic)}</span>` : ""}
        </div>
        ${data.part_of_speech ? `<span class="tooltip-pos-badge">${this.escapeHtml(data.part_of_speech)}</span>` : ""}
      </div>

      <div class="tooltip-meaning-section">
        <label class="tooltip-small-label">Nghĩa Tiếng Việt (có thể sửa trước khi lưu):</label>
        <input type="text" id="tooltip-meaning-input" class="tooltip-meaning-input" value="${this.escapeHtml(data.meaning)}" ${data.loading ? "disabled" : ""}>
      </div>

      ${data.context_en ? `
        <div class="tooltip-context-box">
          <div class="tooltip-context-en">"${this.escapeHtml(data.context_en)}"</div>
          <div class="tooltip-context-vi">${this.escapeHtml(data.context_vi)}</div>
        </div>
      ` : ""}

      <div class="tooltip-actions">
        <button type="button" id="tooltip-btn-save-vocab" class="btn-save-vocab" ${data.loading ? "disabled" : ""}>
          ⭐ Lưu vào Sổ Từ Vựng
        </button>
      </div>
    `;

    const top = window.scrollY + rect.bottom + 8;
    const left = Math.max(12, Math.min(window.scrollX + rect.left, window.innerWidth - 410));

    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.display = "block";

    // Bind speaker button
    const btnTts = document.getElementById("tooltip-btn-tts");
    if (btnTts) {
      btnTts.addEventListener("click", (e) => {
        e.stopPropagation();
        this.speakText(data.word);
      });
    }

    // Bind save button
    const btnSave = document.getElementById("tooltip-btn-save-vocab");
    const meaningInput = document.getElementById("tooltip-meaning-input");
    if (btnSave) {
      btnSave.addEventListener("click", async (e) => {
        e.stopPropagation();
        const finalMeaning = meaningInput ? meaningInput.value.trim() : data.meaning;
        btnSave.disabled = true;
        btnSave.textContent = "⏳ Đang lưu...";

        try {
          const resp = await fetch("/api/vocabulary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              word: data.word,
              phonetic: data.phonetic || "",
              part_of_speech: data.part_of_speech || "",
              meaning: finalMeaning,
              context_en: data.context_en || "",
              context_vi: data.context_vi || "",
              session_id: this.sessionContext.session_id || "",
              question_number: this.sessionContext.question_number || 0
            })
          });

          if (resp.ok) {
            btnSave.textContent = "✓ Đã lưu vào Sổ Từ Vựng!";
            btnSave.classList.add("saved");
            if (window.vocabManager) {
              window.vocabManager.refreshVocabulary();
            }
          } else {
            btnSave.disabled = false;
            btnSave.textContent = "❌ Lỗi lưu từ";
          }
        } catch (err) {
          btnSave.disabled = false;
          btnSave.textContent = "❌ Lỗi kết nối";
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

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = "none";
    }
  }
}
