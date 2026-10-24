"""Calendar and Jitsi workflow with simulated Supabase; run ng serve on port 4200."""
from browser_fixtures import *
from datetime import datetime
from pathlib import Path

events=[]
def event_mock(route,role):
    url=route.request.url
    args=route.request.post_data_json or {} if route.request.method=='POST' else {}
    if '/rpc/portal_events_list' in url: result=sorted([e for e in events if role!='user' or e['kind']=='meeting'],key=lambda e:e['starts_at'])
    elif '/rpc/portal_event_save' in url:
        id=args['entry_id'] or f'00000000-1111-0000-0000-{len(events)+1:012d}'
        entry=dict(id=id,kind=args['entry_kind'],title=args['entry_title'],description=args['details'],starts_at=args['starts'],
                   ends_at=args['ends'],location=args['place'],meeting_url=args['meeting_link'])
        events[:]=[e for e in events if e['id']!=id]+[entry]; result=id
    elif '/rpc/portal_event_delete' in url:
        events[:]=[e for e in events if e['id']!=args['entry_id']]; result=None
    else: mock(route,role); return
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))

