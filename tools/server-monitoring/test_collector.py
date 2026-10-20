"""Offline tests: never contact the running game/database or alter host config."""
from datetime import datetime, timezone
from configparser import ConfigParser
from importlib.machinery import SourceFileLoader
from importlib.util import module_from_spec, spec_from_loader
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parent
loader = SourceFileLoader('crownlands_metrics', str(ROOT / 'crownlands.plugin'))
spec = spec_from_loader(loader.name, loader)
plugin = module_from_spec(spec)
loader.exec_module(plugin)
NOW = 1792500000
STAMP = datetime.fromtimestamp(NOW, timezone.utc).isoformat()


class CollectorTests(unittest.TestCase):
    def good(self):
        return {'recordedAt': STAMP, 'components': {
            name: {'healthy': True} for name in plugin.COMPONENTS}}

    def test_good_health_queues_and_no_private_fields(self):
        receipt = self.good()
        receipt['components']['workers'].update(
            dead=2, overdue=3, stalled=0, scheduleLagMinutes=0.25,
            handlerErrors=0, failedOutcomes=0, secret='DO_NOT_EXPOSE')
        receipt['private'] = 'DO_NOT_EXPOSE'
        result = plugin.sample(receipt, {'status': 'current', 'checkedAt': STAMP}, True, NOW)
        self.assertTrue(all(v == 1 for v in result['health'].values()))
        self.assertEqual(result['queues']['worker_dead'], 2)
        self.assertEqual(result['worker_lag']['lag'], 250)
        self.assertEqual(result['publisher']['current'], 1)
        self.assertNotIn('DO_NOT_EXPOSE', plugin.render(result))

    def test_stale_and_future_status_fail_closed_with_queue_gaps(self):
        for now in (NOW + 91, NOW - 1):
            result = plugin.sample(self.good(), {'status': 'current', 'checkedAt': STAMP}, False, now)
            self.assertTrue(all(v == 0 for v in result['health'].values()))
            self.assertEqual(result['queues'], {})
            self.assertEqual(result['worker_lag'], {})

    def test_malformed_receipts_and_unsafe_metric_values(self):
        for components in (None, [], {'workers': ['bad']}):
            result = plugin.sample({'recordedAt': STAMP, 'components': components}, {}, False, NOW)
            self.assertEqual(result['health']['workers'], 0)
        for bad in (True, -1, float('nan'), float('inf'), 10**1000, '1\nSET injected=1'):
            receipt = self.good()
            receipt['components']['workers'].update(dead=bad, scheduleLagMinutes=bad)
            result = plugin.sample(receipt, {}, False, NOW)
            self.assertNotIn('worker_dead', result['queues'])
            self.assertEqual(result['worker_lag'], {})

    def test_missing_invalid_and_oversized_files(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'receipt.json'
            self.assertEqual(plugin.read_receipt(path), {})
            for value in ('bad json', '[]', '{"secret":"' + 'x'*32768 + '"}'):
                path.write_text(value)
                self.assertEqual(plugin.read_receipt(path), {})
            path.write_text('{"recordedAt":"' + STAMP + '"}')
            self.assertTrue(plugin.fresh(plugin.read_receipt(path), 'recordedAt', NOW, 90))

    def test_deploy_states_and_staleness(self):
        for status, key in (('deployed', 'current'), ('current', 'current'),
                            ('waiting-for-github-build', 'waiting'), ('verified-ready', 'waiting'),
                            ('held', 'held'), ('paused', 'held'), ('error', 'error')):
            result = plugin.sample({}, {'status': status, 'checkedAt': STAMP}, False, NOW)
            self.assertEqual(result['publisher'][key], 1)
            self.assertEqual(sum(result['publisher'].values()), 2)
        result = plugin.sample({}, {'status': 'current', 'checkedAt': STAMP}, False, NOW+901)
        self.assertTrue(all(v == 0 for v in result['publisher'].values()))

    def test_backup_policy_is_reused_and_unreachable_is_unhealthy(self):
        with patch.object(plugin, 'build_opener') as opener:
            response = opener.return_value.open.return_value.__enter__.return_value
            response.status = 200
            self.assertTrue(plugin.backup_healthy())
            opener.return_value.open.assert_called_with(
                'http://127.0.0.1:9187/backup-healthz', timeout=1)
            response.status = 503
            self.assertFalse(plugin.backup_healthy())
            opener.return_value.open.side_effect = OSError('not available')
            self.assertFalse(plugin.backup_healthy())

    def test_native_protocol_balanced_and_gap_not_false_zero(self):
        definitions = plugin.definitions(10)
        self.assertEqual(definitions.count('CHART crownlands.'), 4)
        self.assertIn('DIMENSION lag lag absolute 1 1000', definitions)
        output = plugin.render(plugin.sample({}, {}, False, NOW))
        self.assertEqual(output.count('BEGIN '), output.count('END'))
        self.assertNotIn('SET worker_dead', output)
        self.assertIn('SET status_fresh = 0', output)

    def test_private_bindings_and_bounded_resources(self):
        config = ConfigParser()
        config.read(ROOT / 'netdata.conf')
        bindings = config['web']['bind to'].split()
        self.assertEqual(len(bindings), 3)
        self.assertEqual({entry.split(':')[0] for entry in bindings},
                         {'127.0.0.1', '192.168.1.145', '100.114.92.30'})
        self.assertTrue(all(entry.endswith(':19999=dashboard') for entry in bindings))
        # Netdata normalizes loopback peers to "localhost" before ACL matching.
        self.assertIn('localhost', config['web']['allow connections from'].split())
        self.assertNotIn('*', config['web']['allow connections from'].split())
        self.assertEqual(config['web']['allow connections by dns'], 'no')
        self.assertEqual(config['plugins']['enable running new plugins'], 'no')
        self.assertEqual(config['ml']['enabled'], 'no')
        self.assertEqual(config['health']['script to execute on alarm'], '/bin/true')
        config = ConfigParser(strict=False, interpolation=None)
        config.read(ROOT / 'private.conf')
        self.assertEqual(config['Service']['MemoryMax'], '1G')
        self.assertEqual(config['Service']['CPUQuota'], '50%')
        self.assertEqual(config['Service']['IPAddressDeny'], 'any')
        self.assertIn('DISABLE_TELEMETRY=1', config['Service']['Environment'])
        # Repeated IPAddressAllow is valid systemd syntax, unlike ConfigParser.

    def test_database_profile_is_stats_only(self):
        sql = (ROOT / 'monitor-role.sql').read_text()
        grants = [line.strip() for line in sql.splitlines() if line.startswith('GRANT')]
        self.assertEqual(grants, ['GRANT pg_monitor TO netdata;',
                                 'GRANT CONNECT ON DATABASE crownlands_migration TO netdata;'])
        self.assertIn('CONNECTION LIMIT 3', sql)
        self.assertIn('default_transaction_read_only = on', sql)
        self.assertIn("statement_timeout = '2s'", sql)
        postgres = (ROOT / 'postgres.conf').read_text()
        self.assertIn('host=/var/run/postgresql', postgres)
        self.assertNotIn('password', postgres.lower())
        self.assertIn('top_queries:\n        disabled: true', postgres)
        self.assertIn('update_every: 10', postgres)
        go = (ROOT / 'go.d.conf').read_text()
        self.assertIn('default_run: no', go)
        self.assertIn('  postgres: yes', go)


if __name__ == '__main__':
    unittest.main()
