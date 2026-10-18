FROM python:3.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WORKBENCH_HOST=0.0.0.0 \
    WORKBENCH_PORT=7860 \
    IMA_SKILL_SCRIPT=/opt/ima/ima-skill/ima_api.cjs

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl nodejs unzip \
    && rm -rf /var/lib/apt/lists/*

# The public official Skill is fetched during the build; no credentials enter the image.
RUN curl --fail --show-error --silent --location \
      https://app-dl.ima.qq.com/skills/ima-skills-1.1.10.zip \
      --output /tmp/ima-skills.zip \
    && mkdir -p /opt/ima \
    && unzip -q /tmp/ima-skills.zip -d /opt/ima \
    && test -f /opt/ima/ima-skill/ima_api.cjs \
    && rm /tmp/ima-skills.zip

WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt
COPY agent ./agent
COPY app ./app
COPY contracts ./contracts
COPY ima ./ima
COPY prompts ./prompts

RUN useradd --system --create-home --uid 10001 workbench
USER workbench
EXPOSE 7860
CMD ["python", "-m", "app"]
