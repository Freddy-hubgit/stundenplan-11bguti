import base64
import json
import time
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:4200'
PROJECT = 'amwowtaxrgfcojlsxhzk'
ids = {r: f'00000000-0000-0000-0000-00000000000{n}' for n, r in enumerate(['user', 'other', 'support', 'admin', 'teacher'], 1)}
tickets, messages = [], []
now = '2026-10-21T12:00:00Z'

def profile(role):
    return dict(id=ids[role], full_name=role.title(), email=role+'@example.test', role='user' if role == 'other' else role, created_at=now)

def session(role):
    enc = lambda obj: base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip('=')
    token = enc({'alg': 'HS256', 'typ': 'JWT'}) + '.' + enc({'sub': ids[role], 'exp': int(time.time())+3600}) + '.test'
    return dict(access_token=token, refresh_token='test-only', expires_at=int(time.time())+3600, expires_in=3600, token_type='bearer', user=profile(role))

CLASS_ID='10000000-0000-0000-0000-000000000001'
# Use the app's maintained timetable as the mock class schedule.
_source=(Path(__file__).resolve().parents[1]/'src/app/timetable-data.ts').read_text()
_array=re.search(r'export const DEFAULT_LESSONS: Lesson\[\] = (\[.*?\]);',_source,re.S).group(1)
_array=re.sub(r'//[^\n]*','',_array)
_array=re.sub(r'([,{]\s*)(\w+)\s*:',r'\1"\2":',_array)
DEFAULT_SCHOOL_LESSONS=json.loads(re.sub(r',\s*([}\]])',r'\1',_array))

def mock(route, role):
    url = route.request.url
    args = route.request.post_data_json or {} if route.request.method == 'POST' else {}
    result = None
    if '/profiles?' in url: result = profile(role)
    elif '/rpc/school_groups' in url: result=[dict(id=CLASS_ID,name='11BGUTI',kind='class',parent_id=None,can_teach=role in ['teacher','admin'],grade=11)]
    elif '/rpc/school_timetable' in url: result=[dict(l,group_id=CLASS_ID) for l in DEFAULT_SCHOOL_LESSONS]
    elif '/rpc/school_lessons' in url: result=DEFAULT_SCHOOL_LESSONS
    elif '/rpc/school_schedule_save' in url: result=None
    elif '/rpc/school_exams' in url or '/rpc/hw_tasks_group' in url: result=[]
    elif '/rpc/dm_unread' in url: result=0
    elif '/rpc/dm_mark_read' in url: result=None
    elif '/auth/v1/user' in url: result = profile(role)
    elif '/rpc/support_team' in url:
        result = [{k: profile(r)[k] for k in ['id','full_name','role']} for r in ['support','admin']]
    elif '/rpc/support_tickets' in url:
        result = [t for t in tickets if role in ['support','admin'] or t['owner_id']==ids[role]]
    elif '/rpc/support_messages' in url:
        result = [m for m in messages if m['ticket_id']==args['ticket_id']]
    elif '/rpc/support_create_ticket' in url:
        result = '10000000-0000-0000-0000-000000000001'
        tickets.append(dict(id=result,owner_id=ids[role],owner_name=role.title(),subject=args['subject'],status='open',created_at=now,updated_at=now))
        messages.append(dict(id='first',ticket_id=result,sender_id=ids[role],sender_name=role.title(),sender_role=role,body=args['body'],created_at=now))
    elif '/rpc/support_reply' in url:
        messages.append(dict(id=str(len(messages)),ticket_id=args['ticket_id'],sender_id=ids[role],sender_name=role.title(),sender_role=role,body=args['body'],created_at=now))
    elif '/rpc/support_set_status' in url:
        next(t for t in tickets if t['id']==args['ticket_id'])['status']=args['new_status']
    else:
        route.fulfill(status=404,content_type='application/json',body='{}'); return
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))

