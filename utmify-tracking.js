(function () {
  const STORAGE_KEY = "banana_bariatrica_utmify_events";

  function getSessionId() {
    return window.quizTracker?.sessionId || localStorage.getItem("banana_bariatrica_session_id") || null;
  }

  function getUtms() {
    const params = new URLSearchParams(window.location.search);
    const utms = {};
    params.forEach((value, key) => {
      if (key.startsWith("utm_") || ["src", "sck", "fbclid", "gclid", "xcod"].includes(key)) {
        utms[key] = value;
      }
    });
    return utms;
  }

  function basePayload(step, extra) {
    return {
      pixel_id: window.pixelId || null,
      quiz_name: "Banana Bariatrica",
      session_id: getSessionId(),
      step_id: step?.id || null,
      step_slug: step?.slug || null,
      step_title: step?.title || step?.question || null,
      step_type: step?.type || null,
      step_progress: step?.progress ?? null,
      url: window.location.href,
      utm: getUtms(),
      ...extra,
    };
  }

  function rememberEvent(name, payload) {
    try {
      const events = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
      events.push({ name, payload, at: new Date().toISOString() });
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-80)));
    } catch (_) {}
  }

  function sendEvent(name, payload) {
    rememberEvent(name, payload);
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...payload });
    window.dispatchEvent(new CustomEvent("quiz:utmify-event", { detail: { name, payload } }));

    const candidates = [
      window.utmify?.track,
      window.utmify?.pixel?.track,
      window.Utmify?.track,
      window.UTMify?.track,
    ].filter((fn) => typeof fn === "function");

    candidates.forEach((fn) => {
      try {
        fn(name, payload);
      } catch (_) {}
    });
  }

  window.quizUtmify = {
    trackStepView(step, index) {
      sendEvent("QuizStepView", basePayload(step, { step_index: index + 1 }));
    },
    trackAnswer(step, value) {
      sendEvent("QuizAnswer", basePayload(step, { value }));
    },
    trackInitiateCheckout(step, checkoutUrl) {
      sendEvent("InitiateCheckout", basePayload(step, {
        value: 1,
        currency: "BRL",
        checkout_url: checkoutUrl,
      }));
    },
    trackConversion(step, checkoutUrl) {
      sendEvent("QuizCheckoutRedirect", basePayload(step, { checkout_url: checkoutUrl }));
    },
  };
})();
