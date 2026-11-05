const $ = id => document.getElementById(id);
let activeTest = null, pollTimer = null, chartData = [];
const fmt = n => Number(n || 0).toLocaleString('pt-BR');
function baseUrl(){return $('apiBase').value.trim().replace(/\/$/,'')}
function headers(){return {'Content-Type':'application/json','X-API-Key':$('apiKey').value.trim()}}
function setStatus(s){$('status').textContent=s}
async function api(path,opts={}) {
  const r=await fetch(baseUrl()+path,{...opts,headers:{...headers(),...(opts.headers||{})}});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(data.error||`Erro HTTP ${r.status}`);
  return data;
}
function drawChart(){
  const c=$('chart'),ctx=c.getContext('2d'),w=c.clientWidth,h=150,dpr=window.devicePixelRatio||1;
  c.width=w*dpr;c.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='#26364d';ctx.lineWidth=1;
  for(let i=0;i<4;i++){let y=12+i*(h-28)/3;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  if(!chartData.length)return;
  const max=Math.max(1,...chartData.map(x=>x.rps));ctx.strokeStyle='#63a7ff';ctx.lineWidth=2;ctx.beginPath();
  chartData.forEach((p,i)=>{let x=chartData.length===1?0:i/(Math.max(1,chartData.length-1))*w;let y=h-15-(p.rps/max)*(h-35);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
}
function render(s){
  $('total').textContent=fmt(s.completed);$('sent').textContent=`${fmt(s.started)} tentativas iniciadas`;
  $('success').textContent=s.completed?`${(s.success/s.completed*100).toFixed(1).replace('.',',')}%`:'—';
  $('errors').textContent=`${fmt(s.errors)} erros`;
  $('avg').textContent=s.completed?`${s.avgLatencyMs.toFixed(0)} ms`:'—';
  $('p95').textContent=`P95: ${s.p95LatencyMs==null?'—':Math.round(s.p95LatencyMs)+' ms'}`;
  $('throughput').textContent=s.observedRps==null?'—':s.observedRps.toFixed(1).replace('.',',');
  const elapsed=Math.min(s.elapsedSeconds||0,s.durationSeconds);
  $('elapsed').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')} / ${String(Math.floor(s.durationSeconds/60)).padStart(2,'0')}:${String(s.durationSeconds%60).padStart(2,'0')}`;
  $('progressBar').style.width=`${Math.min(100,elapsed/s.durationSeconds*100)}%`;
  if(s.history?.length){chartData=s.history.slice(-120);drawChart()}
  if(['completed','stopped','failed'].includes(s.status)){
    $('result').innerHTML=`<div class="result-grid">
      <div><b>${fmt(s.completed)}</b><span>Concluídas</span></div>
      <div><b>${fmt(s.success)}</b><span>Respostas 2xx/3xx</span></div>
      <div><b>${fmt(s.errors)}</b><span>Falhas / outros status</span></div>
      <div><b>${s.avgLatencyMs.toFixed(0)} ms</b><span>Latência média</span></div>
      <div><b>${s.p95LatencyMs==null?'—':Math.round(s.p95LatencyMs)+' ms'}</b><span>Latência P95</span></div>
      <div><b>${s.observedRps==null?'—':s.observedRps.toFixed(2)}</b><span>Respostas por segundo</span></div>
    </div><p class="empty">Status: ${s.status}${s.message?' · '+s.message:''}</p>`;
  }
}
async function poll(){
  if(!activeTest)return;
  try{
    const s=await api(`/api/tests/${activeTest}`);render(s);
    if(['completed','stopped','failed'].includes(s.status)){
      clearInterval(pollTimer);activeTest=null;$('startBtn').disabled=false;$('stopBtn').disabled=true;setStatus('Teste finalizado');
    }
  }catch(e){clearInterval(pollTimer);activeTest=null;$('startBtn').disabled=false;$('stopBtn').disabled=true;setStatus(e.message)}
}
$('startBtn').addEventListener('click',async()=>{
  try{
    if(!baseUrl()||!$('apiKey').value.trim())throw new Error('Informe a URL do executor e a chave de acesso dele.');
    const targetUrl=$('target').value.trim(),rps=Number($('rps').value),concurrency=Number($('concurrency').value),durationSeconds=Number($('duration').value),method=$('method').value;
    if(!/^https:\/\//i.test(targetUrl))throw new Error('O destino precisa usar HTTPS.');
    if(!Number.isInteger(rps)||rps<1||rps>50||!Number.isInteger(concurrency)||concurrency<1||concurrency>20)throw new Error('Confira os limites de RPS e concorrência.');
    $('startBtn').disabled=true;setStatus('Validando e iniciando…');chartData=[];drawChart();
    const s=await api('/api/tests',{method:'POST',body:JSON.stringify({targetUrl,method,rps,concurrency,durationSeconds})});
    activeTest=s.id;$('stopBtn').disabled=false;$('result').textContent='Teste em andamento…';setStatus('Teste em execução');
    pollTimer=setInterval(poll,1000);poll();
  }catch(e){setStatus(e.message);$('startBtn').disabled=false}
});
$('stopBtn').addEventListener('click',async()=>{
  if(!activeTest)return;
  try{await api(`/api/tests/${activeTest}/stop`,{method:'POST'});setStatus('Interrompendo teste…')}catch(e){setStatus(e.message)}
});
drawChart();
