const jobsEl=document.querySelector("#jobs"), summary=document.querySelector("#summary");
async function load(){
  jobsEl.innerHTML='<div class="empty">Carregando…</div>';
  try{
    const [cfgRes,logRes]=await Promise.all([
      fetch("jobs.json?"+Date.now(),{cache:"no-store"}),
      fetch("status.json?"+Date.now(),{cache:"no-store"}).catch(()=>null)
    ]);
    if(!cfgRes.ok) throw new Error("Não foi possível ler jobs.json");
    const cfg=await cfgRes.json(), log=logRes&&logRes.ok?await logRes.json():{results:[]};
    const entries=Array.isArray(cfg.jobs)?cfg.jobs:[];
    summary.textContent=`${entries.length} agendamento(s) configurado(s) • Atualizado em ${new Date().toLocaleString("pt-BR")}`;
    if(!entries.length){jobsEl.innerHTML='<div class="empty">Nenhum agendamento cadastrado em jobs.json.</div>';return}
    const latest=new Map((log.results||[]).map(x=>[x.name,x]));
    jobsEl.innerHTML=entries.map(j=>{
      const r=latest.get(j.name);
      return `<article class="job"><div><h4>${esc(j.name||"Sem nome")} ${j.enabled===false?'<span class="tag">Desativado</span>':''}</h4><div class="url">${esc(j.url||"URL não informada")}</div><div class="meta"><span class="tag">${esc((j.method||"GET").toUpperCase())}</span><span class="tag">A cada ${Number(j.interval_minutes)||5} min</span><span class="tag">${j.enabled===false?"Pausado":"Ativo"}</span></div></div><div class="result">${r?`<strong>${esc(r.status||"Erro")}</strong>${esc(r.time||"")}`:"<strong>—</strong>Sem execução registrada"}</div></article>`;
    }).join("");
  }catch(e){summary.textContent="Falha ao carregar";jobsEl.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
document.querySelector("#refresh").addEventListener("click",load);load();