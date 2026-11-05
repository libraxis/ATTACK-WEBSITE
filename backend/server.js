import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_KEY || '';
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(x=>x.trim()).filter(Boolean);
const MAX_RPS = 50, MAX_CONCURRENCY = 20, MAX_DURATION = 120, MAX_REQUESTS = 6000;
const tests = new Map();

function send(res,status,obj,origin=''){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':origin||'*','Vary':'Origin'});
  res.end(JSON.stringify(obj));
}
function allowedOrigin(origin){
  return !origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin);
}
function auth(req,res){
  const origin=req.headers.origin||'';
  if(!allowedOrigin(origin)){send(res,403,{error:'Origem não autorizada.'},'null');return false}
  if(API_KEY && req.headers['x-api-key']!==API_KEY){send(res,401,{error:'Chave de acesso inválida.'},origin);return false}
  return true;
}
function parseBody(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>10000)reject(new Error('Corpo muito grande'))});req.on('end',()=>{try{resolve(JSON.parse(b||'{}'))}catch{reject(new Error('JSON inválido'))}});req.on('error',reject)})}
function validateTarget(raw){
  let u;try{u=new URL(raw)}catch{throw new Error('URL inválida')}
  if(u.protocol!=='https:')throw new Error('Somente destinos HTTPS são aceitos');
  if(u.username||u.password)throw new Error('URL com credenciais não é permitida');
  if(!ALLOWED_HOSTS.includes(u.hostname.toLowerCase()))throw new Error('Domínio não autorizado. Configure ALLOWED_HOSTS no Render.');
  if(u.port && u.port!=='443')throw new Error('Portas personalizadas não são permitidas');
  return u;
}
function snapshot(t){
  const sorted=[...t.latencies].sort((a,b)=>a-b);
  const avg=sorted.length?sorted.reduce((a,b)=>a+b,0)/sorted.length:0;
  const p95=sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]:null;
  const elapsed=Math.max(.001,(Date.now()-t.startedAt)/1000);
  return {id:t.id,status:t.status,targetUrl:t.targetUrl,rps:t.rps,concurrency:t.concurrency,durationSeconds:t.durationSeconds,
    started:t.started,completed:t.completed,success:t.success,errors:t.errors,avgLatencyMs:avg,p95LatencyMs:p95,
    observedRps:t.completed/elapsed,elapsedSeconds:Math.min(t.durationSeconds,elapsed),history:t.history,message:t.message||''};
}
function finish(t,status,message=''){
  if(t.status!=='running')return;
  t.status=status;t.message=message;clearInterval(t.scheduler);clearTimeout(t.deadline);
}
function startTest(input){
  const u=validateTarget(input.targetUrl);
  const rps=Number(input.rps),concurrency=Number(input.concurrency),durationSeconds=Number(input.durationSeconds);
  if(!Number.isInteger(rps)||rps<1||rps>MAX_RPS)throw new Error(`RPS deve estar entre 1 e ${MAX_RPS}`);
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>MAX_CONCURRENCY)throw new Error(`Concorrência deve estar entre 1 e ${MAX_CONCURRENCY}`);
  if(!Number.isInteger(durationSeconds)||durationSeconds<1||durationSeconds>MAX_DURATION)throw new Error(`Duração deve estar entre 1 e ${MAX_DURATION} segundos`);
  if(rps*durationSeconds>MAX_REQUESTS)throw new Error(`Este teste excederia o limite de ${MAX_REQUESTS} tentativas. Reduza RPS ou duração.`);
  const t={id:randomUUID(),targetUrl:u.toString(),origin:u.origin,rps,concurrency,durationSeconds,status:'running',
    started:0,completed:0,success:0,errors:0,latencies:[],history:[],startedAt:Date.now(),message:'',scheduler:null,deadline:null,active:0,lastHistory:Date.now()};
  tests.set(t.id,t);
  const tickMs=1000/rps;
  t.scheduler=setInterval(()=>{
    if(t.status!=='running')return;
    if(t.started>=MAX_REQUESTS){finish(t,'completed','Limite de tentativas atingido');return}
    if(t.active>=t.concurrency)return;
    t.started++;t.active++;
    const began=Date.now();
    fetch(t.targetUrl,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'RenderLoadTester/1.0','Cache-Control':'no-cache'}})
      .then(async response=>{
        // Redirects are recorded but never followed, so traffic cannot leave the approved origin.
        if(response.status>=200&&response.status<400)t.success++;else t.errors++;
        await response.body?.cancel().catch(()=>{});
      })
      .catch(()=>{t.errors++})
      .finally(()=>{
        t.completed++;t.active--;t.latencies.push(Date.now()-began);
        if(t.latencies.length>MAX_REQUESTS)t.latencies.shift();
        if(Date.now()-t.lastHistory>=1000){t.history.push({at:Date.now(),rps:t.completed/Math.max(1,(Date.now()-t.startedAt)/1000)});if(t.history.length>120)t.history.shift();t.lastHistory=Date.now()}
        if(t.status==='running'&&t.started>=rps*durationSeconds&&t.active===0)finish(t,'completed');
      });
  },tickMs);
  t.deadline=setTimeout(()=>finish(t,'completed'),durationSeconds*1000+16000);
  return t;
}
const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin||'';
  if(req.method==='OPTIONS'){
    if(!allowedOrigin(origin)){send(res,403,{error:'Origem não autorizada.'},'null');return}
    res.writeHead(204,{'Access-Control-Allow-Origin':origin||'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-API-Key','Access-Control-Max-Age':'600','Vary':'Origin'});res.end();return;
  }
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/health'&&req.method==='GET'){send(res,200,{ok:true,service:'render-load-tester',limits:{maxRps:MAX_RPS,maxConcurrency:MAX_CONCURRENCY,maxDurationSeconds:MAX_DURATION,maxRequests:MAX_REQUESTS}},origin);return}
  if(!auth(req,res))return;
  if(path==='/api/tests'&&req.method==='POST'){
    try{const body=await parseBody(req);const t=startTest(body);send(res,202,snapshot(t),origin)}catch(e){send(res,400,{error:e.message},origin)}return;
  }
  const match=path.match(/^\/api\/tests\/([a-f0-9-]+)(\/stop)?$/i);
  if(match){
    const t=tests.get(match[1]);if(!t){send(res,404,{error:'Teste não encontrado.'},origin);return}
    if(match[2]&&req.method==='POST'){finish(t,'stopped','Interrompido pelo operador');send(res,200,snapshot(t),origin);return}
    if(!match[2]&&req.method==='GET'){send(res,200,snapshot(t),origin);return}
  }
  send(res,404,{error:'Rota não encontrada.'},origin);
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Load tester executor listening on ${PORT}`));
