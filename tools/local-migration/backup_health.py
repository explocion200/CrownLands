#!/usr/bin/python3
"""Report seasonal backup freshness without exposing private backup contents."""
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import math
from pathlib import Path
import time

STATUS_FILE = Path('/var/lib/crownlands-backup/status.json')
COMPLETION_GRACE_SECONDS = 3 * 3600
MAX_RUNNING_SECONDS = 2 * 3600


def required_backup_at(now):
    """Last due backup, allowing three hours for the two-hour backup service."""
    moment = datetime.fromtimestamp(now - COMPLETION_GRACE_SECONDS, timezone.utc)
    first = moment.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    following = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    due = following - timedelta(days=1)
    return (due if due <= moment else first - timedelta(days=1)).timestamp()


def valid_stamp(value, now):
    return (type(value) in (int, float) and math.isfinite(value)
            and 0 < value <= now)


def healthy(status, now):
    if not isinstance(status, dict) or status.get('last_result') != 'success':
        return False
    required = required_backup_at(now)
    for field in ['last_success_at', 'local_success_at'] + (
            ['offsite_success_at'] if status.get('offsite_enabled') else []):
        stamp = status.get(field)
        if not valid_stamp(stamp, now) or stamp < required:
            return False
    if status.get('running'):
        started = status.get('started_at')
        if not valid_stamp(started, now) or now - started > MAX_RUNNING_SECONDS:
            return False
    return True


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != '/backup-healthz':
            self.send_error(404)
            return
        try:
            ok = healthy(json.loads(STATUS_FILE.read_text()), time.time())
        except (OSError, ValueError, TypeError, OverflowError):
            ok = False
        body = b'Crownlands backups are current.\n' if ok else b'Crownlands backups need attention.\n'
        self.send_response(200 if ok else 503)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass


if __name__ == '__main__':
    HTTPServer(('127.0.0.1', 9187), Handler).serve_forever()
