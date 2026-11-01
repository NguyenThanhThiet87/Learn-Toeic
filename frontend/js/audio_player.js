class AudioController {
  constructor() {
    this.audio = new Audio();
    this.isPlaying = false;
    this.onEnded = null;

    // DOM Elements
    this.btnPlay = document.getElementById("btn-play");
    this.btnRewind = document.getElementById("btn-rewind");
    this.btnForward = document.getElementById("btn-forward");
    this.btnReplay = document.getElementById("btn-replay");
    this.seeker = document.getElementById("audio-seeker");
    this.timeDisplay = document.getElementById("time-display");
    this.speedSelect = document.getElementById("speed-select");

    this.bindEvents();
    this.bindKeyboardShortcuts();
  }

  load(audioUrl) {
    this.audio.src = audioUrl;
    this.audio.playbackRate = parseFloat(this.speedSelect ? this.speedSelect.value : 1.0);
    this.audio.load();
    this.audio.currentTime = 0;
    this.updatePlayBtn(false);
    this.updateTimeDisplay();
  }

  play() {
    this.audio.play().then(() => {
      this.updatePlayBtn(true);
    }).catch(err => console.log("Audio play err:", err));
  }

  pause() {
    this.audio.pause();
    this.updatePlayBtn(false);
  }

  togglePlay() {
    if (this.audio.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  rewind(seconds = 2) {
    this.audio.currentTime = Math.max(0, this.audio.currentTime - seconds);
    this.updateTimeDisplay();
  }

  forward(seconds = 2) {
    if (this.audio.duration) {
      this.audio.currentTime = Math.min(this.audio.duration, this.audio.currentTime + seconds);
      this.updateTimeDisplay();
    }
  }

  replay() {
    this.audio.currentTime = 0;
    this.play();
  }

  setSpeed(rate) {
    this.audio.playbackRate = rate;
  }

  updatePlayBtn(playing) {
    this.isPlaying = playing;
    if (this.btnPlay) {
      this.btnPlay.innerHTML = playing ? "⏸ Tạm dừng" : "▶ Phát";
      if (playing) {
        this.btnPlay.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
      } else {
        this.btnPlay.style.background = "linear-gradient(135deg, #0284c7, #0ea5e9)";
      }
    }
  }

  updateTimeDisplay() {
    if (!this.timeDisplay) return;
    const cur = this.formatTime(this.audio.currentTime);
    const dur = this.formatTime(this.audio.duration || 0);
    this.timeDisplay.textContent = `${cur} / ${dur}`;

    if (this.seeker && this.audio.duration) {
      this.seeker.value = (this.audio.currentTime / this.audio.duration) * 100;
    }
  }

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  bindEvents() {
    if (this.btnPlay) this.btnPlay.addEventListener("click", () => this.togglePlay());
    if (this.btnRewind) this.btnRewind.addEventListener("click", () => this.rewind(2));
    if (this.btnForward) this.btnForward.addEventListener("click", () => this.forward(2));
    if (this.btnReplay) this.btnReplay.addEventListener("click", () => this.replay());

    if (this.speedSelect) {
      this.speedSelect.addEventListener("change", (e) => {
        this.setSpeed(parseFloat(e.target.value));
      });
    }

    if (this.seeker) {
      this.seeker.addEventListener("input", (e) => {
        if (this.audio.duration) {
          this.audio.currentTime = (e.target.value / 100) * this.audio.duration;
          this.updateTimeDisplay();
        }
      });
    }

    this.audio.addEventListener("timeupdate", () => this.updateTimeDisplay());
    this.audio.addEventListener("ended", () => {
      this.updatePlayBtn(false);
      if (this.onEnded) this.onEnded();
    });
  }

  bindKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      // Replay audio: Ctrl + R or Alt + R
      if ((e.ctrlKey || e.altKey) && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        this.replay();
        return;
      }

      // Play/Pause: Ctrl + Space or Alt + Space
      if ((e.ctrlKey || e.altKey) && e.code === "Space") {
        e.preventDefault();
        this.togglePlay();
        return;
      }

      // Rewind 2s: Ctrl + Left or Alt + Left
      if ((e.ctrlKey || e.altKey) && e.key === "ArrowLeft") {
        e.preventDefault();
        this.rewind(2);
        return;
      }

      // Forward 2s: Ctrl + Right or Alt + Right
      if ((e.ctrlKey || e.altKey) && e.key === "ArrowRight") {
        e.preventDefault();
        this.forward(2);
        return;
      }
    });
  }
}
