import json
import os
import socket
import ipaddress
import subprocess
import urllib.request
import urllib.error
from datetime import datetime, timezone
from urllib.parse import urlparse

CONFIG = "jobs.json"
STATUS = "status.json"
ALLOWED_METHODS = {"GET", "HEAD", "POST"}
MAX_JOBS = 20
MAX_HISTORY = 100
TIMEOUT = 15


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def public_http_url(raw):
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("URL deve usar http:// ou https://")
    if parsed.username or parsed.password:
        raise ValueError("URL não pode conter credenciais")
    try:
        addresses = socket.getaddrinfo(
            parsed.hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80)
        )
        for address in addresses:
            ip = ipaddress.ip_address(address[4][0])
            if not ip.is_global:
                raise ValueError("Destino precisa ser um endereço público")
    except socket.gaierror:
        raise ValueError("Não foi possível resolver o domínio")
    return parsed


def read_status():
    if not os.path.exists(STATUS):
        return {"updated_at": None, "results": []}
    try:
        with open(STATUS, encoding="utf-8") as file:
            data = json.load(file)
        if not isinstance(data.get("results"), list):
            data["results"] = []
        return data
    except (OSError, json.JSONDecodeError):
        return {"updated_at": None, "results": []}


def save_and_publish(result):
    data = read_status()
    data["results"].append(result)
    data["results"] = data["results"][-MAX_HISTORY:]
    data["updated_at"] = utc_now()

    with open(STATUS, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)

    # No GitHub Actions, publica cada resultado assim que a requisição termina.
    # Fora do Actions, apenas grava status.json localmente.
    if os.getenv("GITHUB_ACTIONS") == "true":
        subprocess.run(["git", "add", STATUS], check=True)
        changed = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            check=False
        ).returncode != 0
        if changed:
            subprocess.run(
                ["git", "config", "user.name", "github-actions[bot]"],
                check=True
            )
            subprocess.run(
                ["git", "config", "user.email",
                 "41898282+github-actions[bot]@users.noreply.github.com"],
                check=True
            )
            subprocess.run(
                ["git", "commit", "-m", "Atualiza histórico HTTP Cron"],
                check=True
            )
            subprocess.run(["git", "push"], check=True)


def execute_job(job):
    name = str(job.get("name", "Sem nome"))[:80]
    method = str(job.get("method", "GET")).upper()
    started = utc_now()
    result = {
        "name": name,
        "url": str(job.get("url", ""))[:500],
        "method": method,
        "time": started,
        "status": "FALHA",
        "http_code": None,
        "message": ""
    }

    try:
        if method not in ALLOWED_METHODS:
            raise ValueError("Método permitido: GET, HEAD ou POST")
        public_http_url(str(job.get("url", "")))
        request = urllib.request.Request(
            job["url"],
            method=method,
            headers={
                "User-Agent": "HTTP-Cron-GitHubActions/1.0",
                "Accept": "*/*"
            }
        )
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                result["http_code"] = response.status
                if method != "HEAD":
                    response.read(1024)
        except urllib.error.HTTPError as error:
            result["http_code"] = error.code
            result["message"] = str(error.reason)[:160]

        code = result["http_code"]
        if code is not None and 200 <= code < 400:
            result["status"] = "SUCESSO"
            result["message"] = result["message"] or "Resposta HTTP recebida"
        else:
            result["message"] = result["message"] or "Resposta HTTP indica falha"
    except Exception as error:
        result["message"] = str(error)[:160]

    return result


def main():
    with open(CONFIG, encoding="utf-8") as file:
        config = json.load(file)

    jobs = config.get("jobs", [])
    if not isinstance(jobs, list) or len(jobs) > MAX_JOBS:
        raise SystemExit(f"jobs.json deve conter no máximo {MAX_JOBS} itens")

    now = datetime.now(timezone.utc)
    for job in jobs:
        if not job.get("enabled", False):
            continue

        try:
            interval = int(job.get("interval_minutes", 5))
            if interval < 5 or interval > 60 or interval % 5:
                raise ValueError(
                    "interval_minutes deve ser múltiplo de 5, entre 5 e 60"
                )
            if now.minute % interval != 0:
                continue
        except Exception as error:
            result = {
                "name": str(job.get("name", "Sem nome"))[:80],
                "url": str(job.get("url", ""))[:500],
                "method": str(job.get("method", "GET")).upper(),
                "time": utc_now(),
                "status": "FALHA",
                "http_code": None,
                "message": str(error)[:160]
            }
        else:
            result = execute_job(job)

        print(json.dumps(result, ensure_ascii=False), flush=True)
        save_and_publish(result)


if __name__ == "__main__":
    main()
