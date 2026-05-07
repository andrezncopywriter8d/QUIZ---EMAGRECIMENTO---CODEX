const CONFIG = window.QUIZ_SUPABASE;
const dashboardState = {
  client: null,
  steps: window.QUIZ_DATA?.quiz?.steps?.filter((step) => step.type !== "redirect") || [],
  filters: {
    startDate: "",
    endDate: "",
  },
};

document.addEventListener("DOMContentLoaded", initDashboard);
document.getElementById("refreshBtn")?.addEventListener("click", loadDashboard);
document.getElementById("clearFilterBtn")?.addEventListener("click", clearDateFilters);
document.getElementById("resetDataBtn")?.addEventListener("click", resetAnalyticsData);
document.getElementById("startDateFilter")?.addEventListener("change", updateDateFilters);
document.getElementById("endDateFilter")?.addEventListener("change", updateDateFilters);

function initDashboard() {
  dashboardState.client = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey);
  loadDashboard();
}

async function loadDashboard() {
  const range = getDateRange();
  let sessionsQuery = dashboardState.client.from("quiz_sessions").select("*").order("started_at", { ascending: false }).limit(500);
  let eventsQuery = dashboardState.client.from("quiz_events").select("*").order("created_at", { ascending: false }).limit(5000);
  let answersQuery = dashboardState.client.from("quiz_answers").select("*").order("answered_at", { ascending: false }).limit(5000);

  if (range.from) {
    sessionsQuery = sessionsQuery.gte("started_at", range.from);
    eventsQuery = eventsQuery.gte("created_at", range.from);
    answersQuery = answersQuery.gte("answered_at", range.from);
  }

  if (range.to) {
    sessionsQuery = sessionsQuery.lte("started_at", range.to);
    eventsQuery = eventsQuery.lte("created_at", range.to);
    answersQuery = answersQuery.lte("answered_at", range.to);
  }

  const [sessionsResult, eventsResult, answersResult] = await Promise.all([
    sessionsQuery,
    eventsQuery,
    answersQuery,
  ]);

  if (sessionsResult.error || eventsResult.error || answersResult.error) {
    alert("Não foi possível carregar dados. Verifique se o supabase-schema.sql foi executado.");
    console.error(sessionsResult.error || eventsResult.error || answersResult.error);
    return;
  }

  const sessions = sessionsResult.data || [];
  const events = eventsResult.data || [];
  const answers = answersResult.data || [];

  renderMetrics(sessions, events, answers);
  renderFunnel(events, answers);
  renderSessions(sessions);
  document.getElementById("lastUpdated").textContent = new Date().toLocaleString("pt-BR");
}

function updateDateFilters() {
  dashboardState.filters.startDate = document.getElementById("startDateFilter")?.value || "";
  dashboardState.filters.endDate = document.getElementById("endDateFilter")?.value || "";
  loadDashboard();
}

function clearDateFilters() {
  dashboardState.filters.startDate = "";
  dashboardState.filters.endDate = "";
  document.getElementById("startDateFilter").value = "";
  document.getElementById("endDateFilter").value = "";
  loadDashboard();
}

async function resetAnalyticsData() {
  const confirmation = prompt('Isso vai apagar todos os dados do painel. Digite "ZERAR" para confirmar.');
  if (confirmation !== "ZERAR") return;

  const button = document.getElementById("resetDataBtn");
  button.disabled = true;
  button.textContent = "Zerando...";

  const { error } = await dashboardState.client.rpc("reset_quiz_analytics");

  button.disabled = false;
  button.textContent = "Zerar dados";

  if (error) {
    console.error(error);
    alert("Não foi possível zerar os dados. Execute novamente o supabase-schema.sql no Supabase para criar a função reset_quiz_analytics.");
    return;
  }

  await loadDashboard();
  alert("Dados zerados com sucesso.");
}

function getDateRange() {
  const { startDate, endDate } = dashboardState.filters;
  const range = { from: "", to: "" };

  if (startDate) {
    range.from = new Date(`${startDate}T00:00:00`).toISOString();
  }

  if (endDate) {
    range.to = new Date(`${endDate}T23:59:59.999`).toISOString();
  }

  return range;
}

function renderMetrics(sessions, events, answers) {
  const visitors = sessions.length;
  const contactSlugs = new Set(["474y033h", "4j0l233u"]);
  const leadSessionIds = new Set(answers.filter((answer) => contactSlugs.has(answer.step_slug)).map((answer) => answer.session_id));
  const converted = sessions.filter((session) => session.completed_at).length;
  const conversion = visitors ? Math.round((converted / visitors) * 1000) / 10 : 0;
  const drop = visitors ? Math.round(((visitors - converted) / visitors) * 1000) / 10 : 0;

  setText("visitorsMetric", visitors);
  setText("leadsMetric", leadSessionIds.size);
  setText("conversionMetric", `${conversion}%`);
  setText("dropMetric", `${drop}%`);
  setText("eventsMetric", events.length);
}

function renderFunnel(events, answers) {
  const viewsByStep = countBy(events.filter((event) => event.event_type === "step_view"), "step_id");
  const leavesByStep = countBy(events.filter((event) => event.event_type === "step_leave"), "step_id");
  const answersByStep = countBy(answers, "step_id");
  const firstStepViews = Math.max(1, viewsByStep[dashboardState.steps[0]?.id] || 0);

  const rows = dashboardState.steps.map((step, index) => {
    const views = viewsByStep[step.id] || 0;
    const answersCount = answersByStep[step.id] || 0;
    const leaves = leavesByStep[step.id] || 0;
    const retention = Math.round((views / firstStepViews) * 100);
    return `
      <tr>
        <td><div class="step-name step-number" title="${escapeHtml(step.title || step.question || step.slug)}">Etapa ${index + 1}</div></td>
        <td>${step.type}</td>
        <td>${views}</td>
        <td>${answersCount}</td>
        <td>${leaves}</td>
        <td><div class="retention"><i><b style="width:${Math.min(100, retention)}%"></b></i><span>${retention}%</span></div></td>
      </tr>
    `;
  }).join("");

  document.getElementById("funnelRows").innerHTML = rows || `<tr><td colspan="6">Sem dados ainda.</td></tr>`;
}

function renderSessions(sessions) {
  const rows = sessions.slice(0, 100).map((session) => {
    const status = session.completed_at ? `<span class="tag">Checkout</span>` : `<span class="tag warn">Saiu</span>`;
    return `
      <tr>
        <td>${new Date(session.started_at).toLocaleString("pt-BR")}</td>
        <td><div class="step-name">${escapeHtml(session.current_step_title || session.exit_step_title || "-")}</div></td>
        <td>${session.answers_count || 0}</td>
        <td>${status}</td>
        <td>${escapeHtml(session.utm?.utm_source || session.utm?.src || "-")}</td>
      </tr>
    `;
  }).join("");

  document.getElementById("sessionRows").innerHTML = rows || `<tr><td colspan="5">Sem sessões ainda.</td></tr>`;
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key];
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
