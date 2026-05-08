(function () {
  const CONFIG = window.QUIZ_SUPABASE;
  const SESSION_KEY = "banana_bariatrica_session_id";
  const STEP_START_KEY = "banana_bariatrica_step_started_at";

  if (!CONFIG || !window.supabase) {
    window.quizTracker = createNoopTracker();
    return;
  }

  const client = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey);
  let sessionId = localStorage.getItem(SESSION_KEY);
  let currentStep = null;

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  function getUtms() {
    const params = new URLSearchParams(window.location.search);
    const utms = {};
    const marketingKeys = new Set([
      "src",
      "sck",
      "fbclid",
      "gclid",
      "ttclid",
      "msclkid",
      "xcod",
      "subid",
      "sub_id",
      "campaign",
      "campaign_id",
      "adset",
      "adset_id",
      "adgroup",
      "adgroup_id",
      "ad",
      "ad_id",
      "ad_name",
      "creative",
      "creative_id",
      "criativo",
      "placement",
      "site_source_name",
    ]);
    params.forEach((value, key) => {
      if (key.startsWith("utm_") || marketingKeys.has(key)) {
        utms[key] = value;
      }
    });
    utms.source = utms.utm_source || utms.src || "";
    utms.medium = utms.utm_medium || "";
    utms.campaign = utms.utm_campaign || utms.campaign || "";
    utms.adset = utms.utm_term || utms.adset || utms.adset_id || utms.adgroup || utms.adgroup_id || "";
    utms.creative = utms.utm_content || utms.creative || utms.creative_id || utms.ad_name || utms.ad_id || utms.ad || utms.criativo || "";
    return utms;
  }

  function stepPayload(step, extra = {}) {
    return {
      step_id: step?.id || null,
      step_slug: step?.slug || null,
      step_title: step?.title || step?.question || null,
      step_type: step?.type || null,
      step_progress: step?.progress ?? null,
      ...extra,
    };
  }

  async function init() {
    const session = {
      id: sessionId,
      quiz_name: CONFIG.quizName,
      landing_url: window.location.href,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
      utm: getUtms(),
      last_seen_at: new Date().toISOString(),
    };

    await client.from("quiz_sessions").upsert(session, { onConflict: "id" });
    await trackEvent("session_start", {});
  }

  async function trackEvent(eventType, payload) {
    return client.from("quiz_events").insert({
      session_id: sessionId,
      event_type: eventType,
      ...payload,
    });
  }

  async function trackStepView(step, index) {
    const previous = currentStep;
    currentStep = step;
    localStorage.setItem(STEP_START_KEY, String(Date.now()));

    await client.from("quiz_sessions").update({
      current_step_id: step.id,
      current_step_slug: step.slug,
      current_step_title: step.title || step.question || null,
      current_step_index: index,
      last_seen_at: new Date().toISOString(),
    }).eq("id", sessionId);

    await trackEvent("step_view", stepPayload(step, { step_index: index }));

    if (previous && previous.id !== step.id) {
      await trackEvent("step_entered_from", stepPayload(step, {
        step_index: index,
        value: { previous_step_id: previous.id, previous_step_slug: previous.slug },
      }));
    }
  }

  async function trackAnswer(step, value) {
    const payload = stepPayload(step, { value });
    await client.from("quiz_answers").upsert({
      session_id: sessionId,
      step_id: payload.step_id,
      step_slug: payload.step_slug,
      step_title: payload.step_title,
      step_type: payload.step_type,
      value,
      answered_at: new Date().toISOString(),
    }, { onConflict: "session_id,step_id" });

    await client.rpc("increment_answer_count", { session_uuid: sessionId }).catch(() => {});
    await trackEvent("answer", payload);
  }

  async function trackStepLeave(step, nextStepId) {
    const startedAt = Number(localStorage.getItem(STEP_START_KEY) || Date.now());
    await trackEvent("step_leave", stepPayload(step, {
      value: {
        next_step_id: nextStepId,
        duration_ms: Math.max(0, Date.now() - startedAt),
      },
    }));
  }

  async function trackConversion(url) {
    await client.from("quiz_sessions").update({
      completed_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    }).eq("id", sessionId);

    await trackEvent("conversion_redirect", { value: { url } });
  }

  function markExit() {
    if (!currentStep) return;
    const body = JSON.stringify({
      exit_step_id: currentStep.id,
      exit_step_slug: currentStep.slug,
      exit_step_title: currentStep.title || currentStep.question || null,
      last_seen_at: new Date().toISOString(),
    });

    fetch(`${CONFIG.url}/rest/v1/quiz_sessions?id=eq.${sessionId}`, {
      method: "PATCH",
      headers: {
        apikey: CONFIG.publishableKey,
        Authorization: `Bearer ${CONFIG.publishableKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  window.addEventListener("beforeunload", markExit);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") markExit();
  });

  window.quizTracker = {
    init,
    trackStepView,
    trackAnswer,
    trackStepLeave,
    trackConversion,
    sessionId,
  };

  function createNoopTracker() {
    return {
      init() {},
      trackStepView() {},
      trackAnswer() {},
      trackStepLeave() {},
      trackConversion() {},
      sessionId: null,
    };
  }
})();
