const jobsEl = document.querySelector("#jobs");
const summary = document.querySelector("#summary");
const historyEl = document.querySelector("#history");
const POLL_MS = 3000;

async function load() {
  try {
    const [cfgRes, logRes] = await Promise.all([
      fetch("jobs.json?" + Date.now(), { cache: "no-store" }),
      fetch("status.json?" + Date.now(), { cache: "no-store" }).catch(() => null)
    ]);

    if (!cfgRes.ok) throw new Error("Não foi possível ler jobs.json");

    const cfg = await cfgRes.json();
    const log = logRes && logRes.ok ? await logRes.json() : { results: [] };
    const entries = Array.isArray(cfg.jobs) ? cfg.jobs : [];
    const results = Array.isArray(log.results) ? log.results.slice().reverse() : [];
    const successes = results.filter(item => item.status === "SUCESSO").length;
    const failures = results.length - successes;

    summary.textContent =
      `${entries.length} agendamento(s) • ${results.length} requisição(ões) no histórico • ` +
      `${successes} sucesso(s) • ${failures} falha(s) • Consulta automática a cada 3 segundos`;

    if (!entries.length) {
      jobsEl.innerHTML = '<div class="empty">Nenhum agendamento cadastrado em jobs.json.</div>';
    } else {
      const latest = new Map();
      for (const item of log.results || []) latest.set(item.name, item);

      jobsEl.innerHTML = entries.map(job => {
        const result = latest.get(job.name);
        const status = result
          ? `<span class="live-status ${result.status === "SUCESSO" ? "ok" : "bad"}">${esc(result.status)}</span>`
          : '<span class="live-status pending">AGUARDANDO</span>';
        const code = result && result.http_code ? `HTTP ${esc(result.http_code)}` : "";
        return `<article class="job">
          <div>
            <h4>${esc(job.name || "Sem nome")} ${job.enabled === false ? '<span class="tag">Desativado</span>' : ''}</h4>
            <div class="url">${esc(job.url || "URL não informada")}</div>
            <div class="meta">
              <span class="tag">${esc((job.method || "GET").toUpperCase())}</span>
              <span class="tag">A cada ${Number(job.interval_minutes) || 5} min</span>
              <span class="tag">${job.enabled === false ? "Pausado" : "Ativo"}</span>
            </div>
          </div>
          <div class="result">${status}<strong>${code}</strong><span>${esc(result ? result.time : "Sem execução registrada")}</span></div>
        </article>`;
      }).join("");
    }

    if (!results.length) {
      historyEl.innerHTML = '<div class="empty">Nenhuma requisição registrada ainda.</div>';
    } else {
      historyEl.innerHTML = results.map(item => `
        <article class="history-row">
          <div class="history-main">
            <strong>${esc(item.name || "Sem nome")}</strong>
            <span>${esc(item.method || "GET")} · ${esc(item.time || "")}</span>
            <small>${esc(item.message || "")}</small>
          </div>
          <div class="history-result">
            <span class="live-status ${item.status === "SUCESSO" ? "ok" : "bad"}">${esc(item.status || "FALHA")}</span>
            <strong>${item.http_code ? "HTTP " + esc(item.http_code) : "—"}</strong>
          </div>
        </article>`).join("");
    }
  } catch (error) {
    summary.textContent = "Falha ao carregar: " + error.message;
  }
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

document.querySelector("#refresh").addEventListener("click", load);
load();
setInterval(load, POLL_MS);
