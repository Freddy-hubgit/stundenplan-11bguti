"""UI regression test with a simulated Supabase API; no live account required.
Run while ng serve listens on port 4200: python tests/support-browser.py
"""
import base64
import json
import time
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:4200'
PROJECT = 'amwowtaxrgfcojlsxhzk'
ids = {r: f'00000000-0000-0000-0000-00000000000{n}' for n, r in enumerate(['user', 'other', 'support', 'admin'], 1)}
tickets, messages = [], []
now = '2026-10-21T12:00:00Z'

def profile(role):
    return dict(id=ids[role], full_name=role.title(), email=role+'@example.test', role='user' if role == 'other' else role, created_at=now)

def session(role):
    enc = lambda obj: base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip('=')
    token = enc({'alg': 'HS256', 'typ': 'JWT'}) + '.' + enc({'sub': ids[role], 'exp': int(time.time())+3600}) + '.test'
    return dict(access_token=token, refresh_token='test-only', expires_at=int(time.time())+3600, expires_in=3600, token_type='bearer', user=profile(role))

def mock(route, role):
    url = route.request.url
    args = route.request.post_data_json or {} if route.request.method == 'POST' else {}
    result = None
    if '/profiles?' in url: result = profile(role)
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

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    def open_as(role, mobile=False):
        ctx=browser.new_context(viewport={'width':390,'height':844} if mobile else {'width':1280,'height':900})
        value=json.dumps(session(role))
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(value)})")
        ctx.route(f'https://{PROJECT}.supabase.co/**',lambda route: mock(route,role))
        page=ctx.new_page(); page.on('pageerror',lambda e: errors.append(str(e)))
        page.goto(BASE)
        page.get_by_role('link',name='Support-Tickets' if role in ['support','admin'] else 'Support & Tickets').click()
        page.get_by_role('heading',name='Dein Support-Team').wait_for()
        return page
    user=open_as('user')
    user.locator('.role').get_by_text('Admin',exact=True).wait_for()
    user.get_by_label('Betreff',exact=True).fill('Problem mit Stundenplan')
    user.get_by_label('Deine Nachricht',exact=True).fill('Bitte helft mir <script>alert(1)</script>')
    user.get_by_role('button',name='Ticket erstellen',exact=True).click()
    user.get_by_role('heading',name='Problem mit Stundenplan',exact=True).wait_for()
    user.get_by_text('Bitte helft mir <script>alert(1)</script>',exact=True).wait_for()
    staff=open_as('support')
    staff.get_by_role('button',name='Problem mit Stundenplan').click()
    staff.get_by_label('Nachricht',exact=True).fill('Wir helfen dir!')
    staff.get_by_role('button',name='Nachricht senden',exact=True).click()
    staff.get_by_text('Wir helfen dir!',exact=True).wait_for()
    user.get_by_text('Wir helfen dir!',exact=True).wait_for(timeout=12000)
    staff.get_by_role('button',name='Ticket schließen',exact=True).click()
    staff.get_by_text('Dieses Ticket ist geschlossen.',exact=False).wait_for()
    user.get_by_text('Dieses Ticket ist geschlossen.',exact=False).wait_for(timeout=12000)
    assert user.get_by_label('Nachricht',exact=True).count()==0
    admin=open_as('admin')
    admin.get_by_label('Status',exact=True).select_option('closed')
    admin.get_by_role('button',name='Problem mit Stundenplan').click()
    admin.get_by_role('button',name='Wieder öffnen',exact=True).click()
    admin.get_by_label('Nachricht',exact=True).wait_for()
    other=open_as('other',mobile=True)
    other.get_by_text('Keine Tickets in dieser Ansicht.',exact=True).wait_for()
    assert other.locator('body').evaluate('(e) => e.scrollWidth <= window.innerWidth')
    # A failed write preserves the draft and exposes an error.
    user.get_by_label('Nachricht',exact=True).wait_for(timeout=12000)
    user.route('**/rest/v1/rpc/support_reply', lambda r:r.fulfill(status=500,content_type='application/json',body='{"message":"test failure"}'))
    user.get_by_label('Nachricht',exact=True).fill('Nicht verlieren')
    user.get_by_role('button',name='Nachricht senden',exact=True).click()
    user.get_by_role('alert').wait_for()
    assert user.get_by_label('Nachricht',exact=True).input_value()=='Nicht verlieren'
    anon=browser.new_page(); anon.goto(BASE+'/support'); anon.wait_for_url('**/login')
    assert not errors,errors
    print('PASS: user/staff/admin tiles, team, create/chat/poll, close/reopen, literal HTML, failed-send draft, mobile layout, anonymous guard; mocked API')
    browser.close()
