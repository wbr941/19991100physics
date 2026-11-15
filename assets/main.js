const root = document.documentElement;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const getCssColor = (name, fallback) =>
  getComputedStyle(root).getPropertyValue(name).trim() || fallback;

function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = root.dataset.theme === "dark" ? "#0d171b" : "#f2f0e8";
  }
}

function setupTheme() {
  const toggle = document.querySelector("[data-theme-toggle]");
  if (!toggle) return;

  const updateToggle = () => {
    const isDark = root.dataset.theme === "dark";
    toggle.setAttribute("aria-label", isDark ? "切换浅色模式" : "切换深色模式");
    toggle.setAttribute("aria-pressed", String(isDark));
  };

  updateToggle();
  syncThemeColor();

  toggle.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("physics-theme", root.dataset.theme);
    } catch {
      // Preferences remain usable when storage is unavailable.
    }
    updateToggle();
    syncThemeColor();
    window.dispatchEvent(new CustomEvent("physics:themechange"));
  });
}

function setupHeader() {
  const header = document.querySelector("[data-header]");
  const menuButton = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector("#primary-nav");
  if (!header) return;

  const updateHeader = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };

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
    if (!nav.contains(event.target) && !menuButton.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeMenu();
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

function setupFilters() {
  const buttons = [...document.querySelectorAll("[data-filter]")];
  const cards = [...document.querySelectorAll("[data-category]")];
  if (!buttons.length || !cards.length) return;

  const applyFilter = (filter) => {
    buttons.forEach((button) => {
      const isActive = button.dataset.filter === filter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    cards.forEach((card) => {
      const categories = card.dataset.category.split(/\s+/);
      const isVisible = filter === "all" || categories.includes(filter);
      card.hidden = !isVisible;
      card.classList.toggle("is-filtered", !isVisible);
    });
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => applyFilter(button.dataset.filter));
  });
}

class OrbitField {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.stars = [];
    this.pointer = { x: 0, y: 0 };
    this.start = performance.now();
    this.frameId = null;

    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    window.addEventListener("pointermove", (event) => {
      const bounds = canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      this.pointer.y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    });
    window.addEventListener("physics:themechange", () => this.draw());

    this.resize();
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = bounds.width;
    this.height = bounds.height;
    this.canvas.width = Math.round(bounds.width * this.dpr);
    this.canvas.height = Math.round(bounds.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    let seed = 19991100;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    this.stars = Array.from({ length: Math.round((this.width * this.height) / 13000) }, () => ({
      x: random() * this.width,
      y: random() * this.height,
      radius: random() * 0.9 + 0.25,
      alpha: random() * 0.36 + 0.08,
    }));

    if (prefersReducedMotion.matches) {
      this.draw(2800);
    } else if (this.frameId === null) {
      this.frameId = requestAnimationFrame(this.draw);
    }
  }

  orbitPoint(cx, cy, rx, ry, rotation, angle) {
    const cosRotation = Math.cos(rotation);
    const sinRotation = Math.sin(rotation);
    const bx = Math.cos(angle) * rx;
    const by = Math.sin(angle) * ry;
    return {
      x: cx + bx * cosRotation - by * sinRotation,
      y: cy + bx * sinRotation + by * cosRotation,
    };
  }

  draw(now = performance.now()) {
    if (!this.width || !this.height) return;
    const ctx = this.ctx;
    const time = (now - this.start) / 1000;
    const cx = this.width * 0.51 + this.pointer.x * 4;
    const cy = this.height * 0.5 + this.pointer.y * 4;
    const accent = getCssColor("--accent", "#dcff62");
    const cyan = getCssColor("--cyan", "#76d9df");
    const orange = getCssColor("--orange", "#f05d3d");
    const light = "#f1f0e8";

    ctx.clearRect(0, 0, this.width, this.height);

    this.stars.forEach((star) => {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(241, 240, 232, ${star.alpha})`;
      ctx.fill();
    });

    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.min(this.width, this.height) * 0.28);
    glow.addColorStop(0, "rgba(219, 255, 95, 0.15)");
    glow.addColorStop(0.34, "rgba(118, 217, 223, 0.04)");
    glow.addColorStop(1, "rgba(118, 217, 223, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);

    const orbits = [
      {
        rx: this.width * 0.275,
        ry: this.height * 0.205,
        rotation: -0.26,
        speed: 0.34,
        phase: 0.72,
        color: orange,
      },
      {
        rx: this.width * 0.405,
        ry: this.height * 0.32,
        rotation: 0.15,
        speed: -0.2,
        phase: -0.4,
        color: cyan,
      },
    ];

    orbits.forEach((orbit, index) => {
      ctx.beginPath();
      ctx.ellipse(cx, cy, orbit.rx, orbit.ry, orbit.rotation, 0, Math.PI * 2);
      ctx.strokeStyle = index === 0 ? "rgba(241, 240, 232, 0.18)" : "rgba(241, 240, 232, 0.12)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const angle = orbit.phase + time * orbit.speed;
      const point = this.orbitPoint(cx, cy, orbit.rx, orbit.ry, orbit.rotation, angle);
      const trailLength = index === 0 ? 24 : 34;

      ctx.lineWidth = index === 0 ? 1.8 : 1.2;
      ctx.lineCap = "round";
      for (let step = 0; step < trailLength; step += 1) {
        const segmentAngle = angle - step * 0.012 * Math.sign(orbit.speed);
        const nextAngle = angle - (step + 1) * 0.012 * Math.sign(orbit.speed);
        const from = this.orbitPoint(cx, cy, orbit.rx, orbit.ry, orbit.rotation, segmentAngle);
        const to = this.orbitPoint(cx, cy, orbit.rx, orbit.ry, orbit.rotation, nextAngle);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.globalAlpha = (1 - step / trailLength) * 0.72;
        ctx.strokeStyle = orbit.color;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (index === 0) {
        const tail = this.orbitPoint(cx, cy, orbit.rx, orbit.ry, orbit.rotation, angle - 0.12);
        const gradient = ctx.createLinearGradient(tail.x, tail.y, point.x, point.y);
        gradient.addColorStop(0, "rgba(240, 93, 61, 0)");
        gradient.addColorStop(1, "rgba(240, 93, 61, 0.35)");
        ctx.beginPath();
        ctx.ellipse(
          (tail.x + point.x) / 2,
          (tail.y + point.y) / 2,
          20,
          3,
          orbit.rotation,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(point.x, point.y, index === 0 ? 5.5 : 4.2, 0, Math.PI * 2);
      ctx.fillStyle = orbit.color;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(point.x, point.y, index === 0 ? 12 : 10, 0, Math.PI * 2);
      ctx.strokeStyle = orbit.color;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(this.width, this.height) * 0.052, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(241, 240, 232, 0.16)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const sunGlow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 54);
    sunGlow.addColorStop(0, "rgba(220, 255, 98, 0.44)");
    sunGlow.addColorStop(1, "rgba(220, 255, 98, 0)");
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, 54, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx - 4, cy - 4, 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.38)";
    ctx.fill();

    ctx.fillStyle = light;
    ctx.font = "500 10px SFMono-Regular, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText("GRAVITY", cx, cy + Math.min(this.width, this.height) * 0.13);

    if (!prefersReducedMotion.matches) {
      this.frameId = requestAnimationFrame(this.draw);
    }
  }
}

class ProjectileLab {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.speedInput = document.querySelector("#speed-range");
    this.angleInput = document.querySelector("#angle-range");
    this.speedOutput = document.querySelector("#speed-output");
    this.angleOutput = document.querySelector("#angle-output");
    this.launchButton = document.querySelector("[data-launch]");
    this.resetButton = document.querySelector("[data-reset]");
    this.stateOutput = document.querySelector("[data-sim-state]");
    this.maxHeightOutput = document.querySelector("[data-max-height]");
    this.rangeOutput = document.querySelector("[data-range]");
    this.flightTimeOutput = document.querySelector("[data-flight-time]");
    this.gravityInputs = [...document.querySelectorAll('input[name="gravity"]')];
    this.animationFrame = null;
    this.flightStart = 0;
    this.isFlying = false;
    this.progress = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.config = this.readConfig();

    this.draw = this.draw.bind(this);
    this.resize = this.resize.bind(this);
    this.launch = this.launch.bind(this);
    this.reset = this.reset.bind(this);

    this.bindEvents();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas.parentElement);
    this.updatePrediction();
  }

  bindEvents() {
    this.speedInput?.addEventListener("input", () => this.handleParameterChange());
    this.angleInput?.addEventListener("input", () => this.handleParameterChange());
    this.gravityInputs.forEach((input) => {
      input.addEventListener("change", () => this.handleParameterChange());
    });
    this.launchButton?.addEventListener("click", this.launch);
    this.resetButton?.addEventListener("click", this.reset);
    window.addEventListener("physics:themechange", this.draw);
  }

  readConfig() {
    const speed = Number(this.speedInput?.value ?? 18);
    const angle = Number(this.angleInput?.value ?? 45);
    const gravity = Number(
      this.gravityInputs.find((input) => input.checked)?.value ?? 9.81,
    );
    return { speed, angle, gravity };
  }

  calculate(config = this.config) {
    const radians = (config.angle * Math.PI) / 180;
    const vx = config.speed * Math.cos(radians);
    const vy = config.speed * Math.sin(radians);
    const flightTime = (2 * vy) / config.gravity;
    const maxHeight = (vy * vy) / (2 * config.gravity);
    const range = vx * flightTime;
    return { vx, vy, flightTime, maxHeight, range, radians };
  }

  handleParameterChange() {
    this.cancelAnimation();
    this.isFlying = false;
    this.progress = 0;
    this.config = this.readConfig();
    this.updatePrediction();
    this.setState("预测已更新");
    this.launchButton.disabled = false;
    this.draw();
  }

  updatePrediction() {
    const result = this.calculate();
    if (this.speedOutput) this.speedOutput.textContent = `${this.config.speed.toFixed(1)} m/s`;
    if (this.angleOutput) this.angleOutput.textContent = `${this.config.angle}°`;
    if (this.maxHeightOutput) this.maxHeightOutput.textContent = `${result.maxHeight.toFixed(1)} m`;
    if (this.rangeOutput) this.rangeOutput.textContent = `${result.range.toFixed(1)} m`;
    if (this.flightTimeOutput) {
      this.flightTimeOutput.textContent = `${result.flightTime.toFixed(2)} s`;
    }
  }

  setState(text) {
    if (this.stateOutput) this.stateOutput.textContent = text;
  }

  resize() {
    const bounds = this.canvas.parentElement.getBoundingClientRect();
    if (!bounds.width) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(bounds.width, 280);
    this.height = Math.max(bounds.height, 260);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.draw();
  }

  launch() {
    if (this.isFlying) return;
    this.cancelAnimation();
    this.progress = 0;
    this.isFlying = true;
    this.flightStart = performance.now();
    this.setState("飞行中");

    if (prefersReducedMotion.matches) {
      this.progress = 1;
      this.isFlying = false;
      this.setState("已落地");
      this.draw();
      return;
    }

    const animateFlight = (now) => {
      const result = this.calculate();
      const elapsed = (now - this.flightStart) / 1000;
      this.progress = Math.min(elapsed / result.flightTime, 1);
      this.draw();

      if (this.progress >= 1) {
        this.isFlying = false;
        this.setState("已落地");
        return;
      }
      this.animationFrame = requestAnimationFrame(animateFlight);
    };

    this.animationFrame = requestAnimationFrame(animateFlight);
  }

  reset() {
    this.cancelAnimation();
    this.isFlying = false;
    this.progress = 0;
    this.setState("等待发射");
    this.launchButton.disabled = false;
    this.draw();
  }

  cancelAnimation() {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  draw() {
    if (!this.width || !this.height) return;

    const ctx = this.ctx;
    const result = this.calculate();
    const margin = {
      top: 28,
      right: 22,
      bottom: 38,
      left: this.width < 440 ? 38 : 52,
    };
    const plotWidth = this.width - margin.left - margin.right;
    const plotHeight = this.height - margin.top - margin.bottom;
    const requiredWidth = Math.max(result.range * 1.1, 3);
    const requiredHeight = Math.max(result.maxHeight * 1.32, 1.5);
    const scale = Math.min(plotWidth / requiredWidth, plotHeight / requiredHeight);
    const worldWidth = plotWidth / scale;
    const worldHeight = plotHeight / scale;
    const groundY = margin.top + plotHeight;
    const originX = margin.left;

    const axisColor = getCssColor("--sim-muted", "#9eadaf");
    const gridColor = getCssColor("--sim-line", "rgba(241, 240, 232, 0.16)");
    const accent = getCssColor("--accent", "#dcff62");
    const orange = getCssColor("--orange", "#f05d3d");
    const ink = getCssColor("--sim-fg", "#f1f0e8");
    const surface = getCssColor("--sim-surface", "#182d32");

    ctx.clearRect(0, 0, this.width, this.height);

    ctx.font = "10px SFMono-Regular, Consolas, monospace";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;

    const xTickCount = this.width < 440 ? 3 : 5;
    for (let index = 0; index <= xTickCount; index += 1) {
      const ratio = index / xTickCount;
      const x = originX + plotWidth * ratio;
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, groundY);
      ctx.strokeStyle = gridColor;
      ctx.stroke();

      ctx.fillStyle = axisColor;
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(worldWidth * ratio)}`, x, groundY + 18);
    }

    const yTickCount = this.height < 300 ? 3 : 4;
    for (let index = 0; index <= yTickCount; index += 1) {
      const ratio = index / yTickCount;
      const y = groundY - plotHeight * ratio;
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(originX + plotWidth, y);
      ctx.strokeStyle = gridColor;
      ctx.stroke();

      ctx.fillStyle = axisColor;
      ctx.textAlign = "right";
      ctx.fillText(`${(worldHeight * ratio).toFixed(0)}`, originX - 10, y);
    }

    ctx.beginPath();
    ctx.moveTo(originX, margin.top - 10);
    ctx.lineTo(originX, groundY);
    ctx.lineTo(originX + plotWidth + 8, groundY);
    ctx.strokeStyle = axisColor;
    ctx.stroke();

    ctx.fillStyle = axisColor;
    ctx.textAlign = "left";
    ctx.fillText("高度 / m", originX - 2, 14);
    ctx.textAlign = "right";
    ctx.fillText("水平距离 / m", originX + plotWidth, groundY + 34);

    const pointAt = (t) => {
      const x = result.vx * t;
      const y = result.vy * t - 0.5 * this.config.gravity * t * t;
      return {
        x: originX + x * scale,
        y: groundY - Math.max(y, 0) * scale,
      };
    };

    const pathSamples = 90;
    ctx.beginPath();
    for (let index = 0; index <= pathSamples; index += 1) {
      const point = pointAt((result.flightTime * index) / pathSamples);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.setLineDash([4, 7]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(241, 240, 232, 0.3)";
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.progress > 0) {
      const activeSamples = Math.max(2, Math.round(pathSamples * this.progress));
      ctx.beginPath();
      for (let index = 0; index <= activeSamples; index += 1) {
        const ratio = (this.progress * index) / activeSamples;
        const point = pointAt(result.flightTime * ratio);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = orange;
      ctx.stroke();
    }

    const launchEndX = originX + result.vx * 0.58 * scale;
    const launchEndY = groundY - result.vy * 0.58 * scale;
    ctx.beginPath();
    ctx.moveTo(originX, groundY);
    ctx.lineTo(launchEndX, launchEndY);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(launchEndX, launchEndY, 3, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();

    const position = pointAt(result.flightTime * this.progress);
    ctx.beginPath();
    ctx.arc(position.x, position.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(240, 93, 61, 0.18)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(position.x, position.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = orange;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = surface;
    ctx.stroke();

    const peak = pointAt(result.flightTime / 2);
    if (this.progress > 0.49) {
      ctx.beginPath();
      ctx.setLineDash([3, 5]);
      ctx.moveTo(peak.x, peak.y);
      ctx.lineTo(peak.x, groundY);
      ctx.strokeStyle = "rgba(241, 240, 232, 0.34)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = ink;
      ctx.textAlign = peak.x > this.width - 110 ? "right" : "left";
      ctx.font = "10px SFMono-Regular, Consolas, monospace";
      ctx.fillText(
        `H max ${result.maxHeight.toFixed(1)} m`,
        peak.x + (peak.x > this.width - 110 ? -8 : 8),
        peak.y - 12,
      );
    }

    ctx.beginPath();
    ctx.arc(originX, groundY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = axisColor;
    ctx.fill();
  }
}

function setupInteractiveCanvases() {
  const orbitCanvas = document.querySelector("#orbit-canvas");
  if (orbitCanvas) new OrbitField(orbitCanvas);

  const projectileCanvas = document.querySelector("#projectile-canvas");
  if (projectileCanvas) new ProjectileLab(projectileCanvas);
}

setupTheme();
setupHeader();
setupReveals();
setupFilters();
setupInteractiveCanvases();

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});
