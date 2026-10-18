FROM python:3.11-slim
WORKDIR /srv/app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    IMA_SKILL_SCRIPT=/opt/ima-skill/ima_api.cjs KNOWLEDGE_SOURCE=ima
RUN apt-get update && apt-get install -y --no-install-recommends nodejs ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt
# ima official skill; only program code, never local credentials or organizer's knowledge archive.
RUN python -c "import urllib.request,zipfile,io,pathlib; p=pathlib.Path('/opt'); z=zipfile.ZipFile(io.BytesIO(urllib.request.urlopen('https://app-dl.ima.qq.com/skills/ima-skills-1.1.10.zip',timeout=60).read())); [(p/n).parent.mkdir(parents=True,exist_ok=True) or (p/n).write_bytes(z.read(n)) for n in z.namelist() if n.startswith('ima-skill/') and not n.endswith('/') and '..' not in pathlib.PurePosixPath(n).parts]"
COPY . .
EXPOSE 7860
# Existing app binds to localhost:8765; adapter exposes 0.0.0.0:7860 without modifying project internals.
CMD ["sh", "-c", "python -m app --port 8765 & exec python deploy/modelscope_proxy.py"]
