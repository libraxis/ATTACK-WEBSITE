import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';

const PORT = Number(process.env.PORT || 3000);
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(x=>x.trim()).filter(Boolean);
const MAX_RPS = 50, MAX_CONCURRENCY = 20, MAX_DURATION = 120, MAX_REQUESTS = 6000;
const tests = new Map();
const MAX_ACTIVE_TESTS = 1;

function send(res,status,obj,origin='*'){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin'});
  res.end(JSON.stringify(obj));
}
function originAllowed(origin){return !origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)}
function checkOrigin(req,res){
  const origin=req.headers.origin||'';
  if(!originAllowed(origin)){send(res,403,{error:'Origem não autorizada.'},'null');return false}
  return true;
}
function parseBody(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>10000)reject(new Error('Corpo muito grande'))});req.on('end',()=>{try{resolve(JSON.parse(b||'{}'))}catch{reject(new Error('JSON inválido'))}});req.on('error',reject)})}
function isPrivateAddress(ip){
  const version=net.isIP(ip);
  if(version===4){
    const [a,b]=ip.split('.').map(Number);
    return a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19));
  }
  if(version===6){
    const x=ip.toLowerCase();
    return x==='::1'||x==='::'||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('fe8')||x.startsWith('fe9')||x.startsWith('fea')||x.startsWith('feb')||x.startsWith('::ffff:127.')||x.startsWith('::ffff:10.')||x.startsWith('::ffff:192.168.');
  }
  return true;
}
async function validateTarget(raw){
  let u;try{u=new URL(raw)}catch{throw new Error('URL inválida')}
  if(u.protocol!=='https:')throw new Error('Somente destinos HTTPS são aceitos');
  if(u.username||u.password)throw new Error('URL com credenciais não é permitida');
  if(!ALLOWED_HOSTS.includes(u.hostname.toLowerCase()))throw new Error('Domínio não autorizado. Adicione o hostname exato em ALLOWED_HOSTS no executor.');
  if(u.port && u.port!=='443')throw new Error('Portas personalizadas não são permitidas');
  if(net.isIP(u.hostname)){
    if(isPrivateAddress(u.hostname))throw new Error('Endereços IP privados ou especiais não são permitidos');
  }else{
    const records=await dns.lookup(u.hostname,{all:true,verbatim:true});
    if(!records.length||records.some(r=>isPrivateAddress(r.address)))throw new Error('O domínio resolve para endereço privado ou não permitido');
  }
  return u;
}
function snapshot(t){
  const sorted=[...t.latencies].sort((a,b)=>a-b);
  const avg=sorted.length?sorted.reduce((a,b)=>a+b,0)/sorted.length:0;
  const p95=sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]:null;
  const elapsed=Math.max(.001,(Date.now()-t.startedAt)/1000);
  return {id:t.id,status:t.status,targetUrl:t.targetUrl,method:t.method,rps:t.rps,concurrency:t.concurrency,durationSeconds:t.durationSeconds,
    started:t.started,completed:t.completed,success:t.success,errors:t.errors,avgLatencyMs:avg,p95LatencyMs:p95,
    observedRps:t.completed/elapsed,elapsedSeconds:Math.min(t.durationSeconds,elapsed),history:t.history,message:t.message||''};
}
function finish(t,status,message=''){if(t.status!=='running')return;t.status=status;t.message=message;clearInterval(t.scheduler);clearTimeout(t.deadline)}
async function startTest(input){
  if([...tests.values()].some(t=>t.status==='running')) throw new Error('Já existe um teste em execução neste executor. Aguarde terminar antes de iniciar outro.');
  const u=await validateTarget(input.targetUrl);
  const method=input.method==='HEAD'?'HEAD':'GET';
  const rps=Number(input.rps),concurrency=Number(input.concurrency),durationSeconds=Number(input.durationSeconds);
  if(!Number.isInteger(rps)||rps<1||rps>MAX_RPS)throw new Error(`RPS deve estar entre 1 e ${MAX_RPS}`);
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>MAX_CONCURRENCY)throw new Error(`Concorrência deve estar entre 1 e ${MAX_CONCURRENCY}`);
  if(!Number.isInteger(durationSeconds)||durationSeconds<1||durationSeconds>MAX_DURATION)throw new Error(`Duração deve estar entre 1 e ${MAX_DURATION} segundos`);
  if(rps*durationSeconds>MAX_REQUESTS)throw new Error(`O teste excederia ${MAX_REQUESTS} tentativas. Reduza RPS ou duração.`);
  const t={id:randomUUID(),targetUrl:u.toString(),method,rps,concurrency,durationSeconds,status:'running',
    started:0,completed:0,success:0,errors:0,latencies:[],history:[],startedAt:Date.now(),message:'',scheduler:null,deadline:null,active:0,lastHistory:Date.now()};
  tests.set(t.id,t);
  t.scheduler=setInterval(()=>{
    if(t.status!=='running')return;
    if(t.started>=rps*durationSeconds){if(t.active===0)finish(t,'completed');return}
    if(t.active>=t.concurrency)return;
    t.started++;t.active++;
    const began=Date.now();
    fetch(t.targetUrl,{method,redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'UniversalLoadTester/1.1','Cache-Control':'no-cache'}})
      .then(async response=>{if(response.status>=200&&response.status<400)t.success++;else t.errors++;await response.body?.cancel().catch(()=>{})})
      .catch(()=>{t.errors++})
      .finally(()=>{
        t.completed++;t.active--;t.latencies.push(Date.now()-began);
        if(t.latencies.length>MAX_REQUESTS)t.latencies.shift();
        if(Date.now()-t.lastHistory>=1000){const elapsed=Math.max(1,(Date.now()-t.startedAt)/1000);t.history.push({at:Date.now(),rps:t.completed/elapsed});if(t.history.length>120)t.history.shift();t.lastHistory=Date.now()}
        if(t.status==='running'&&t.started>=rps*durationSeconds&&t.active===0)finish(t,'completed');
      });
  },1000/rps);
  t.deadline=setTimeout(()=>finish(t,'completed','Prazo máximo de execução encerrado'),durationSeconds*1000+13000);
  return t;
}
const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin||'';
  if(req.method==='OPTIONS'){
    if(!originAllowed(origin)){send(res,403,{error:'Origem não autorizada.'},'null');return}
    res.writeHead(204,{'Access-Control-Allow-Origin':origin||'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'});res.end();return;
  }
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/health'&&req.method==='GET'){send(res,200,{ok:true,service:'universal-http-load-tester',limits:{maxRps:MAX_RPS,maxConcurrency:MAX_CONCURRENCY,maxDurationSeconds:MAX_DURATION,maxRequests:MAX_REQUESTS},configured:ALLOWED_HOSTS.length>0},origin||'*');return}
  if(!checkOrigin(req,res))return;
  if(path==='/api/tests'&&req.method==='POST'){
    try{const body=await parseBody(req);const t=await startTest(body);send(res,202,snapshot(t),origin||'*')}catch(e){send(res,400,{error:e.message},origin||'*')}return;
  }
  const match=path.match(/^\/api\/tests\/([a-f0-9-]+)(\/stop)?$/i);
  if(match){
    const t=tests.get(match[1]);if(!t){send(res,404,{error:'Teste não encontrado ou executor reiniciado.'},origin||'*');return}
    if(match[2]&&req.method==='POST'){finish(t,'stopped','Interrompido pelo operador');send(res,200,snapshot(t),origin||'*');return}
    if(!match[2]&&req.method==='GET'){send(res,200,snapshot(t),origin||'*');return}
  }
  send(res,404,{error:'Rota não encontrada.'},origin||'*');
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Universal load tester listening on ${PORT}`));
