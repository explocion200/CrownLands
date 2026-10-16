import copy
import unittest
from datetime import datetime, timezone
import handover_checks as h

REALM={'worldId':'main-realm-2026-10','resetGeneration':'realm-2026-10','sharedRealmId':'shard_0001'}
def typed(value):
    if type(value) is bool:return {'booleanValue':value}
    if type(value) is int:return {'integerValue':str(value)}
    return {'stringValue':value}
def doc(path,**values):return {'name':h.ROOT+path,'fields':{k:typed(v) for k,v in values.items()}}
def current(path,**values):return doc(path,**{**REALM,**values})
def timestamp(seconds):return datetime.fromtimestamp(seconds,timezone.utc).isoformat()
T=h.stamp('2026-10-16T02:00:00Z')

def execution_logs(jobs,observed):
    result={}
    for job in jobs:
        scheduled=h.stamp(job['lastAttemptTime'])
        common={'logName':'projects/'+h.PROJECT+'/logs/cloudscheduler.googleapis.com%2Fexecutions',
            'resource':{'type':'cloud_scheduler_job','labels':{'project_id':h.PROJECT,'location':'us-central1',
                'job_id':job['name'].split('/')[-1]}},'severity':'INFO'}
        payload={'jobName':job['name'],'targetType':'HTTP','url':job['httpTarget']['uri']}
        result[job['name']]={'from':timestamp(scheduled-600),'through':timestamp(observed),'entries':[
            {**copy.deepcopy(common),'timestamp':timestamp(scheduled+2.05),'jsonPayload':{**payload,
                '@type':'type.googleapis.com/google.cloud.scheduler.logging.AttemptStarted','scheduledTime':timestamp(scheduled)}},
            {**copy.deepcopy(common),'timestamp':timestamp(scheduled+2),'jsonPayload':{**payload,
                '@type':'type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished'},'httpRequest':{'status':200}}]}
    return result

class HandoverTests(unittest.TestCase):
    def test_current_only_and_global_orders(self):
        data=[current('realmConfig/current'),current('dailyMissionEvents/old',resetGeneration='realm-2026-09',uid='old'),
            doc('crownPaymentOrders/live',status='confirmed',sessionId='cs_live_fixture'),
            doc('crownPaymentTestOrders/test',status='expired')]
        before=copy.deepcopy(data);result=h.inspect_documents(iter(data),REALM)
        h.require_drained_inventory(result);self.assertEqual(result['documents'],4);self.assertEqual(len(result['orders']),2)
        self.assertEqual(data,before)

    def test_every_pending_receipt_blocks(self):
        fixtures=[('dailyMissions',current('dailyMissionEvents/a',uid='p',seasonalAchievementProcessedAtMs=5)),
            ('seasonalActions',current('dailyMissionEvents/a',uid='p',processedAtMs=5)),
            ('ownership',current('realmEvents/shard/ownershipChanges/a',status='pending')),
            ('pvpKills',current('pvpKillEvents/shard/events/a',processedAtMs=0)),
            ('battleReceipts',current('reinforcementBattleReceipts/shard/entries/a',status='pending',contributorUid='p')),
            ('battleReceipts',current('rallyBattleReceipts/shard/entries/a',status='pending',contributorUid='p')),
            ('seasonalRealmEvents',current('realmEvents/shard/activity/a',eventType='citadel_captured',attackerPlayerId='p'))]
        for name,event in fixtures:
            with self.subTest(name=name,event=event['name']):
                result=h.inspect_documents([current('realmConfig/current'),event],REALM)
                self.assertEqual(result['pending'][name],1)
                with self.assertRaises(ValueError):h.require_drained_inventory(result)

    def test_completed_receipts_and_unrelated_paths(self):
        events=[current('dailyMissionEvents/a',uid='p',processedAtMs=5,seasonalAchievementProcessedAtMs=6),
            current('realmEvents/s/ownershipChanges/a',status='processed'),current('pvpKillEvents/s/events/a',processedAtMs=5),
            current('rallyBattleReceipts/s/entries/a',status='processed',contributorUid='p'),
            current('realmEvents/s/activity/a',eventType='CHAT',attackerPlayerId='p'),current('unrelated/a',status='pending')]
        h.require_drained_inventory(h.inspect_documents([current('realmConfig/current'),*events],REALM))

    def test_pending_purchase_and_review_block(self):
        for fields in [{'status':'awaiting_payment'},{'status':'confirmed','reviewRequired':True},{'status':'unknown'}]:
            result=h.inspect_documents([current('realmConfig/current'),doc('crownPaymentOrders/a',**fields)],REALM)
            with self.assertRaises(ValueError):h.require_drained_inventory(result)

    def test_missing_changed_foreign_duplicate_pointer(self):
        pointer=current('realmConfig/current')
        for docs in [[],[current('realmConfig/current',worldId='main-realm-2026-09')],
            [pointer,pointer],[{'name':'projects/foreign/documents/a/b','fields':{}}]]:
            with self.assertRaises(ValueError):h.inspect_documents(docs,REALM)

    def test_duplicate_orders_and_malformed_fields(self):
        order=doc('crownPaymentOrders/a',status='confirmed')
        with self.assertRaises(ValueError):h.inspect_documents([current('realmConfig/current'),order,order],REALM)
        bad=current('dailyMissionEvents/a',uid='p');bad['fields']['processedAtMs']={'mapValue':{}}
        with self.assertRaises(ValueError):h.inspect_documents([current('realmConfig/current'),bad],REALM)

    def schedules(self):
        routes=[{'name':'task'+str(i),'schedule':'every 1 minutes','timeZone':'Etc/UTC'} for i in range(16)]
        jobs=[{'name':'projects/'+h.PROJECT+'/locations/us-central1/jobs/firebase-schedule-'+r['name']+'-us-central1',
            'state':'PAUSED','status':{},'schedule':r['schedule'],'timeZone':r['timeZone'],
            'lastAttemptTime':timestamp(T-60),'scheduleTime':timestamp(T+60),
            'httpTarget':{'httpMethod':'POST','uri':'https://'+r['name']+'-example-uc.a.run.app'}} for r in routes]
        return jobs,routes

    def test_schedule_cursors_are_deterministic_and_no_replay(self):
        jobs,routes=self.schedules();before=copy.deepcopy(jobs)
        result=h.scheduler_cursors(jobs,routes,timestamp(T),timestamp(T+610),self.schedules()[0])
        self.assertEqual(len(result),16);self.assertTrue(all(r['lastMinute']==(T-60)//60 for r in result));self.assertEqual(jobs,before)
        self.assertEqual(result,h.scheduler_cursors(list(reversed(jobs)),routes,timestamp(T),timestamp(T+610),self.schedules()[0]))

    def test_schedule_errors_and_drift_stop(self):
        for edit in [lambda j:j.update(state='ENABLED'),lambda j:j.update(status={'code':4}),lambda j:j.pop('status'),
            lambda j:j.update(schedule='every 5 minutes'),lambda j:j.update(lastAttemptTime=timestamp(T+1)),
            lambda j:j.update(scheduleTime=timestamp(T-120)),lambda j:j.update(pubsubTarget={}),
            lambda j:j['httpTarget'].update(uri='https://attacker.example/')]:
            jobs,routes=self.schedules();edit(jobs[0])
            if 'pubsubTarget' in jobs[0]:jobs[0]['pubsubTarget']={'topicName':'unknown'}
            with self.assertRaises(ValueError):h.scheduler_cursors(jobs,routes,timestamp(T),timestamp(T+610),self.schedules()[0])
        jobs,routes=self.schedules();jobs[-1]=jobs[0]
        with self.assertRaises(ValueError):h.scheduler_cursors(jobs,routes,timestamp(T),timestamp(T+610),self.schedules()[0])

    def test_paused_jobs_use_complete_logged_attempts_not_cleared_metadata(self):
        jobs,routes=self.schedules();planned=copy.deepcopy(jobs)
        logs=execution_logs(planned,T+610)
        for job in jobs:
            job['status']={'code':-1};job.pop('lastAttemptTime');job.pop('scheduleTime')
        with self.assertRaises(ValueError):h.scheduler_cursors(jobs,routes,timestamp(T),timestamp(T+610),planned)
        result=h.scheduler_cursors(jobs,routes,timestamp(T),timestamp(T+610),planned,logs)
        self.assertEqual(len(result),16)
        self.assertTrue(all(r['lastMinute']==(T-60)//60 for r in result))
        key=planned[0]['name'];pair=copy.deepcopy(logs[key]['entries'])
        pair[0]['jsonPayload']['scheduledTime']=timestamp(T-30)
        pair[0]['timestamp']=timestamp(T-28);pair[1]['timestamp']=timestamp(T-29)
        logs[key]['entries']+=pair
        result=h.scheduler_cursors(jobs,routes,timestamp(T),timestamp(T+610),planned,logs)
        self.assertEqual(result[0]['lastMinute'],int((T-30)//60))
        logs[key]['entries'][1]['timestamp']=timestamp(T-29.5)
        with self.assertRaisesRegex(ValueError,'overlapping'):
            h.scheduler_cursors(jobs,routes,timestamp(T),timestamp(T+610),planned,logs)
        logs=execution_logs(planned,T+610);logs[key]['entries'].append(pair[0])
        with self.assertRaisesRegex(ValueError,'completion'):
            h.scheduler_cursors(jobs,routes,timestamp(T),timestamp(T+610),planned,logs)

    def test_missing_failed_ambiguous_and_foreign_execution_evidence_is_rejected(self):
        jobs,routes=self.schedules();planned=copy.deepcopy(jobs);key=jobs[0]['name']
        edits=[lambda e:e['entries'].pop(),lambda e:e['entries'].pop(0),
            lambda e:e['entries'].append(copy.deepcopy(e['entries'][0])),
            lambda e:e['entries'][1]['httpRequest'].update(status=500),
            lambda e:e['entries'][1]['jsonPayload'].update(status='UNAVAILABLE'),
            lambda e:e['entries'][1]['resource']['labels'].update(project_id='other'),
            lambda e:e['entries'][1]['jsonPayload'].update(url='https://other.example/'),
            lambda e:e['entries'][0]['jsonPayload'].update(scheduledTime=timestamp(T+1)),
            lambda e:e.update(through=timestamp(T)),
            lambda e:e['entries'][1].update(timestamp=timestamp(T+601))]
        for edit in edits:
            logs=execution_logs(planned,T+610);edit(logs[key])
            with self.assertRaises(ValueError):h.scheduler_cursors(jobs,routes,timestamp(T),timestamp(T+610),planned,logs)
        logs=execution_logs(planned,T+610);logs.pop(key)
        with self.assertRaises(ValueError):h.scheduler_cursors(jobs,routes,timestamp(T),timestamp(T+610),planned,logs)

    def series(self):
        names=['event'+str(i) for i in range(10)]
        rows=[{'metric':{'type':'pubsub.googleapis.com/subscription/num_undelivered_messages'},
            'resource':{'type':'pubsub_subscription','labels':{'project_id':h.PROJECT,'subscription_id':name}},
            'points':[{'interval':{'endTime':timestamp(at)},'value':{'int64Value':'0'}} for at in [T+180,T+120]]} for name in names]
        return rows,names

    def test_all_queues_need_recent_post_boundary_zeros(self):
        rows,names=self.series();self.assertEqual(h.require_empty_subscriptions(rows,names,timestamp(T),timestamp(T+300))['pending'],0)
        for change in [lambda rows:rows.pop(),lambda rows:rows.append(rows[0]),
            lambda rows:rows[0]['points'][0]['value'].update(int64Value='1'),lambda rows:rows[0]['points'].pop(),
            lambda rows:rows[0]['points'][0]['interval'].update(endTime=timestamp(T-1)),
            lambda rows:rows[0]['resource']['labels'].update(project_id='other')]:
            rows,names=self.series();change(rows)
            with self.assertRaises(ValueError):h.require_empty_subscriptions(rows,names,timestamp(T),timestamp(T+300))
        rows,names=self.series()
        with self.assertRaises(ValueError):h.require_empty_subscriptions(rows,names,timestamp(T),timestamp(T+1000))

if __name__=='__main__':unittest.main()
