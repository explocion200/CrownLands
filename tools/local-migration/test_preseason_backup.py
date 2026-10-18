from datetime import datetime, timezone
from http.server import HTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

import backup_health as health


def stamp(text):
    return datetime.fromisoformat(text.replace('Z', '+00:00')).timestamp()


def status(at):
    return dict(last_result='success', running=False, offsite_enabled=True,
                last_success_at=at, local_success_at=at, offsite_success_at=at)


class SeasonalBackupTests(unittest.TestCase):
    def test_calendar_boundaries_and_completion_grace(self):
        for boundary, prior in [
            ('2026-10-31', '2026-09-30'), ('2026-11-30', '2026-10-31'),
            ('2027-02-28', '2027-01-31'), ('2028-02-29', '2028-01-31'),
            ('2027-01-31', '2026-12-31'), ('2026-12-31', '2026-11-30'),
            ('2027-03-31', '2027-02-28'),
        ]:
            due, previous = stamp(boundary + 'T00:00:00Z'), stamp(prior + 'T00:00:00Z')
            with self.subTest(boundary=boundary):
                self.assertEqual(health.required_backup_at(due - 1), previous)
                self.assertEqual(health.required_backup_at(due + 3 * 3600 - 1), previous)
                self.assertEqual(health.required_backup_at(due + 3 * 3600), due)
                old = status(previous + 3600)
                self.assertTrue(health.healthy(old, due + 3 * 3600 - 1))
                self.assertFalse(health.healthy(old, due + 3 * 3600))
                self.assertTrue(health.healthy(status(due + 3600), due + 3 * 3600))

    def test_existing_copy_stays_healthy_until_next_due_date(self):
        existing = status(stamp('2026-10-18T17:26:17Z'))
        self.assertTrue(health.healthy(existing, stamp('2026-10-30T20:00:00-04:00')))
        self.assertFalse(health.healthy(existing, stamp('2026-10-31T03:00:00Z')))

    def test_failed_stale_cloud_stalled_and_invalid_status_alert(self):
        now = stamp('2026-11-03T12:00:00Z')
        good = status(stamp('2026-10-31T01:00:00Z'))
        self.assertTrue(health.healthy(good, now))
        for change in [dict(last_result='failed'), dict(last_success_at=now + 1),
                       dict(offsite_success_at=stamp('2026-10-18T00:00:00Z')),
                       dict(local_success_at=0), dict(running=True, started_at=now - 7201),
                       dict(running=True, started_at=now + 1)]:
            self.assertFalse(health.healthy({**good, **change}, now))
        for value in [None, 'secret', float('nan'), float('inf'), True, [], {}]:
            self.assertFalse(health.healthy({**good, 'last_success_at': value}, now))
        self.assertFalse(health.healthy([], now))
        self.assertTrue(health.healthy({**good, 'running': True, 'started_at': now - 10}, now))
        self.assertTrue(health.healthy({**good, 'offsite_enabled': False,
                                       'offsite_success_at': None}, now))

    def test_public_endpoint_is_private_and_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'status.json'
            now = stamp('2026-10-20T12:00:00Z')
            with patch.object(health, 'STATUS_FILE', file), patch.object(health.time, 'time', return_value=now):
                server = HTTPServer(('127.0.0.1', 0), health.Handler)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    url = f'http://127.0.0.1:{server.server_port}/backup-healthz'
                    for value, expected in [(json.dumps(status(now - 100)), 200),
                                            ('{"error":"PRIVATE-CANARY"}', 503),
                                            ('invalid PRIVATE-CANARY', 503), ('[]', 503), (None, 503)]:
                        if value is None:
                            file.unlink()
                        else:
                            file.write_text(value)
                        try:
                            response = urllib.request.urlopen(url, timeout=3)
                        except urllib.error.HTTPError as error:
                            response = error
                        with response:
                            self.assertEqual(response.status, expected)
                            self.assertEqual(response.headers['Cache-Control'], 'no-store')
                            self.assertNotIn(b'PRIVATE-CANARY', response.read())
                    with self.assertRaises(urllib.error.HTTPError) as caught:
                        urllib.request.urlopen(url + '/private', timeout=3)
                    self.assertEqual(caught.exception.code, 404)
                finally:
                    server.shutdown()
                    server.server_close()
                    thread.join()


if __name__ == '__main__':
    unittest.main()
