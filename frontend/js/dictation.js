class DictationEngine {
  constructor(onQuestionCompleted, onItemCompleted) {
    this.container = document.getElementById("dictation-container");
    this.items = [];
    this.itemStates = []; // { completed: false, typed: "" }
    this.onQuestionCompleted = onQuestionCompleted;
    this.onItemCompleted = onItemCompleted;

    this.bindGlobalShortcuts();
  }

  loadQuestion(questionData, completedItemIndices = []) {
    this.questionData = questionData;
    this.items = questionData.items || [];
    const doneSet = new Set(completedItemIndices || []);
    this.itemStates = this.items.map((item, idx) => {
      const isDone = doneSet.has(idx);
      return {
        completed: isDone,
        typed: isDone ? item.en : ""
      };
    });
    this.render();
  }

  getCompletedIndices() {
    const indices = [];
    this.itemStates.forEach((st, idx) => {
      if (st.completed) indices.push(idx);
    });
    return indices;
  }

  resetQuestion() {
    this.itemStates = this.items.map(() => ({ completed: false, typed: "" }));
    this.render();
  }

  normalizeForCompare(str) {
    return str
      .toLowerCase()
      .replace(/['’]/g, "'")
      .replace(/[^a-z0-9'\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  render() {
    this.container.innerHTML = "";

    this.items.forEach((item, idx) => {
      const isDone = this.itemStates[idx] && this.itemStates[idx].completed;

      const itemEl = document.createElement("div");
      itemEl.className = "dictation-item" + (isDone ? " item-completed" : "");
      itemEl.id = `dictation-item-${idx}`;

      // Header
      const header = document.createElement("div");
      header.className = "item-header";

      const label = document.createElement("div");
      label.className = "item-label";
      label.innerHTML = `<span>${item.label}</span>`;
      if (item.is_correct) {
        label.innerHTML += `<span class="correct-badge">★ Đáp án TOEIC</span>`;
      }

      const status = document.createElement("div");
      status.className = isDone ? "status-check matched" : "status-check unmatched";
      status.id = `status-${idx}`;
      status.innerHTML = isDone ? "✓ Chính xác!" : "Chưa hoàn thành";

      header.appendChild(label);
      header.appendChild(status);

      // Masked hint line
      const hintLine = document.createElement("div");
      hintLine.className = "masked-hint-line";
      hintLine.id = `hint-line-${idx}`;

      // Input row
      const inputRow = document.createElement("div");
      inputRow.className = "dictation-input-row";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "dictation-input" + (isDone ? " completed" : "");
      input.id = `input-${idx}`;
      input.placeholder = `Nghe và gõ lại ${item.label.toLowerCase()}...`;
      input.autocomplete = "off";
      input.spellcheck = false;
      if (isDone) {
        input.value = item.en;
      }

      const btnHint = document.createElement("button");
      btnHint.type = "button";
      btnHint.className = "btn-hint";
      btnHint.innerHTML = "💡 Gợi ý";
      btnHint.title = "Gợi ý thêm 1 từ/chữ (Ctrl+H)";
      btnHint.addEventListener("click", () => this.giveHint(idx));

      input.addEventListener("input", (e) => {
        this.handleInput(idx, e.target.value);
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (this.itemStates[idx].completed) {
            this.focusNext(idx);
          } else {
            // Check if exact
            this.handleInput(idx, input.value, true);
          }
        }
      });

      inputRow.appendChild(input);
      inputRow.appendChild(btnHint);

      itemEl.appendChild(header);
      itemEl.appendChild(hintLine);
      itemEl.appendChild(inputRow);

      this.container.appendChild(itemEl);

      // Initial hint render (full text if already completed, otherwise masked)
      this.renderMaskedLine(idx, isDone ? item.en : "");
    });

    // Auto-focus first incomplete input
    setTimeout(() => {
      const firstIncompleteIdx = this.itemStates.findIndex(s => !s.completed);
      const targetIdx = firstIncompleteIdx >= 0 ? firstIncompleteIdx : 0;
      const targetInput = document.getElementById(`input-${targetIdx}`);
      if (targetInput && firstIncompleteIdx >= 0) {
        targetInput.focus();
      }
    }, 100);
  }

  handleInput(idx, typedVal, isSubmit = false) {
    const item = this.items[idx];
    const target = item.en;
    const wasCompleted = this.itemStates[idx].completed;
    this.itemStates[idx].typed = typedVal;

    this.renderMaskedLine(idx, typedVal);

    // Check completion
    const normTyped = this.normalizeForCompare(typedVal);
    const normTarget = this.normalizeForCompare(target);

    const inputEl = document.getElementById(`input-${idx}`);
    const statusEl = document.getElementById(`status-${idx}`);
    const itemEl = document.getElementById(`dictation-item-${idx}`);

    if (normTyped === normTarget && normTarget.length > 0) {
      this.itemStates[idx].completed = true;
      if (inputEl) {
        inputEl.classList.add("completed");
        inputEl.value = target; // Format nicely with full punctuation
      }
      if (statusEl) {
        statusEl.className = "status-check matched";
        statusEl.innerHTML = "✓ Chính xác!";
      }
      if (itemEl) {
        itemEl.classList.add("item-completed");
      }

      // Re-render hint line as 100% correct
      this.renderMaskedLine(idx, target);

      if (!wasCompleted && this.onItemCompleted) {
        this.onItemCompleted(this.questionData.question_number, this.getCompletedIndices());
      }

      // Focus next input
      this.focusNext(idx);
      this.checkAllCompleted();
    } else {
      this.itemStates[idx].completed = false;
      if (inputEl) inputEl.classList.remove("completed");
      if (statusEl) {
        statusEl.className = "status-check unmatched";
        statusEl.textContent = "Đang điền...";
      }
      if (itemEl) itemEl.classList.remove("item-completed");

      if (wasCompleted && this.onItemCompleted) {
        this.onItemCompleted(this.questionData.question_number, this.getCompletedIndices());
      }
    }
  }

  renderMaskedLine(idx, typed) {
    const hintEl = document.getElementById(`hint-line-${idx}`);
    if (!hintEl) return;

    const target = this.items[idx].en;
    hintEl.innerHTML = "";

    let tIdx = 0;
    const cleanTyped = typed;

    for (let i = 0; i < target.length; i++) {
      const targetChar = target[i];
      const span = document.createElement("span");

      if (/\s/.test(targetChar)) {
        span.className = "char-space";
        span.innerHTML = "&nbsp;";
        if (tIdx < cleanTyped.length && /\s/.test(cleanTyped[tIdx])) {
          tIdx++;
        }
      } else if (/[.,!?;:'"()–-]/.test(targetChar)) {
        span.className = "char-punct";
        span.textContent = targetChar;
        if (tIdx < cleanTyped.length && cleanTyped[tIdx] === targetChar) {
          tIdx++;
        }
      } else {
        // Alphanumeric character
        if (tIdx < cleanTyped.length) {
          const typedChar = cleanTyped[tIdx];
          if (typedChar.toLowerCase() === targetChar.toLowerCase()) {
            span.className = "char-correct";
            span.textContent = targetChar;
          } else {
            span.className = "char-wrong";
            span.textContent = typedChar;
          }
          tIdx++;
        } else {
          // Not typed yet: show star
          span.className = "char-star";
          span.textContent = "*";
        }
      }

      hintEl.appendChild(span);
    }
  }

  giveHint(idx) {
    const item = this.items[idx];
    const target = item.en;
    const inputEl = document.getElementById(`input-${idx}`);
    if (!inputEl || this.itemStates[idx].completed) return;

    let cur = inputEl.value;
    // Find the next character in target that hasn't been matched
    if (cur.length < target.length) {
      cur += target[cur.length];
      inputEl.value = cur;
      this.handleInput(idx, cur);
      inputEl.focus();
    }
  }

  focusNext(currentIdx) {
    const nextIdx = currentIdx + 1;
    if (nextIdx < this.items.length) {
      const nextInput = document.getElementById(`input-${nextIdx}`);
      if (nextInput) {
        setTimeout(() => nextInput.focus(), 80);
      }
    }
  }

  checkAllCompleted() {
    const allDone = this.itemStates.every(s => s.completed);
    if (allDone && this.onQuestionCompleted) {
      this.onQuestionCompleted(this.questionData.question_number);
    }
  }

  bindGlobalShortcuts() {
    window.addEventListener("keydown", (e) => {
      // Ctrl+H for Hint on currently focused input
      if ((e.ctrlKey || e.altKey) && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        const active = document.activeElement;
        if (active && active.id && active.id.startsWith("input-")) {
          const idx = parseInt(active.id.replace("input-", ""), 10);
          this.giveHint(idx);
        }
      }
    });
  }
}
