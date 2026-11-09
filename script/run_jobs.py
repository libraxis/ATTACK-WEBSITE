import json, os, socket, ipaddress, urllib.request, urllib.error
from datetime import datetime, timezone
from urllib.parse import urlparse

CONFIG="jobs.json"
STATUS="status.json"
ALLOWED_METHODS={"GET","HEAD","POST"}
MAX_JOBS=20
TIMEOUT=15

def public_http_url(raw):
    p=urlparse(raw)
    if p.scheme not in ("http","https") or not p.hostname:
        raise ValueError("URL deve usar http:// ou https://")
    if p.username or p.password:
        raise ValueError("URL não pode conter credenciais")
    try:
        addresses=socket.getaddrinfo(p.hostname, p.port or (443 if p.scheme=="https" else 80))
        for a in addresses:
            ip=ipaddress.ip_address(a[4][0])
            if not ip.is_global:
                raise ValueError("Destino precisa ser um endereço público")
    except socket.gaierror:
        raise ValueError("Não foi possível resolver o domínio")
    return p

def main():
    with open(CONFIG,encoding="utf-8") as f: cfg=json.load(f)
    jobs=cfg.get("jobs",[])
    if not isinstance(jobs,list) or len(jobs)>MAX_JOBS:
        raise SystemExit(f"jobs.json deve conter no máximo {MAX_JOBS} itens")
    now=datetime.now(timezone.utc)
    due=[]
    for j in jobs:
        if not j.get("enabled",False): continue
        try:
            interval=int(j.get("interval_minutes",5))
            if interval<5 or interval>60 or interval%5:
                raise ValueError("interval_minutes deve ser múltiplo de 5, entre 5 e 60")
            if now.minute % interval != 0: continue
            method=str(j.get("method","GET")).upper()
            if method not in ALLOWED_METHODS: raise ValueError("Método permitido: GET, HEAD ou POST")
            p=public_http_url(str(j.get("url","")))
            req=urllib.request.Request(j["url"],method=method,headers={"User-Agent":"HTTP-Cron-GitHubActions/1.0","Accept":"*/*"})
            started=datetime.now(timezone.utc)
            try:
                with urllib.request.urlopen(req,timeout=TIMEOUT) as resp:
                    code=resp.status
                    resp.read(1024)
            except urllib.error.HTTPError as e:
                code=e.code
            due.append({"name":str(j.get("name","Sem nome"))[:80],"status":str(code),"time":started.strftime("%Y-%m-%d %H:%M UTC")})
        except Exception as e:
            due.append({"name":str(j.get("name","Sem nome"))[:80],"status":"Erro: "+str(e)[:100],"time":now.strftime("%Y-%m-%d %H:%M UTC")})
    old=[]
    if os.path.exists(STATUS):
        try:
            with open(STATUS,encoding="utf-8") as f: old=json.load(f).get("results",[])
        except Exception: pass
    # Keep latest result per job, with a compact recent history.
    merged={x.get("name"):x for x in old}
    for x in due: merged[x["name"]]=x
    out={"updated_at":now.strftime("%Y-%m-%d %H:%M UTC"),"results":list(merged.values())[-MAX_JOBS:]}
    with open(STATUS,"w",encoding="utf-8") as f: json.dump(out,f,ensure_ascii=False,indent=2)
    print(json.dumps(due,ensure_ascii=False,indent=2))
if __name__=="__main__": main()
