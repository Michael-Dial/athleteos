# AthleteOS deploy notes (homelab)

- **App port: 3020** on the Docker host (`192.168.8.222` via Proxmox NAT).
- A temporary placeholder nginx container (`athleteos-placeholder`, image
  `nginx:alpine`) currently binds 0.0.0.0:3020 and serves
  `/opt/data/docker/athleteos/placeholder/index.html` so the Cloudflare URL
  stays live. **The first real deploy must remove it** before binding 3020:
  `docker rm -f athleteos-placeholder`
- Open Wearables backend is NOT part of this stack: it runs separately at
  `http://192.168.8.222:8000` (API at `/api/v1`, OpenAPI at `/openapi.json`).
- Public URL `https://athleteos.dialedup.info` → Cloudflare Tunnel →
  `http://192.168.8.222:3020` (tunnel 181a3b12-f681-4f69-a58c-b148eec426fe).
- Compose file at `/opt/data/docker/athleteos/docker-compose.yml`; Postgres
  data lands in `/opt/data/docker/athleteos/data/db`.
