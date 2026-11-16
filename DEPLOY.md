# AthleteOS deploy notes (homelab)

- **App port: 3020** on the Docker host (`192.168.8.222` via Proxmox NAT).
- **A temporary placeholder nginx container (`athleteos-placeholder`) binds
  0.0.0.0:3020. The first real deploy must remove it before starting the app:**
  `docker rm -f athleteos-placeholder`
- **Auto-update pipeline (the reason there is no `build:` in docker-compose.yml):**
  1. Every push to `main` runs `.github/workflows/docker.yml`, which builds
     `src/Dockerfile` on a hosted runner and pushes
     `ghcr.io/michael-dial/athleteos:latest` (+ `:sha-<short>`). The package is
     public. Merging to main IS the deploy step.
  2. The homelab watchtower (global scope, 5-minute schedule) recreates the
     `athleteos-app` container when a new digest appears.
  3. A Portainer git-stack named `athleteos` (endpoint 4) tracks this repo's
     `docker-compose.yml` with AutoUpdate every 5m, so compose/env changes
     redeploy too. CI still validates the compose file on every push.
  4. Local source builds: `docker compose -f docker-compose.yml
     -f docker-compose.build.yml up -d --build`.
- Open Wearables backend is NOT part of this stack: it runs separately at
  `http://192.168.8.222:8000` (API at `/api/v1`, OpenAPI at `/openapi.json`).
- Public URL `https://athleteos.dialedup.info` → Cloudflare Tunnel →
  `http://192.168.8.222:3020` (tunnel 181a3b12-f681-4f69-a58c-b148eec426fe).
- Postgres data lives in the named volume `postgres_data` (compose project
  `athleteos`), not a host bind.
- Never bind host ports other than 3020 for this stack.

