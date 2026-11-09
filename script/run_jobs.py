import json, socket, ipaddress, time, urllib.request, urllib.error
from datetime import datetime, timezone
from urllib.parse import urlparse

MAX_DURATION = 240
REQUEST_TIMEOUT = 0.8
RATE_SECONDS = 1.0

def validate_public_url(raw):
    p = urlparse(raw)
    if p.scheme not in ('http', 'https') or not p.hostname:
        raise ValueError('URL deve usar http:// ou https://')
    if p.username or p.password:
        raise ValueError('URL não pode conter credenciais')
    infos = socket.getaddrinfo(p.hostname, p.port or (443 if p.scheme == 'https' else 80))
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise ValueError('O destino precisa ter endereço IP público')

def main():
    with open('jobs.json', encoding='utf-8') as f:
        cfg = json.load(f)
    jobs = [j for j in cfg.get('jobs', []) if j.get('enabled', False)]
    if len(jobs) != 1:
        raise SystemExit('Ative exatamente um destino em jobs.json para executar o teste.')
    job = jobs[0]
    method = str(job.get('method', 'GET')).upper()
    if method not in ('GET', 'HEAD'):
        raise SystemExit('Métodos permitidos: GET e HEAD.')
    url = str(job.get('url', '')).strip()
    validate_public_url(url)
    duration = int(job.get('duration_seconds', 60))
    if not 1 <= duration <= MAX_DURATION:
        raise SystemExit(f'duration_seconds deve estar entre 1 e {MAX_DURATION}.')
    name = str(job.get('name', 'Meu site'))[:80]
    total = ok = errors = 0
    codes = {}
    start = time.monotonic()
    next_tick = start
    print(f'Iniciando {name}: {method} {url} | até 1 requisição/s | {duration}s')
    while time.monotonic() - start < duration:
        delay = next_tick - time.monotonic()
        if delay > 0:
            time.sleep(delay)
        if time.monotonic() - start >= duration:
            break
        total += 1
        req = urllib.request.Request(url, method=method, headers={'User-Agent':'HTTP-Cron-GitHubActions/1.0','Accept':'*/*'})
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as response:
                code = response.status
                response.read(256)
            ok += 1
        except urllib.error.HTTPError as e:
            code = e.code
            errors += 1
        except Exception as e:
            code = 'ERR'
            errors += 1
            print(f'Requisição {total}: {str(e)[:180]}')
        codes[str(code)] = codes.get(str(code), 0) + 1
        print(f'Requisição {total}: HTTP {code}')
        next_tick += RATE_SECONDS
        if next_tick < time.monotonic():
            next_tick = time.monotonic() + RATE_SECONDS
    summary = f'{total} tentativas; {ok} respostas; {errors} erros; códigos: {codes}'
    result = {'name':name,'summary':summary,'total':total,'success':ok,'errors':errors,'codes':codes,'time':datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}
    try:
        with open('status.json', encoding='utf-8') as f:
            old = json.load(f).get('results', [])
    except Exception:
        old = []
    old = [x for x in old if x.get('name') != name]
    old.append(result)
    with open('status.json', 'w', encoding='utf-8') as f:
        json.dump({'results':old[-20:]}, f, ensure_ascii=False, indent=2)
    print(summary)

if __name__ == '__main__':
    main()
