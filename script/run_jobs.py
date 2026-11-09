import json
import os
import socket
import ipaddress
import subprocess
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from urllib.parse import urlparse

CONFIG = "jobs.json"
STATUS = "status.json"
ALLOWED_METHODS = {"GET", "HEAD"}
MAX_JOBS = 1
MAX_HISTORY = 100
TIMEOUT = 10
PUBLISH_EVERY = 5


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def validate_public_url(raw):
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("URL deve usar http:// ou https://")
    if parsed.username or parsed.password:
        raise ValueError("URL não pode conter credenciais")
    try:
        addresses = socket.getaddrinfo(
            parsed.hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
        if not addresses:
            raise ValueError("Domínio não resolveu para um endereço")
        for address in addresses:
            ip = ipaddress.ip_address(address[4][0])
            if not ip.is_global:
                raise ValueError("Destino precisa ser um endereço público")
    except socket.gaierror as exc:
        raise ValueError("Não foi possível resolver o domínio") from exc
    return parsed


def read_status():
    try:
        with open(STATUS, encoding="utf-8") as file:
            data = json.load(file)
        if not isinstance(data.get("results"), list):
            data["results"] = []
        return data
    except (OSError, json.JSONDecodeError):
        return {"updated_at": None, "results": []}


def publish(results):
    if not results:
        return
    data = read_status()
    data["results"].extend(results)
    data["results"] = data["results"][-MAX_HISTORY:]
    data["updated_at"] = utc_now()
    with open(STATUS, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)

    if os.getenv("GITHUB_ACTIONS") == "true":
        subprocess.run(["git", "add", STATUS], check=True)
        changed = subprocess.run(["git", "diff", "--cached", "--quiet"], check=False).returncode != 0
        if changed:
            subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
            subprocess.run(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], check=True)
            subprocess.run(["git", "commit", "-m", "Atualiza histórico HTTP Cron"], check=True)
            subprocess.run(["git", "push"], check=True)


def request_once(job):
    method = str(job.get("method", "GET")).upper()
    result = {
        "name": str(job.get("name", "Sem nome"))[:80],
        "url": str(job.get("url", ""))[:500],
        "method": method,
        "time": utc_now(),
        "status": "FALHA",
        "http_code": None,
        "message": "",
    }
    try:
        if method not in ALLOWED_METHODS:
            raise ValueError("Método permitido nesta versão: GET ou HEAD")
        validate_public_url(str(job.get("url", "")))
        req = urllib.request.Request(
            job["url"], method=method,
            headers={"User-Agent": "HTTP-Cron-GitHubActions/1.0", "Accept": "*/*"},
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                result["http_code"] = response.status
                if method == "GET":
                    response.read(1024)
        except urllib.error.HTTPError as exc:
            result["http_code"] = exc.code
            result["message"] = str(exc.reason)[:160]
        code = result["http_code"]
        if code is not None and 200 <= code < 400:
            result["status"] = "SUCESSO"
            result["message"] = result["message"] or "Resposta HTTP recebida"
        else:
            result["message"] = result["message"] or "Resposta HTTP indica falha"
    except Exception as exc:
        result["message"] = str(exc)[:160]
    return result


def main():
    with open(CONFIG, encoding="utf-8") as file:
        config = json.load(file)
    jobs = [job for job in config.get("jobs", []) if job.get("enabled", False)]
    if len(jobs) > MAX_JOBS:
        raise SystemExit("Esta configuração permite um único destino ativo por execução.")
    if not jobs:
        print("Nenhum agendamento habilitado. Nada a executar.", flush=True)
        return

    job = jobs[0]
    try:
        duration = int(job.get("duration_seconds", 60))
        if duration < 1 or duration > 240:
            raise ValueError("duration_seconds deve ficar entre 1 e 240")
        validate_public_url(str(job.get("url", "")))
    except Exception as exc:
        publish([{
            "name": str(job.get("name", "Sem nome"))[:80],
            "url": str(job.get("url", ""))[:500],
            "method": str(job.get("method", "GET")).upper(),
            "time": utc_now(), "status": "FALHA", "http_code": None,
            "message": str(exc)[:160],
        }])
        raise

    print(f"Iniciando teste controlado por {duration}s, no máximo uma requisição por segundo.", flush=True)
    started = time.monotonic()
    next_request = started
    pending = []
    count = 0
    while time.monotonic() - started < duration:
        wait = next_request - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        if time.monotonic() - started >= duration:
            break
        result = request_once(job)
        pending.append(result)
        count += 1
        print(json.dumps(result, ensure_ascii=False), flush=True)
        next_request += 1.0
        if len(pending) >= PUBLISH_EVERY:
            publish(pending)
            pending = []
    publish(pending)
    print(f"Finalizado: {count} requisição(ões) tentada(s).", flush=True)


if __name__ == "__main__":
    main()
