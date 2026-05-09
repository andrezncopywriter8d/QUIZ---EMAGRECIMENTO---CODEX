const STORAGE_KEY = "banana_bariatrica_answers";

const state = {
  data: null,
  currentStepId: "",
  answers: JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
  selected: new Set(),
  isTransitioning: false,
  carouselTimer: null,
  lastTrackedStepId: "",
  preloadedAssets: new Set(),
  preloadQueue: [],
  isPreloading: false,
};

const app = document.getElementById("quiz-app");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  if (window.QUIZ_DATA) {
    state.data = window.QUIZ_DATA;
  } else {
    const response = await fetch("quiz-data.json");
    state.data = await response.json();
  }
  const requestedStep = new URLSearchParams(window.location.search).get("step");
  const matchingStep = state.data.quiz.steps.find((step) => step.id === requestedStep || step.slug === requestedStep);
  state.currentStepId = matchingStep ? matchingStep.id : state.data.quiz.steps[0].id;
  applyTheme(state.data.quiz.theme);
  warmInitialAssets();
  window.quizTracker?.init?.();
  registerServiceWorker();
  render();
}

function applyTheme(theme) {
  document.documentElement.style.setProperty("--primary-color", theme.primaryColor);
  document.documentElement.style.setProperty("--secondary-color", theme.secondaryColor);
  document.documentElement.style.setProperty("--background-color", theme.backgroundColor);
  document.documentElement.style.setProperty("--text-color", theme.textColor);
  document.documentElement.style.setProperty("--muted-text-color", theme.mutedTextColor);
  document.documentElement.style.setProperty("--font-family", theme.fontFamily);
}

function getStep(id = state.currentStepId) {
  return state.data.quiz.steps.find((step) => step.id === id);
}

function render() {
  const step = getStep();
  state.selected = new Set();
  if (state.carouselTimer) {
    window.clearInterval(state.carouselTimer);
    state.carouselTimer = null;
  }
  app.classList.remove("is-leaving");

  if (step.type === "redirect") {
    redirectTo(step.redirectUrl || state.data.quiz.settings.redirectUrl);
    return;
  }

  app.innerHTML = "";
  app.className = `quiz-shell step-${step.type}`;
  preloadStepAssets(step, true);
  preloadNextSteps(step, 5);

  step.elements.forEach((element) => {
    app.appendChild(renderElement(element, step));
  });

  if (state.lastTrackedStepId !== step.id) {
    state.lastTrackedStepId = step.id;
    window.quizTracker?.trackStepView?.(step, getStepIndex(step.id));
    window.quizUtmify?.trackStepView?.(step, getStepIndex(step.id));
  }

  if (step.type === "loading") {
    window.setTimeout(() => goNext(step), step.loadingDelay || 5200);
  }
}

function renderElement(element, step) {
  const node = document.createElement("section");
  node.className = `block block-${element.type}`;

  if (element.type === "header") {
    node.className = "header";
    const logo = state.data.quiz.theme.logo || element.logo;
    node.innerHTML = `<img src="${logo}" alt="Banana Bariátrica" style="width:${Math.min(element.logoSize || 70, 70)}px" />`;
    return node;
  }

  if (element.type === "progress") {
    return state.data.quiz.settings.showProgressBar ? renderProgress(step.progress) : document.createDocumentFragment();
  }

  if (element.type === "title") {
    let title = replaceVars(element.title);
    if (title.includes("9KG a 15KG")) {
      title = title.replace("9KG a 15KG em 3 semanas", '<span class="highlight-red">9KG a 15KG em 3 semanas</span>');
    }
    node.innerHTML = `
      <h1>${title}</h1>
      ${element.subtitle ? `<p class="subtitle">${replaceVars(element.subtitle)}</p>` : ""}
    `;
    return node;
  }

  if (element.type === "text") {
    if (!element.text || element.text === "[object Object]") return document.createDocumentFragment();
    if (element.text.includes("FAÇA A AVALIAÇÃO")) node.classList.add("intro-red-copy");
    if (element.text.includes("ESSA RECEITA SECRETA")) node.classList.add("intro-warning-copy");
    node.innerHTML = `<div class="text-copy">${replaceVars(element.text)}</div>`;
    return node;
  }

  if (element.type === "image") {
    node.innerHTML = `<img class="main-image" src="${element.src}" alt="" loading="eager" decoding="async" fetchpriority="high" />`;
    return node;
  }

  if (element.type === "button") {
    if (step.type === "measure") return document.createDocumentFragment();
    const button = document.createElement("button");
    button.className = `primary-button ${element.animation === "pulse" ? "pulse" : ""}`;
    button.type = "button";
    button.textContent = replaceVars(element.text);
    if (isCheckoutButton(element, step)) {
      button.classList.add("go-to-checkout");
      button.dataset.utmifyEvent = "InitiateCheckout";
    }
    button.addEventListener("click", () => {
      if (isCheckoutButton(element, step)) {
        window.quizUtmify?.trackInitiateCheckout?.(step, getRedirectUrlForStep(step));
      }
      goNext(step);
    });
    node.appendChild(button);
    return node;
  }

  if (element.type === "options") {
    node.classList.add(element.columns === "grid-cols-2" ? "options-grid-2" : "options-grid-1");
    if (element.multiple) node.classList.add("options-multiple");
    element.options.forEach((option) => node.appendChild(renderOption(option, element, step)));
    return node;
  }

  if (element.type === "form") {
    const form = document.createElement("form");
    form.className = "form-card";
    element.fields.forEach((field) => {
      const input = document.createElement("input");
      input.name = field.name;
      input.placeholder = field.placeholder;
      input.required = field.required;
      input.autocomplete = field.name.includes("email") ? "email" : "on";
      input.inputMode = field.name.includes("whatsapp") ? "tel" : "text";
      form.appendChild(input);
    });
    const button = document.createElement("button");
    button.className = "primary-button";
    button.textContent = element.buttonText;
    form.appendChild(button);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      saveAnswer(step.id, values);
      goNext(step);
    });
    node.appendChild(form);
    return node;
  }

  if (element.type === "weight" || element.type === "height") {
    node.appendChild(renderMeasure(element, step));
    return node;
  }

  if (element.type === "note") {
    node.innerHTML = `<div class="note"><strong>${replaceVars(element.title)}</strong>${element.text ? `<p>${replaceVars(element.text)}</p>` : ""}</div>`;
    return node;
  }

  if (element.type === "loading") {
    node.innerHTML = `
      <div class="loading-panel">
        <div class="loading-steps">
          <span>Validando respostas</span>
          <span>Calculando perfil</span>
          <span>Personalizando receita</span>
        </div>
        <div class="loading-progress" aria-hidden="true"><span></span></div>
        <p class="loading-text"></p>
      </div>
    `;
    return node;
  }

  if (element.type === "bodyMap") {
    node.appendChild(renderBodyMap(element));
    return node;
  }

  if (element.type === "video") {
    node.innerHTML = `
      <div class="vturb-video-box">
        <vturb-smartplayer id="vid-69fe75c3f70f7722cd1d508d" style="display: block; margin: 0 auto; width: 100%; max-width: 400px;"></vturb-smartplayer>
      </div>
    `;
    loadVturbPlayer();
    return node;
  }

  if (element.type === "audio") {
    node.innerHTML = `
      <div class="audio-card xquiz-audio">
        <div class="audio-label">Áudio</div>
        <button class="audio-play" type="button" aria-label="Reproduzir áudio">▶</button>
        <div class="audio-wave" aria-hidden="true">${Array.from({ length: 34 }, (_, index) => `<span style="height:${8 + Math.abs(Math.sin(index * 0.85)) * 21}px"></span>`).join("")}<b></b></div>
        ${element.image ? `<img src="${element.image}" alt="Nutri Amanda" loading="eager" decoding="async" fetchpriority="high" />` : ""}
        <audio preload="auto" src="assets/nutri-amanda.mp3"></audio>
      </div>
    `;
    setupAudioPlayer(node.querySelector(".xquiz-audio"));
    return node;
  }

  if (element.type === "testimony") {
    node.innerHTML = `
      <article class="testimony">
        <header class="testimony-header">
          ${element.image ? `<img src="${element.image}" alt="" loading="eager" decoding="async" />` : ""}
          <div><strong>${escapeHtml(element.name || "Fernanda")}</strong><span>${escapeHtml(element.location || "Porto Alegre, RS")}</span></div>
        </header>
        <p>${replaceVars(element.text)}</p>
        <div class="stars" aria-label="5 estrelas">★★★★★</div>
      </article>
    `;
    return node;
  }

  if (element.type === "carousel") {
    node.className = "carousel-block";
    const track = document.createElement("div");
    track.className = "carousel";
    element.items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "carousel-card";
      card.innerHTML = `${item.image ? `<img src="${item.image}" alt="${item.title}" loading="eager" decoding="async" fetchpriority="high" />` : ""}`;
      track.appendChild(card);
    });
    const prev = document.createElement("button");
    const next = document.createElement("button");
    prev.type = "button";
    next.type = "button";
    prev.className = "carousel-nav carousel-prev";
    next.className = "carousel-nav carousel-next";
    prev.textContent = "‹";
    next.textContent = "›";
    prev.setAttribute("aria-label", "Anterior");
    next.setAttribute("aria-label", "Próximo");
    const dots = document.createElement("div");
    dots.className = "carousel-dots";
    element.items.forEach((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Slide ${index + 1}`);
      dot.addEventListener("click", () => track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" }));
      dots.appendChild(dot);
    });
    const update = () => {
      const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      [...dots.children].forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === index));
      prev.classList.toggle("hidden", index === 0);
      next.classList.toggle("hidden", index >= element.items.length - 1);
    };
    prev.addEventListener("click", () => track.scrollBy({ left: -track.clientWidth, behavior: "smooth" }));
    next.addEventListener("click", () => track.scrollBy({ left: track.clientWidth, behavior: "smooth" }));
    track.addEventListener("scroll", () => window.requestAnimationFrame(update));
    node.append(track, prev, next, dots);
    window.setTimeout(update, 0);
    if (element.items.length > 1) {
      state.carouselTimer = window.setInterval(() => {
        const currentIndex = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        const nextIndex = (currentIndex + 1) % element.items.length;
        track.scrollTo({ left: nextIndex * track.clientWidth, behavior: "smooth" });
      }, 5000);
    }
    return node;
  }

  if (element.type === "report" || element.type === "resultBox") {
    if (element.type === "report") node.classList.add("block-report-card");
    if (element.type === "resultBox") node.classList.add("block-imc-title");
    if (element.type === "resultBox" && element.title.includes("IMC")) {
      node.innerHTML = `
        <div class="risk-card">
          <strong>Índice de massa corporal (IMC)</strong>
          <div class="risk-scale">
            <span class="risk-pill">Acima do peso ideal<br><small>⚠️ você está aqui!</small></span>
            <i></i>
            <div class="risk-labels"><span>Saudável</span><span>Acima do peso</span><span>Sobrepeso</span></div>
          </div>
        </div>
      `;
      return node;
    }
    if (element.type === "report") {
      node.innerHTML = `
        <div class="imc-grid">
          <div class="imc-gauge-card">
            <strong>Índice de massa corporal: Muito alto!</strong>
            <div class="imc-gauge"><span>87%</span></div>
          </div>
          <div class="imc-side-card"><strong>Sobrepeso</strong></div>
          <div class="imc-photo-card">${element.image ? `<img src="${element.image}" alt="" />` : ""}</div>
        </div>
      `;
      return node;
    }
    node.innerHTML = `<div class="result-box">${element.image ? `<img src="${element.image}" alt="" />` : ""}<strong>${replaceVars(element.title)}</strong>${element.text ? `<p>${replaceVars(element.text)}</p>` : ""}</div>`;
    return node;
  }

  if (element.type === "chart") {
    node.className = "chart";
    const labels = element.items.length ? element.items : [{ label: "1 Semana" }, { label: "2 Semanas" }, { label: "3 Semanas" }];
    labels.forEach((item, index) => {
      const bar = document.createElement("div");
      const kilos = ["-4.2kg", "-8.6kg", "-15kg"][index] || "";
      const days = ["7 dias", "14 dias", "21 dias"][index] || "";
      bar.innerHTML = `<span>${item.label}</span><em><b style="height:${38 + index * 24}px"><i>${kilos.replace("-", "")}</i></b></em><small>${kilos}</small><small>${days}</small>`;
      node.appendChild(bar);
    });
    return node;
  }

  if (element.type === "transform") {
    node.innerHTML = `<div class="check-list"><p>✓ Plano personalizado</p><p>✓ Receita adaptada ao seu corpo</p><p>✓ Acesso imediato</p></div>`;
    return node;
  }

  return node;
}

function renderProgress(progress) {
  const wrap = document.createElement("div");
  wrap.className = "progress-wrap";
  wrap.innerHTML = `<div class="progress-bar"><span style="width:${progress}%"></span></div>`;
  return wrap;
}

function renderOption(option, group, step) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `option-card ${group.model === "text-image" ? "option-image" : ""}`;
  const imageModels = ["text-image", "image-only"];
  const emojiModels = ["text-emoji"];
  const shouldShowImage = Boolean(option.image && imageModels.includes(group.model));
  const shouldShowEmoji = Boolean(option.emoji && emojiModels.includes(group.model));
  if (shouldShowImage) button.classList.add("option-image");
  if (group.model === "image-only") button.classList.add("option-image-only");
  if (group.model === "text-emoji") button.classList.add("option-emoji");
  if (group.multiple) button.classList.add("option-multiple");
  button.innerHTML = `
    ${shouldShowImage ? `<img src="${option.image}" alt="" loading="eager" decoding="async" fetchpriority="high" />` : ""}
    ${shouldShowEmoji ? `<span class="emoji">${option.emoji}</span>` : ""}
    ${group.model === "image-only" ? "" : `<span>${replaceVars(option.label)}</span>`}
  `;
  button.addEventListener("click", () => {
    const waitsForContinue = step.button.visible;
    if (group.multiple || waitsForContinue) {
      button.classList.toggle("selected");
      state.selected.has(option.id) ? state.selected.delete(option.id) : state.selected.add(option.id);
      saveAnswer(step.id, [...state.selected]);
      return;
    }
    saveAnswer(step.id, option.value);
    document.querySelectorAll(".option-card.selected").forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    if (step.button.visible) return;
    window.setTimeout(() => goTo(option.nextStep || step.nextStep), 180);
  });
  if (option.nextStep) {
    button.addEventListener("pointerenter", () => preloadNextSteps(getStep(option.nextStep), 3), { passive: true });
    button.addEventListener("touchstart", () => preloadNextSteps(getStep(option.nextStep), 3), { passive: true });
  }
  return button;
}

function renderMeasure(element, step) {
  const wrap = document.createElement("form");
  const isHeight = element.type === "height";
  const config = isHeight
    ? { min: 100, max: 250, initial: 150, unit: "cm", altUnit: "pol", helper: "Arraste para selecionar a sua altura" }
    : { min: 50, max: 250, initial: 75, unit: "kg", altUnit: "lb", helper: "Arraste para selecionar o seu peso" };
  let current = config.initial;

  wrap.className = "measure-card ruler-card";
  wrap.innerHTML = `
    <div class="unit-toggle" aria-hidden="true">
      <span class="active">${config.unit}</span>
      <span>${config.altUnit}</span>
    </div>
    <div class="measure-value"><strong>${current}</strong><span>${config.unit}</span></div>
    <div class="ruler-shell">
      <div class="ruler-viewport" role="slider" tabindex="0" aria-valuemin="${config.min}" aria-valuemax="${config.max}" aria-valuenow="${current}">
        <div class="ruler-track"></div>
      </div>
      <div class="ruler-pointer"></div>
    </div>
    <p class="ruler-helper">${config.helper}</p>
  `;

  const valueStrong = wrap.querySelector(".measure-value strong");
  const viewport = wrap.querySelector(".ruler-viewport");
  const shell = wrap.querySelector(".ruler-shell");
  const track = wrap.querySelector(".ruler-track");
  const stepPx = 9;
  const sidePadding = 170;

  for (let tick = config.min; tick <= config.max; tick += 1) {
    const mark = document.createElement("span");
    mark.className = tick % 10 === 0 ? "major" : tick % 5 === 0 ? "medium" : "";
    mark.style.left = `${sidePadding + (tick - config.min) * stepPx}px`;
    if (tick % 10 === 0) mark.dataset.label = tick;
    track.appendChild(mark);
  }

  track.style.width = `${sidePadding * 2 + (config.max - config.min) * stepPx}px`;

  const setValue = (nextValue, behavior = "auto") => {
    current = Math.max(config.min, Math.min(config.max, Math.round(nextValue)));
    valueStrong.textContent = current;
    viewport.setAttribute("aria-valuenow", current);
    viewport.scrollTo({
      left: sidePadding + (current - config.min) * stepPx - viewport.clientWidth / 2,
      behavior,
    });
  };

  let scrollFrame = null;
  viewport.addEventListener("scroll", () => {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      const center = viewport.scrollLeft + viewport.clientWidth / 2;
      current = Math.max(config.min, Math.min(config.max, Math.round((center - sidePadding) / stepPx + config.min)));
      valueStrong.textContent = current;
      viewport.setAttribute("aria-valuenow", current);
    });
  });
  viewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setValue(current - 1, "smooth");
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setValue(current + 1, "smooth");
    }
  });
  let dragging = false;
  let dragStartX = 0;
  let dragStartScroll = 0;
  let snapTimer = null;
  const snapToCurrentValue = () => {
    if (dragging) return;
    window.clearTimeout(snapTimer);
    snapTimer = window.setTimeout(() => setValue(current, "smooth"), 90);
  };
  const startDrag = (event) => {
    dragging = true;
    dragStartX = event.clientX;
    dragStartScroll = viewport.scrollLeft;
    shell.classList.add("is-dragging");
    shell.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event) => {
    if (!dragging) return;
    event.preventDefault();
    viewport.scrollLeft = dragStartScroll - (event.clientX - dragStartX);
  };
  const stopDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    shell.classList.remove("is-dragging");
    shell.releasePointerCapture?.(event.pointerId);
    snapToCurrentValue();
  };
  shell.addEventListener("pointerdown", startDrag);
  shell.addEventListener("pointermove", moveDrag);
  shell.addEventListener("pointerup", stopDrag);
  shell.addEventListener("pointercancel", stopDrag);
  viewport.addEventListener("scroll", snapToCurrentValue, { passive: true });

  const button = document.createElement("button");
  button.className = "primary-button";
  button.textContent = "Continuar";
  wrap.appendChild(button);
  requestAnimationFrame(() => {
    setValue(current);
    window.setTimeout(() => setValue(current), 60);
  });

  wrap.addEventListener("submit", (event) => {
    event.preventDefault();
    saveAnswer(step.id, current);
    goNext(step);
  });
  return wrap;
}

function renderBodyMap(element) {
  const wrap = document.createElement("div");
  wrap.className = "body-map";
  wrap.innerHTML = `<img src="${element.image}" alt="Pessoa" loading="eager" decoding="async" fetchpriority="high" />`;
  const positions = [
    ["Costas", "marker-left top-35"],
    ["Braços", "marker-left top-25"],
    ["Barriga", "marker-right top-25"],
    ["Pochete", "marker-right top-36"],
    ["Flanco", "marker-left top-59"],
    ["Culotes", "marker-right top-45"],
    ["Pernas", "marker-left top-75"],
    ["Coxa", "marker-right top-60"],
  ];
  positions.forEach(([label, className]) => {
    const button = document.createElement("button");
    button.className = `body-marker ${className}`;
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => button.classList.toggle("active"));
    wrap.appendChild(button);
  });
  return wrap;
}

function setupAudioPlayer(card) {
  if (!card) return;
  const audio = card.querySelector("audio");
  const button = card.querySelector(".audio-play");
  const progress = card.querySelector(".audio-wave b");
  const playAudio = () => {
    audio.play().catch(() => {
      card.classList.add("autoplay-blocked");
    });
  };
  button.addEventListener("click", () => {
    if (audio.paused) {
      playAudio();
    } else {
      audio.pause();
    }
  });
  audio.addEventListener("play", () => {
    button.textContent = "Ⅱ";
    card.classList.add("is-playing");
  });
  audio.addEventListener("pause", () => {
    button.textContent = "▶";
    card.classList.remove("is-playing");
  });
  audio.addEventListener("timeupdate", () => {
    const percent = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    progress.style.width = `${percent}%`;
  });
  audio.addEventListener("ended", () => {
    audio.currentTime = 0;
  });
  window.setTimeout(playAudio, 650);
}

function loadVturbPlayer() {
  const src = "https://scripts.converteai.net/1f44e052-5570-40b6-b17e-13fa7cf55f04/players/69fe75c3f70f7722cd1d508d/v4/player.js";
  if (document.querySelector(`script[src="${src}"]`)) return;
  const script = document.createElement("script");
  script.type = "text/javascript";
  script.src = src;
  script.async = true;
  document.head.appendChild(script);
}

function saveAnswer(stepId, value) {
  state.answers[stepId] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.answers));
  window.quizTracker?.trackAnswer?.(getStep(stepId), value);
  window.quizUtmify?.trackAnswer?.(getStep(stepId), value);
}

function goNext(step) {
  goTo(step.nextStep);
}

function goTo(id) {
  if (!id || state.isTransitioning) return;
  const targetStep = getStep(id);
  preloadStepAssets(targetStep, true);
  preloadNextSteps(targetStep, 4);
  window.quizTracker?.trackStepLeave?.(getStep(), id);
  state.isTransitioning = true;
  app.classList.add("is-leaving");
  window.setTimeout(() => {
    state.currentStepId = id;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => {
      state.isTransitioning = false;
    }, 180);
  }, 180);
}

function getStepIndex(stepId) {
  return state.data.quiz.steps.findIndex((step) => step.id === stepId);
}

function isCheckoutButton(element, step) {
  const text = String(element?.text || step?.button?.text || "").trim().toUpperCase();
  const nextStep = getStep(step?.nextStep);
  return step?.type === "offer" && nextStep?.type === "redirect" && text.includes("PEGAR MEU PLANO");
}

function getRedirectUrlForStep(step) {
  const nextStep = getStep(step?.nextStep);
  return nextStep?.redirectUrl || state.data.quiz.settings.redirectUrl || "";
}

function replaceVars(text) {
  const values = Object.values(state.answers).reduce((acc, entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) Object.assign(acc, entry);
    return acc;
  }, {});
  return String(text || "")
    .replaceAll("{{nome}}", values.nome || values.nome_ || "Você")
    .replaceAll("{{doenças}}", values.doen_as || values.doencas || "sua condição");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function redirectTo(url) {
  const params = new URLSearchParams(window.location.search);
  const target = new URL(url || state.data.quiz.settings.redirectUrl, window.location.href);
  params.forEach((value, key) => {
    if (!target.searchParams.has(key)) target.searchParams.set(key, value);
  });
  window.quizTracker?.trackConversion?.(target.toString());
  window.quizUtmify?.trackConversion?.(getStep(), target.toString());
  window.setTimeout(() => {
    window.location.href = target.toString();
  }, 350);
}

function warmInitialAssets() {
  const firstStep = getStep(state.currentStepId) || state.data.quiz.steps[0];
  enqueueAsset(state.data.quiz.theme.logo, "image", true);
  enqueueAsset(state.data.quiz.theme.favicon, "image", false);
  preloadStepAssets(firstStep, true);
  preloadNextSteps(firstStep, 6);
}

function preloadNextSteps(step, depth = 4) {
  if (!step || depth <= 0) return;
  const visited = new Set([step.id]);
  let frontier = getNextStepIds(step);

  for (let level = 0; level < depth && frontier.length; level += 1) {
    const nextFrontier = [];
    frontier.forEach((stepId) => {
      if (!stepId || visited.has(stepId)) return;
      visited.add(stepId);
      const nextStep = getStep(stepId);
      if (!nextStep) return;
      preloadStepAssets(nextStep, level < 2);
      nextFrontier.push(...getNextStepIds(nextStep));
    });
    frontier = nextFrontier;
  }
}

function getNextStepIds(step) {
  const ids = new Set();
  if (step.nextStep) ids.add(step.nextStep);
  (step.options || []).forEach((option) => {
    if (option.nextStep) ids.add(option.nextStep);
  });
  (step.elements || []).forEach((element) => {
    (element.options || []).forEach((option) => {
      if (option.nextStep) ids.add(option.nextStep);
    });
  });
  return [...ids];
}

function preloadStepAssets(step, urgent = false) {
  if (!step) return;
  collectStepAssets(step).forEach((asset) => enqueueAsset(asset.url, asset.type, urgent));
}

function collectStepAssets(step) {
  const assets = [];
  const pushImage = (url) => {
    if (url) assets.push({ url, type: "image" });
  };
  const pushAudio = (url) => {
    if (url) assets.push({ url, type: "audio" });
  };

  pushImage(step.image);
  (step.options || []).forEach((option) => pushImage(option.image));
  (step.elements || []).forEach((element) => {
    pushImage(element.logo);
    pushImage(element.src);
    pushImage(element.image);
    if (element.type === "audio") pushAudio(element.src || "assets/nutri-amanda.mp3");
    (element.items || []).forEach((item) => pushImage(item.image));
    (element.options || []).forEach((option) => pushImage(option.image));
  });

  return assets;
}

function enqueueAsset(url, type = "image", urgent = false) {
  if (!url || !url.startsWith("assets/") || state.preloadedAssets.has(url)) return;
  state.preloadedAssets.add(url);
  const item = { url, type };
  urgent ? state.preloadQueue.unshift(item) : state.preloadQueue.push(item);
  schedulePreload();
}

function schedulePreload() {
  if (state.isPreloading) return;
  state.isPreloading = true;
  const run = () => drainPreloadQueue();
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 900 });
  } else {
    window.setTimeout(run, 80);
  }
}

function drainPreloadQueue() {
  const batch = state.preloadQueue.splice(0, 4);
  Promise.allSettled(batch.map(loadAsset)).finally(() => {
    state.isPreloading = false;
    if (state.preloadQueue.length) schedulePreload();
  });
}

function loadAsset(asset) {
  if (asset.type === "audio") {
    return fetch(asset.url, { cache: "force-cache" }).catch(() => {});
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = resolve;
    image.onerror = resolve;
    image.src = asset.url;
    if (image.decode) image.decode().then(resolve).catch(resolve);
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

window.restartQuiz = function restartQuiz() {
  localStorage.removeItem(STORAGE_KEY);
  state.answers = {};
  state.currentStepId = state.data.quiz.steps[0].id;
  render();
};
