# Deployment

Concord runs as a single Node process serving both the API and the built React app, with a SQLite database and uploaded PDFs in one data directory. Put a reverse proxy in front for HTTPS. Everything is configured from `.env`.

## Docker (recommended)

```bash
git clone https://github.com/Badmavasan/concord.git && cd concord
cp .env.example .env
nano .env                       # at least JWT_SECRET and APP_URL; SMTP if you want email
mkdir -p storage import
docker compose up -d --build    # listens on 127.0.0.1:4700
```

- `storage/` is mounted at `/data` in the container and holds `data.sqlite`, `uploads/` and the generated session secret. Back this folder up.
- `import/` is mounted read-only at `/import` for files you feed to the [command line](cli.md).
- The container listens on 4321 internally and is published on `HOST_PORT` (default 4700) bound to loopback, so only the reverse proxy on the same host can reach it. Set `BIND=0.0.0.0` in `.env` to expose it directly.
- The image runs as the unprivileged `node` user; an entrypoint fixes ownership of the data directory on start, so a root-owned bind mount is not a problem.

## Reverse proxy

### nginx

Two steps, because the full site file names certificate files that do not exist until the first issuance:

```bash
sudo cp deploy/nginx/concord-bootstrap.conf /etc/nginx/sites-available/concord   # HTTP only
sudo ln -sf /etc/nginx/sites-available/concord /etc/nginx/sites-enabled/concord
sudo mkdir -p /var/www/certbot && sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d concord.example.org
sudo cp deploy/nginx/concord.conf /etc/nginx/sites-available/concord             # full HTTPS site
sudo nginx -t && sudo systemctl reload nginx
```

Replace `concord.example.org` in both files with your hostname. The full site proxies to 127.0.0.1:4700, allows 120 MB uploads, rate-limits the authentication routes, and forwards `X-Forwarded-Proto` and `X-Forwarded-Host`, which the app needs to mark cookies Secure and to check request origins.

### Caddy

`deploy/Caddyfile` is the equivalent with automatic certificates: change the hostname and run `caddy run --config deploy/Caddyfile`.

## Without Docker

```bash
npm run install:all && npm run build
cp .env.example .env && nano .env         # set PORT (default 4700), JWT_SECRET, APP_URL
sudo cp deploy/concord.service /etc/systemd/system/   # adjust paths and user
sudo systemctl daemon-reload && sudo systemctl enable --now concord
```

Data lives in `server/` unless `DATA_DIR` is set.

## Configuration reference

| Variable | Purpose | Default |
|---|---|---|
| `JWT_SECRET` | Signs session cookies. If unset, a random secret is generated once and kept in the data directory. | generated |
| `APP_URL` | Public URL, used in every emailed link and to decide whether cookies are marked Secure. | request host |
| `PORT` | Listening port for bare installs. | 4321 |
| `HOST_PORT` | Docker: host port published on loopback. | 4700 |
| `BIND` | Docker: host address to bind. | 127.0.0.1 |
| `DATA_DIR` | Where the database and uploads live. | `server/` (Docker: `/data`) |
| `OPEN_REGISTRATION` | `true` lets anyone create an account on the sign-in page; `false` restricts to invitations. | true |
| `COOKIE_SECURE` | Force the Secure cookie flag on or off. | on when `APP_URL` is https |
| `TRUST_PROXY` | `false` if the app is not behind a reverse proxy. | true |
| `LINK_TTL_HOURS` | Lifetime of invitation and reset links. | 24 |
| `SMTP_*`, `MAIL_FROM`, `MAIL_REPLY_TO` | Outgoing email, see [email](email.md). | unset (no email) |

## First account

With open registration, create it on the sign-in page. Otherwise:

```bash
docker compose exec -u node app node cli.js user add you@example.org "Your Name" --password '…'
```

## Updating

```bash
cd concord && git pull
docker compose up -d --build
```

Schema changes are applied automatically at start (new tables and columns only; nothing is dropped).

## Backups

Everything is in the data directory: `data.sqlite` (with its `-wal` and `-shm` companions while running), `uploads/`, and `.jwt-secret`. Stop the container or use `sqlite3 data.sqlite ".backup out.sqlite"` for a consistent copy of the database, then copy `uploads/`.
