class HighlightTranslator {
  constructor() {
    this.tooltip = document.getElementById("translation-tooltip");
    this.currentItems = [];
    this.init();
  }

  setItems(items) {
    this.currentItems = items || [];
  }

  init() {
    document.addEventListener("mouseup", (e) => this.handleSelection(e));
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

  handleSelection(e) {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (!selectedText || selectedText.length < 2) {
      this.hideTooltip();
      return;
    }

    // Don't show if user selected inside the tooltip itself
    if (this.tooltip && this.tooltip.contains(selection.anchorNode)) {
      return;
    }

    const translation = this.findTranslation(selectedText);
    if (translation) {
      this.showTooltip(selection, translation);
    }
  }

  findTranslation(text) {
    const cleanQuery = text.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    if (!cleanQuery) return null;

    // 1. Try to find match in current question items
    let bestMatch = null;
    let highestScore = 0;

    for (const it of this.currentItems) {
      const en = (it.en || "").toLowerCase();
      const vi = it.vi || "";

      // Exact substring match
      if (en.includes(cleanQuery)) {
        return {
          source: text,
          translation: vi,
          contextLabel: it.label
        };
      }

      // Word overlap check
      const queryWords = cleanQuery.split(/\s+/);
      const enWords = en.split(/\s+/);
      const common = queryWords.filter(w => enWords.includes(w)).length;
      const score = common / queryWords.length;

      if (score > highestScore && score >= 0.5) {
        highestScore = score;
        bestMatch = {
          source: text,
          translation: vi,
          contextLabel: it.label
        };
      }
    }

    return bestMatch;
  }

  showTooltip(selection, data) {
    if (!this.tooltip) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const titleEl = this.tooltip.querySelector(".tooltip-header");
    const bodyEl = this.tooltip.querySelector(".tooltip-body");

    if (titleEl) titleEl.textContent = `Bản dịch (${data.contextLabel || "Tiếng Việt"}):`;
    if (bodyEl) bodyEl.textContent = data.translation;

    // Position above or below selection
    const top = window.scrollY + rect.bottom + 8;
    const left = Math.max(10, Math.min(window.scrollX + rect.left, window.innerWidth - 390));

    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.display = "block";
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = "none";
    }
  }
}
