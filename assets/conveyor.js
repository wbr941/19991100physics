const root = document.documentElement;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const getCssColor = (name, fallback) =>
  getComputedStyle(root).getPropertyValue(name).trim() || fallback;

function setupTheme() {
  const toggle = document.querySelector("[data-theme-toggle]");
  if (!toggle) return;

  const syncMeta = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = root.dataset.theme === "dark" ? "#0d171b" : "#f2f0e8";
  };

  const updateToggle = () => {
    const isDark = root.dataset.theme === "dark";
    toggle.setAttribute("aria-label", isDark ? "切换浅色模式" : "切换深色模式");
    toggle.setAttribute("aria-pressed", String(isDark));
  };

  updateToggle();
  syncMeta();

  toggle.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("physics-theme", root.dataset.theme);
    } catch {
      // Preferences remain usable when storage is unavailable.
    }
    updateToggle();
    syncMeta();
    window.dispatchEvent(new CustomEvent("physics:themechange"));
  });
}

function setupHeader() {
  const header = document.querySelector("[data-header]");
  const menuButton = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector("#primary-nav");
  if (!header) return;

  const updateHeader = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  if (!menuButton || !nav) return;

  const closeMenu = () => {
    nav.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "打开导航");
  };

  menuButton.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "关闭导航" : "打开导航");
  });

  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}

function setupReveals() {
  const elements = [...document.querySelectorAll(".reveal")];
  if (!elements.length) return;

  if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -5% 0px" },
  );

  elements.forEach((element) => observer.observe(element));
}

const presets = {
  rest: { band: 4, v0: 0, length: 8, mu: 0.2, mass: 2 },
  short: { band: 4, v0: 0, length: 2, mu: 0.2, mass: 2 },
  "catch-up": { band: 6, v0: 2, length: 10, mu: 0.2, mass: 2 },
  "slow-down": { band: 4, v0: 8, length: 10, mu: 0.3, mass: 2 },
  opposite: { band: 3, v0: -4, length: 12, mu: 0.3, mass: 2 },
};

class ConveyorBeltLab {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.bandInput = document.querySelector("#band-speed");
    this.objectInput = document.querySelector("#object-speed");
    this.lengthInput = document.querySelector("#belt-length");
    this.muInput = document.querySelector("#friction-factor");
    this.massInput = document.querySelector("#object-mass");
    this.bandOutput = document.querySelector("#band-speed-output");
    this.objectOutput = document.querySelector("#object-speed-output");
    this.lengthOutput = document.querySelector("#belt-length-output");
    this.muOutput = document.querySelector("#friction-factor-output");
    this.massOutput = document.querySelector("#object-mass-output");
    this.runButton = document.querySelector("[data-run]");
    this.resetButton = document.querySelector("[data-reset]");
    this.speedButtons = [...document.querySelectorAll("[data-animation-speed]")];
    this.stateOutput = document.querySelector("[data-sim-state]");
    this.presetButtons = [...document.querySelectorAll("[data-preset]")];

    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.path = [];
    this.result = null;
    this.animationFrame = null;
    this.lastFrame = 0;
    this.progress = 0;
    this.isPlaying = false;
    this.speedMode = "slow";
    this.config = this.readConfig();

    this.draw = this.draw.bind(this);
    this.resize = this.resize.bind(this);
    this.animate = this.animate.bind(this);

    this.bindEvents();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas.parentElement);
    this.recompute();
  }

  bindEvents() {
    const inputs = [
      this.bandInput,
      this.objectInput,
      this.lengthInput,
      this.muInput,
      this.massInput,
    ];

    inputs.forEach((input) => {
      input?.addEventListener("input", () => this.handleParameterChange());
    });

    this.presetButtons.forEach((button) => {
      button.addEventListener("click", () => this.applyPreset(button.dataset.preset));
    });

    this.runButton?.addEventListener("click", () => this.run());
    this.resetButton?.addEventListener("click", () => this.reset());
    this.speedButtons.forEach((button) => {
      button.addEventListener("click", () => {
        this.setAnimationSpeed(button.dataset.animationSpeed);
      });
    });
    window.addEventListener("physics:themechange", () => this.draw());
  }

  setAnimationSpeed(mode) {
    if (mode !== "slow" && mode !== "fast") return;
    this.speedMode = mode;
    this.speedButtons.forEach((button) => {
      const isActive = button.dataset.animationSpeed === mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  readConfig() {
    return {
      band: Number(this.bandInput?.value ?? 4),
      v0: Number(this.objectInput?.value ?? 0),
      length: Number(this.lengthInput?.value ?? 8),
      mu: Number(this.muInput?.value ?? 0.2),
      mass: Number(this.massInput?.value ?? 2),
      gravity: 10,
    };
  }

  applyPreset(key) {
    const preset = presets[key];
    if (!preset) return;

    this.bandInput.value = preset.band;
    this.objectInput.value = preset.v0;
    this.lengthInput.value = preset.length;
    this.muInput.value = preset.mu;
    this.massInput.value = preset.mass;
    this.handleParameterChange();

    this.presetButtons.forEach((button) => {
      const isActive = button.dataset.preset === key;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  handleParameterChange() {
    this.cancelAnimation();
    this.isPlaying = false;
    this.progress = 0;
    this.config = this.readConfig();
    this.presetButtons.forEach((button) => {
      button.classList.remove("is-active");
      button.setAttribute("aria-pressed", "false");
    });
    this.recompute();
    this.setState("参数已更新");
  }

  recompute() {
    this.updateOutputs();
    const simulation = this.simulate(this.config);
    this.result = simulation.result;
    this.path = simulation.path;
    this.renderResults();
    this.draw();
  }

  simulate(config) {
    const { band, v0, length, mu, gravity, mass } = config;
    const acceleration = mu * gravity;
    const startX = v0 < 0 ? length / 2 : 0;
    const stepDt = 0.0005;
    const recordEvery = 20;
    const maxTime = 80;

    const path = [];
    const result = {
      band,
      reachedCommon: false,
      longEnough: false,
      commonTime: null,
      commonX: null,
      exitTime: null,
      exitSide: null,
      exitSpeed: null,
      traceLength: 0,
      frictionDirection: "",
      status: "",
      needDistance: null,
      acceleration,
      heat: 0,
    };

    let x = startX;
    let v = v0;
    let t = 0;
    let trace = 0;
    let counter = 0;
    let recordedCommon = false;

    const pushPath = () => {
      path.push({ t, x, v });
    };

    const pushInitial = () => path.push({ t, x, v });

    const recordExit = (side) => {
      result.exitSide = side;
      result.exitTime = t;
      result.exitSpeed = v;
    };

    pushInitial();

    if (Math.abs(v - band) < 1e-12) {
      result.acceleration = 0;
      result.reachedCommon = true;
      result.commonTime = t;
      result.commonX = x;
      recordedCommon = true;
      result.longEnough = x >= -1e-9 && x <= length + 1e-9;
      result.needDistance = 0;
      result.frictionDirection = "无相对滑动";
      result.status = band === 0 ? "共速后静止" : "共速后匀速运动";

      if (band > 0) {
        const remaining = length - x;
        const exitDuration = remaining / band;
        const exitTime = t + exitDuration;
        const exitSamples = Math.min(Math.ceil(exitDuration / 0.01), 4000);
        for (let index = 1; index <= exitSamples; index += 1) {
          const ratio = index / exitSamples;
          path.push({ t: t + exitDuration * ratio, x: x + remaining * ratio, v: band });
        }
        t = exitTime;
        x = length;
        recordExit("right");
        result.status = "共速后从右端离开";
      }

      result.heat = mu * mass * gravity * trace;
      return { path, result };
    }

    const initialFriction =
      v < band ? "向右（动力）" : "向左（阻力）";
    result.frictionDirection = initialFriction;

    while (t < maxTime) {
      if (x < -1e-9) {
        recordExit("left");
        result.status = "从左端离开";
        break;
      }

      if (x > length + 1e-9) {
        recordExit("right");
        result.status = "从右端离开";
        break;
      }

      if (recordedCommon && Math.abs(v - band) < 1e-12) {
        if (band === 0) {
          result.status = "共速后静止";
          break;
        }
        const remaining = length - x;
        const exitDuration = remaining / band;
        const exitTime = t + exitDuration;
        const exitSamples = Math.min(Math.ceil(exitDuration / 0.01), 4000);
        for (let index = 1; index <= exitSamples; index += 1) {
          const ratio = index / exitSamples;
          path.push({ t: t + exitDuration * ratio, x: x + remaining * ratio, v: band });
        }
        t = exitTime;
        x = length;
        recordExit("right");
        result.status = "共速后从右端离开";
        break;
      }

      const a = v < band ? acceleration : -acceleration;
      const vNext = v + a * stepDt;

      if (a !== 0 && (band - v) * (band - vNext) <= 0) {
        const ratio = (band - v) / (vNext - v);
        const dtToCommon = stepDt * ratio;
        trace += (Math.abs(v - band) + 0) * 0.5 * dtToCommon;
        x += v * dtToCommon + 0.5 * a * dtToCommon * dtToCommon;
        t += dtToCommon;
        v = band;
        path.push({ t, x, v });
        result.reachedCommon = true;
        result.commonTime = t;
        result.commonX = x;
        result.longEnough = x >= -1e-9 && x <= length + 1e-9;
        result.needDistance = Math.abs(x - startX);
        result.status = band === 0 ? "共速后静止" : "共速后匀速运动";
        recordedCommon = true;
        continue;
      }

      const speedNow = Math.abs(v - band);
      const speedNext = Math.abs(vNext - band);
      trace += ((speedNow + speedNext) / 2) * stepDt;
      x += v * stepDt + 0.5 * a * stepDt * stepDt;
      v = vNext;
      t += stepDt;
      counter += 1;

      if (counter % recordEvery === 0) pushPath();
    }

    pushPath();
    result.traceLength = trace;
    result.heat = mu * mass * gravity * trace;

    if (result.reachedCommon && result.exitSide !== "right") {
      result.status = band === 0 ? "共速后静止" : "共速后匀速运动";
    } else if (!result.reachedCommon && result.exitSide === null) {
      result.status = "在带上持续运动";
    } else if (!result.reachedCommon && result.exitSide === "right") {
      result.status = "未共速，从右端离开";
    } else if (!result.reachedCommon && result.exitSide === "left") {
      result.status = "未共速，从左端离开";
    }

    return { path, result };
  }

  updateOutputs() {
    if (this.bandOutput) this.bandOutput.textContent = `${this.config.band.toFixed(1)} m/s`;
    if (this.objectOutput) {
      this.objectOutput.textContent = `${this.config.v0.toFixed(1)} m/s`;
    }
    if (this.lengthOutput) this.lengthOutput.textContent = `${this.config.length.toFixed(1)} m`;
    if (this.muOutput) this.muOutput.textContent = `${this.config.mu.toFixed(2)}`;
    if (this.massOutput) this.massOutput.textContent = `${this.config.mass.toFixed(1)} kg`;
  }

  renderResults() {
    const result = this.result;
    if (!result) return;

    this.setText("[data-result-status]", result.status);
    this.setText(
      "[data-result-long]",
      result.reachedCommon
        ? result.longEnough
          ? "足够长"
          : "不够长"
        : "未共速",
    );

    const timeText =
      result.reachedCommon && result.commonTime !== null
        ? `共速 ${result.commonTime.toFixed(2)} s`
        : result.exitTime !== null
          ? `离开 ${result.exitTime.toFixed(2)} s`
          : "—";
    this.setText("[data-result-time]", timeText);

    this.setText(
      "[data-result-leave-v]",
      result.exitSpeed !== null
        ? `${result.exitSpeed.toFixed(1)} m/s`
        : `${result.band.toFixed(1)} m/s`,
    );

    this.setText(
      "[data-result-need-s]",
      result.needDistance !== null ? `${result.needDistance.toFixed(2)} m` : "—",
    );

    this.setText("[data-result-trace]", `${result.traceLength.toFixed(2)} m`);
    this.setText("[data-result-accel]", `${result.acceleration.toFixed(2)} m/s²`);

  }

  setText(selector, text) {
    const element = document.querySelector(selector);
    if (element) element.textContent = text;
  }

  setState(text) {
    if (this.stateOutput) this.stateOutput.textContent = text;
  }

  run() {
    if (!this.path.length) return;
    this.cancelAnimation();
    this.isPlaying = true;
    this.progress = 0;
    this.lastFrame = performance.now();
    this.setState("运行中");

    if (prefersReducedMotion.matches) {
      this.progress = 1;
      this.isPlaying = false;
      this.setState("已完成");
      this.draw();
      return;
    }

    this.animationFrame = requestAnimationFrame(this.animate);
  }

  animate(now) {
    const duration = Math.max(this.path[this.path.length - 1].t, 0.01);
    const elapsed = Math.max((now - this.lastFrame) / 1000, 0);
    const speedFactor = this.speedMode === "fast" ? 1.4 : 0.5;
    this.lastFrame = now;
    this.progress = Math.min(this.progress + (elapsed * speedFactor) / duration, 1);
    this.draw();

    if (this.progress >= 1) {
      this.isPlaying = false;
      this.setState("已完成");
      return;
    }

    this.animationFrame = requestAnimationFrame(this.animate);
  }

  reset() {
    this.cancelAnimation();
    this.isPlaying = false;
    this.progress = 0;
    this.setState("等待运行");
    this.draw();
  }

  cancelAnimation() {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  resize() {
    const bounds = this.canvas.parentElement.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(bounds.width, 280);
    this.height = Math.max(bounds.height, 360);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.draw();
  }

  draw() {
    if (!this.width || !this.height || !this.path.length) return;

    const ctx = this.ctx;
    const lastIndex = this.path.length - 1;
    const index = Math.min(
      Math.max(Math.round(this.progress * lastIndex), 0),
      lastIndex,
    );
    const point = this.path[index];

    const bg = getCssColor("--surface", "#faf8f1");
    const ink = getCssColor("--ink", "#142328");
    const soft = getCssColor("--ink-soft", "#536268");
    const objectLine = getCssColor("--orange", "#f05d3d");
    const line = getCssColor("--line", "rgba(20, 35, 40, 0.16)");

    ctx.clearRect(0, 0, this.width, this.height);
    ctx.textBaseline = "middle";
    ctx.font = `${this.width < 480 ? 13 : 14}px SFMono-Regular, Consolas, monospace`;

    const beltLeft = 58;
    const beltRight = this.width - 42;
    const beltCenterY = this.height * 0.255;
    const rollerRadius = Math.min(this.height * 0.075, 32);
    const beltTop = beltCenterY - rollerRadius;
    const beltBottom = beltCenterY + rollerRadius;
    const beltScale = (beltRight - beltLeft) / this.config.length;
    const baseY = beltBottom + 50;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    // Side elevation: supporting legs and frame.
    ctx.strokeStyle = line;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(beltLeft + 8, beltCenterY);
    ctx.lineTo(beltLeft + 8, baseY);
    ctx.moveTo(beltRight - 8, beltCenterY);
    ctx.lineTo(beltRight - 8, baseY);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(beltLeft - 8, baseY);
    ctx.lineTo(beltRight + 8, baseY);
    ctx.stroke();

    // The belt loop, drawn as a side-facing capsule.
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(
      beltLeft - rollerRadius,
      beltTop,
      beltRight - beltLeft + rollerRadius * 2,
      rollerRadius * 2,
      rollerRadius,
    );
    ctx.stroke();

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(
      beltLeft - rollerRadius + 8,
      beltTop + 8,
      beltRight - beltLeft + rollerRadius * 2 - 16,
      rollerRadius * 2 - 16,
      rollerRadius - 8,
    );
    ctx.stroke();

    const dashOffset =
      (point.t * this.config.band * beltScale) % Math.max(rollerRadius * 1.6, 18);
    ctx.save();
    ctx.beginPath();
    ctx.rect(beltLeft, beltTop, beltRight - beltLeft, 4);
    ctx.clip();
    ctx.strokeStyle = soft;
    ctx.lineWidth = 2;
    for (
      let x = beltLeft - rollerRadius + dashOffset;
      x < beltRight + rollerRadius;
      x += Math.max(rollerRadius * 1.6, 18)
    ) {
      ctx.beginPath();
      ctx.moveTo(x, beltTop + 2);
      ctx.lineTo(x + 8, beltTop + 2);
      ctx.stroke();
    }
    ctx.restore();

    [beltLeft, beltRight].forEach((rollerX, rollerIndex) => {
      ctx.beginPath();
      ctx.arc(rollerX, beltCenterY, rollerRadius, 0, Math.PI * 2);
      ctx.fillStyle = getCssColor("--surface", "#faf8f1");
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rollerX, beltCenterY, 3, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();

      if (rollerIndex === 1) {
        ctx.fillStyle = soft;
        ctx.textAlign = "center";
        ctx.fillText("v带", rollerX, beltBottom + 20);
      }
    });

    const objectX =
      beltLeft + Math.max(0, Math.min(this.config.length, point.x)) * beltScale;
    const boxWidth = Math.max(30, Math.min(48, beltScale * 1.2));
    const boxHeight = Math.max(28, rollerRadius * 1.05);
    const objectY = beltTop - boxHeight - 3;

    ctx.fillStyle = getCssColor("--surface-raised", "#fffdf8");
    ctx.beginPath();
    ctx.roundRect(
      objectX - boxWidth / 2,
      objectY,
      boxWidth,
      boxHeight,
      6,
    );
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.stroke();

    const objectLabelY = objectY - 22;
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.fillText(`v物 ${point.v.toFixed(1)} m/s`, objectX, objectLabelY);

    const commonReached =
      this.result?.reachedCommon && point.t >= this.result.commonTime;
    if (!commonReached && Math.abs(point.v - this.config.band) > 0.03) {
      const frictionDirection = point.v < this.config.band ? 1 : -1;
      const arrowY = objectY + boxHeight / 2;
      const arrowStart = objectX + frictionDirection * (boxWidth / 2 + 3);
      const arrowEnd = arrowStart + frictionDirection * 30;
      ctx.beginPath();
      ctx.moveTo(arrowStart, arrowY);
      ctx.lineTo(arrowEnd, arrowY);
      ctx.lineTo(arrowEnd - frictionDirection * 7, arrowY - 5);
      ctx.moveTo(arrowEnd, arrowY);
      ctx.lineTo(arrowEnd - frictionDirection * 7, arrowY + 5);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.textAlign = "left";
      ctx.fillText("f", arrowEnd + frictionDirection * 9, arrowY);
    }

    ctx.fillStyle = soft;
    ctx.textAlign = "left";
    ctx.fillText("侧视图", beltLeft - 4, 22);
    ctx.textAlign = "center";
    ctx.fillText(`L = ${this.config.length.toFixed(1)} m`, beltLeft, baseY + 20);
    ctx.fillText(
      `x = ${Math.max(0, Math.min(this.config.length, point.x)).toFixed(1)} m`,
      objectX,
      baseY + 20,
    );

    const graphLeft = 52;
    const graphRight = this.width - 24;
    const graphTop = this.height * 0.56;
    const graphBottom = this.height * 0.9;
    const graphWidth = graphRight - graphLeft;
    const graphHeight = graphBottom - graphTop;
    const maxTime = Math.max(
      this.path[lastIndex].t,
      this.result?.commonTime ?? 0,
      this.result?.exitTime ?? 0,
      1,
    );
    const maxSpeed = Math.max(
      Math.abs(this.config.band),
      Math.abs(this.config.v0),
      1,
    );
    const timeScale = graphWidth / maxTime;
    const speedScale = (graphHeight * 0.42) / maxSpeed;
    const zeroY = graphTop + graphHeight * 0.58;

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for (let tick = 0; tick <= 4; tick += 1) {
      const ratio = tick / 4;
      const x = graphLeft + graphWidth * ratio;
      ctx.beginPath();
      ctx.moveTo(x, graphTop);
      ctx.lineTo(x, graphBottom);
      ctx.stroke();
      ctx.fillStyle = soft;
      ctx.textAlign = "center";
      ctx.fillText(`${(maxTime * ratio).toFixed(1)}s`, x, graphBottom + 16);
    }

    ctx.strokeStyle = soft;
    ctx.beginPath();
    ctx.moveTo(graphLeft, zeroY);
    ctx.lineTo(graphRight, zeroY);
    ctx.stroke();

    const bandY = zeroY - this.config.band * speedScale;
    ctx.strokeStyle = soft;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(graphLeft, bandY);
    ctx.lineTo(graphRight, bandY);
    ctx.stroke();
    ctx.fillStyle = soft;
    ctx.textAlign = "left";
    ctx.fillText(`v带 ${this.config.band.toFixed(1)}`, graphLeft + 6, bandY - 9);

    ctx.beginPath();
    for (let pathIndex = 0; pathIndex <= index; pathIndex += 1) {
      const item = this.path[pathIndex];
      const px = graphLeft + item.t * timeScale;
      const py = zeroY - item.v * speedScale;
      if (pathIndex === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = objectLine;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    if (this.result?.commonTime !== null && this.result?.commonX !== null) {
      const commonX = graphLeft + this.result.commonTime * timeScale;
      const commonY = zeroY - this.config.band * speedScale;
      ctx.beginPath();
      ctx.arc(commonX, commonY, 4, 0, Math.PI * 2);
      ctx.fillStyle = objectLine;
      ctx.fill();
      ctx.fillStyle = soft;
      ctx.textAlign = commonX > graphRight - 90 ? "right" : "left";
      ctx.fillText("共速", commonX + (commonX > graphRight - 90 ? -8 : 8), commonY - 9);
    }
  }
}

function setupInteractiveLab() {
  const canvas = document.querySelector("#conveyor-canvas");
  if (canvas) new ConveyorBeltLab(canvas);
}

setupTheme();
setupHeader();
setupReveals();
setupInteractiveLab();

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});
