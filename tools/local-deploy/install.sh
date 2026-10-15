#!/usr/bin/bash
# Run only from a reviewed private setup bundle containing checksums and config.
set -Eeuo pipefail
BUNDLE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
if (( EUID != 0 )); then exec pkexec /usr/bin/bash "$BUNDLE/install.sh"; fi
cd "$BUNDLE"
sha256sum --check --quiet SHA256SUMS
[[ ! -e /etc/crownlands-deploy/config.json ]] || {
  echo 'A publisher is already installed. Review its configuration before reinstalling.' >&2
  exit 1
}
python3 - "$BUNDLE" <<'PY'
import hashlib,json,sys
from pathlib import Path
p=Path(sys.argv[1]); config=json.loads((p/'config.json').read_text())
if str(Path('/srv/crownlands/current').resolve()) != config['initialRelease']:
    raise SystemExit('Current release changed since preparation; recheck compatibility.')
if hashlib.sha256(Path('/etc/caddy/Caddyfile').read_bytes()).hexdigest() != config['caddyBeforeHash']:
    raise SystemExit('Caddy changed since preparation; recheck configuration.')
PY
caddy validate --config "$BUNDLE/Caddyfile" --adapter caddyfile
BACKUP="/var/backups/crownlands/deploy-setup-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$BACKUP"
cp -a /etc/caddy/Caddyfile "$BACKUP/Caddyfile"
readlink /srv/crownlands/current > "$BACKUP/release.txt"
install -d -o root -g root -m 0755 /usr/local/lib/crownlands-deploy /etc/crownlands-deploy /var/lib/crownlands-deploy
install -o root -g root -m 0644 publisher.py /usr/local/lib/crownlands-deploy/publisher.py
install -o root -g root -m 0755 gh /usr/local/lib/crownlands-deploy/gh
install -o root -g root -m 0644 config.json /etc/crownlands-deploy/config.json
install -o root -g root -m 0644 crownlands-deploy.service crownlands-deploy.timer /etc/systemd/system/
install -o root -g root -m 0644 Caddyfile /etc/caddy/Caddyfile
if ! systemctl reload caddy; then
  install -m 0644 "$BACKUP/Caddyfile" /etc/caddy/Caddyfile
  systemctl reload caddy
  echo "Caddy reload failed; restored configuration from $BACKUP." >&2
  exit 1
fi
python3 - <<'PY'
from pathlib import Path
p=Path('/etc/crownlands-backup/sources.txt')
if p.exists():
    existing=p.read_text().splitlines()
    for item in ('/usr/local/lib/crownlands-deploy','/etc/crownlands-deploy','/var/lib/crownlands-deploy'):
        if item not in existing: existing.append(item)
    p.write_text('\n'.join(existing)+'\n')
PY
systemctl daemon-reload
systemctl enable --now crownlands-deploy.timer
systemctl start crownlands-deploy.service
systemctl is-active caddy crownlands-deploy.timer
cat /var/lib/crownlands-deploy/status.json
echo "Automatic publisher installed. Setup backup: $BACKUP"
