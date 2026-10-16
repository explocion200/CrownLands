#!/usr/bin/python3
"""Read-only handover inventory. Never replay events, alter cursors or activate.

Keep historical documents intact. Only current-realm trigger receipts are
classified as pending; Crown purchase orders are global and always inspected.
Queue metrics are separate evidence because profile-change triggers cannot be
reconstructed from the final document alone.
"""
from datetime import datetime, timezone
import hashlib
import json
import re

PROJECT = 'crown-land-b15e0'
ROOT = 'projects/'+PROJECT+'/databases/(default)/documents/'
PENDING = ['dailyMissions','seasonalActions','ownership','pvpKills','battleReceipts','seasonalRealmEvents']


def stamp(value):
    parsed = datetime.fromisoformat(value.replace('Z','+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Timezone-qualified evidence required')
    return parsed.timestamp()


def scalar(fields, name, default=None):
    value = fields.get(name)
    if value is None:
        return default
    if len(value)!=1:
        raise ValueError('Invalid typed handover field')
    kind, data = next(iter(value.items()))
    if kind=='stringValue' and isinstance(data,str): return data
    if kind=='booleanValue' and type(data) is bool: return data
    if kind=='integerValue' and isinstance(data,str) and re.fullmatch('-?[0-9]+',data): return int(data)
    if kind=='doubleValue' and type(data) in (int,float): return data
    if kind=='nullValue': return None
    raise ValueError('Unexpected typed handover field')


def inspect_documents(documents, realm):
    if (set(realm)!={'worldId','resetGeneration','sharedRealmId'}
            or not re.fullmatch(r'main-realm-\d{4}-\d{2}',realm.get('worldId',''))
            or realm['resetGeneration']!=realm['worldId'].removeprefix('main-')
            or realm['sharedRealmId']!='shard_0001'):
        raise ValueError('Reviewed current shared realm required')
    pending={key:0 for key in PENDING}
    orders=[]; realm_count=0; count=0
    for doc in documents:
        name=doc.get('name','')
        if not name.startswith(ROOT): raise ValueError('Foreign source document')
        path=name[len(ROOT):]; parts=path.split('/'); fields=doc.get('fields',{})
        if len(parts)%2 or not all(parts): raise ValueError('Invalid document path')
        count+=1
        if path=='realmConfig/current':
            if {key:scalar(fields,key) for key in realm}!=realm: raise ValueError('Current realm changed')
            realm_count+=1
        if len(parts)==2 and parts[0] in ['crownPaymentTestOrders','crownPaymentOrders']:
            orders.append({'mode':'test' if parts[0]=='crownPaymentTestOrders' else 'live',
                'id':parts[1], 'status':scalar(fields,'status'), 'reviewRequired':scalar(fields,'reviewRequired',False),
                'sessionId':scalar(fields,'sessionId','')})
        if scalar(fields,'worldId')!=realm['worldId'] or scalar(fields,'resetGeneration')!=realm['resetGeneration']:
            continue
        if len(parts)==2 and parts[0]=='dailyMissionEvents' and scalar(fields,'uid'):
            pending['dailyMissions']+=not scalar(fields,'processedAtMs',0)
            pending['seasonalActions']+=not scalar(fields,'seasonalAchievementProcessedAtMs',0)
        if len(parts)==4 and parts[0]=='realmEvents' and parts[2]=='ownershipChanges':
            pending['ownership']+=scalar(fields,'status')!='processed'
        if len(parts)==4 and parts[0]=='pvpKillEvents' and parts[2]=='events':
            pending['pvpKills']+=not scalar(fields,'processedAtMs',0)
        if len(parts)==4 and parts[0] in ['reinforcementBattleReceipts','rallyBattleReceipts'] and parts[2]=='entries':
            pending['battleReceipts']+=scalar(fields,'status')=='pending' and bool(scalar(fields,'contributorUid'))
        if (len(parts)==4 and parts[0]=='realmEvents' and parts[2]=='activity'
                and str(scalar(fields,'eventType','')).upper() in ['STRONGHOLD_CAPTURED','CITADEL_CAPTURED']
                and scalar(fields,'attackerPlayerId')):
            pending['seasonalRealmEvents']+=not scalar(fields,'seasonalAchievementProcessedAtMs',0)
    if realm_count!=1: raise ValueError('Exactly one current-realm pointer required')
    if len({(o['mode'],o['id']) for o in orders})!=len(orders): raise ValueError('Duplicate purchase order')
    return {'documents':count,'realm':realm,'pending':pending,'orders':orders,
        'unsettledPayments':sum(o['status'] not in ['confirmed','expired'] for o in orders),
        'paymentReviews':sum(bool(o['reviewRequired']) for o in orders)}


def require_drained_inventory(inventory):
    if (set(inventory.get('pending',{}))!=set(PENDING)
            or any(type(n) is not int or n!=0 for n in inventory['pending'].values())
            or inventory.get('unsettledPayments')!=0 or inventory.get('paymentReviews')!=0):
        raise ValueError('Pending game receipts or purchases require reconciliation')


def scheduler_logged_minute(job, before, evidence, closed, observed):
    """Prove complete successful execution windows from Google's own logs.

    PauseJob clears lastAttemptTime/scheduleTime and reports status -1. Log
    timestamps can put AttemptStarted just after AttemptFinished, so associate
    each unique finish with its scheduled-time window, not log arrival order.
    Require the reviewed pre-pause attempt and every later attempt to be paired.
    """
    anchor=stamp(before['lastAttemptTime'])
    if (before.get('status') is None or before['status'].get('code',0)!=0
            or stamp(evidence['from'])>anchor or not 0<=observed-stamp(evidence['through'])<=300):
        raise ValueError('Fresh complete scheduler execution evidence required')
    entries=evidence['entries'];starts=[];finishes=[]
    if not isinstance(entries,list) or not 2<=len(entries)<1000:
        raise ValueError('Bounded scheduler execution history required')
    for entry in entries:
        resource=entry.get('resource',{});payload=entry.get('jsonPayload',{});at=stamp(entry['timestamp'])
        if (entry.get('logName')!='projects/'+PROJECT+'/logs/cloudscheduler.googleapis.com%2Fexecutions'
                or resource.get('type')!='cloud_scheduler_job'
                or resource.get('labels')!={'project_id':PROJECT,'location':'us-central1','job_id':job['name'].split('/')[-1]}
                or payload.get('jobName')!=job['name'] or payload.get('targetType')!='HTTP'
                or payload.get('url')!=job['httpTarget']['uri']
                or not stamp(evidence['from'])<=at<=stamp(evidence['through'])):
            raise ValueError('Scheduler log provenance or coverage changed')
        kind=payload.get('@type','')
        if kind=='type.googleapis.com/google.cloud.scheduler.logging.AttemptStarted':
            scheduled=stamp(payload['scheduledTime'])
            if scheduled>=anchor:starts.append((scheduled,at,entry))
        elif kind=='type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished':
            if at>=anchor:finishes.append((at,entry))
        else:raise ValueError('Unexpected scheduler execution record')
    starts.sort(key=lambda x:x[0]);finishes.sort(key=lambda x:x[0])
    if (not starts or starts[0][0]!=anchor or len(starts)!=len(finishes)
            or len({s[0] for s in starts})!=len(starts)
            or len({f[0] for f in finishes})!=len(finishes)):
        raise ValueError('Missing, duplicate or ambiguous scheduler completion')
    for i,((scheduled,logged,_),(finished,entry)) in enumerate(zip(starts,finishes)):
        payload=entry['jsonPayload'];code=entry.get('httpRequest',{}).get('status')
        if (not scheduled<=closed or not scheduled<=logged<=closed+600
                or not scheduled<=finished<=closed+600
                or (i+1<len(starts) and finished>=starts[i+1][0])
                or observed-max(logged,finished)<600
                or type(code) is not int or not 200<=code<300
                or payload.get('status') not in [None,'','OK']
                or entry.get('severity') in ['ERROR','CRITICAL','ALERT','EMERGENCY']):
            raise ValueError('Scheduler attempt is failed, unfinished or overlapping')
    return int(starts[-1][0]//60)


def scheduler_cursors(jobs, routes, closed_at, observed_at, planned_jobs, execution_logs=None):
    """Prepare cursors only after paused HTTP jobs report completed success.

    lastAttemptTime is an attempted start, not proof of success. Require its
    corresponding successful status, a quiet boundary and reviewed target.
    The existing local scheduler uses UTC-aligned intervals; daily cron times
    retain their named timezone. No historical job is executed here.
    """
    closed, observed=stamp(closed_at),stamp(observed_at)
    if observed-closed<600 or len(jobs)!=16 or len(routes)!=16 or len(planned_jobs)!=16:
        raise ValueError('Complete drained scheduler inventory required')
    expected={r['name']:r for r in routes}
    planned={j['name']:j for j in planned_jobs}
    if len(expected)!=16 or len(planned)!=16: raise ValueError('Duplicate local or source schedule')
    if execution_logs is not None and set(execution_logs)!=set(planned):
        raise ValueError('Complete scheduler log coverage required')
    result=[]
    for job in jobs:
        match=re.fullmatch(r'projects/'+PROJECT+r'/locations/us-central1/jobs/firebase-schedule-([A-Za-z][A-Za-z0-9]+)-us-central1',job.get('name',''))
        if not match or match[1] not in expected: raise ValueError('Unexpected scheduler identity')
        name=match[1];route=expected[name];before=planned.get(job['name'],{})
        immutable=['httpTarget','pubsubTarget','appEngineHttpTarget','schedule','timeZone','retryConfig','attemptDeadline']
        uri=job.get('httpTarget',{}).get('uri','')
        valid_uri=(uri=='https://us-central1-'+PROJECT+'.cloudfunctions.net/'+name
            or re.fullmatch(r'https://'+name.lower()+r'-[a-z0-9-]+\.a\.run\.app/?',uri))
        cleared=(job.get('status')=={'code':-1} and not job.get('lastAttemptTime') and not job.get('scheduleTime'))
        if (job.get('state')!='PAUSED' or job.get('status') is None
                or (job['status'].get('code',0)!=0 and not (cleared and execution_logs is not None))
                or job.get('schedule')!=route['schedule'] or job.get('timeZone','UTC')!=route['timeZone']
                or any(job.get(key)!=before.get(key) for key in immutable)
                or 'pubsubTarget' in job or 'appEngineHttpTarget' in job
                or job.get('httpTarget',{}).get('httpMethod')!='POST'
                or not valid_uri):
            raise ValueError('Schedule state, target, grammar or result changed')
        if execution_logs is not None:
            last_minute=scheduler_logged_minute(job,before,execution_logs[job['name']],closed,observed)
        else:
            attempted=stamp(job['lastAttemptTime']);next_at=stamp(job['scheduleTime'])
            if not 0<attempted<=closed or attempted>=next_at or observed-attempted<600:
                raise ValueError('Scheduler completion boundary is ambiguous')
            last_minute=int(attempted//60)
        signature=hashlib.sha256(json.dumps([route['schedule'],route['timeZone']],separators=(',',':')).encode()).hexdigest()
        result.append({'name':name,'signature':signature,'lastMinute':last_minute})
    if len({r['name'] for r in result})!=16: raise ValueError('Duplicate scheduler observation')
    return sorted(result,key=lambda r:r['name'])


def require_empty_subscriptions(series, expected, after, now):
    """Require two recent, post-boundary zero samples for every known queue.

    Missing or delayed monitoring data never means zero. This supplements the
    document receipt audit and exact writer controls; it does not replace them.
    """
    boundary, current=stamp(after),stamp(now)
    if len(expected)!=10 or len(set(expected))!=10: raise ValueError('Reviewed event subscription inventory required')
    seen={}
    for item in series:
        resource=item.get('resource',{})
        if (item.get('metric',{}).get('type')!='pubsub.googleapis.com/subscription/num_undelivered_messages'
                or resource.get('type')!='pubsub_subscription'
                or resource.get('labels',{}).get('project_id')!=PROJECT):
            raise ValueError('Unexpected event backlog metric')
        name=resource['labels'].get('subscription_id')
        if name not in expected or name in seen: raise ValueError('Missing, duplicate or unexpected event subscription')
        points=sorted([(stamp(p['interval']['endTime']),int(p['value']['int64Value'])) for p in item.get('points',[])],reverse=True)
        if (len(points)<2 or points[0][0]<=points[1][0] or points[1][0]<boundary
                or not 0<=current-points[0][0]<=240 or not 45<=points[0][0]-points[1][0]<=120
                or any(value!=0 for at,value in points if at>=boundary)):
            raise ValueError('Event backlog has not been observed empty after the boundary')
        seen[name]=points[0][0]
    if set(seen)!=set(expected): raise ValueError('Missing event subscription observations')
    return {'subscriptions':len(seen),'latestSampleMinimum':datetime.fromtimestamp(min(seen.values()),timezone.utc).isoformat(),'pending':0}
