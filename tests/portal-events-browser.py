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

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    def page_as(role,width=1280,path='/videokonferenz'):
        ctx=browser.new_context(viewport={'width':width,'height':1000},timezone_id='Europe/Berlin')
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:event_mock(r,role))
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.clock.install(time=datetime(2026,10,24,12,0))
        page.goto(BASE+path,wait_until='domcontentloaded')
        return page
    staff=page_as('support')
    staff.get_by_role('button',name='+ Videokonferenz planen',exact=True).click()
    staff.get_by_label('Titel',exact=True).fill('Jitsi Klassenbesprechung')
    staff.get_by_label('Beginn',exact=True).fill('2026-10-26T10:00')
    staff.get_by_label('Ende',exact=True).fill('2026-10-26T11:00')
    staff.get_by_label('Beschreibung',exact=True).fill('Bitte pünktlich sein. äöü')
    generated=staff.locator('.room-url').inner_text()
    assert generated.startswith('https://meet.jit.si/Schulportal-') and len(generated.split('-')[-1])==32
    staff.get_by_role('button',name='Termin speichern',exact=True).click()
    staff.get_by_text('Termin gespeichert.',exact=True).wait_for()
    assert len(events)==1 and events[0]['starts_at']=='2026-10-26T09:00:00.000Z' # CET after clock change.
    user=page_as('user')
    join=user.get_by_role('link',name='Teilnehmen',exact=False);join.wait_for()
    assert join.get_attribute('href')==generated and join.get_attribute('target')=='_blank'
    assert 'noopener' in join.get_attribute('rel')
    assert user.get_by_role('button',name='Bearbeiten',exact=True).count()==0
    with user.expect_download() as info:
        user.get_by_role('button',name='Zum Kalender hinzufügen (.ics)',exact=True).click()
    data=Path(info.value.path()).read_text()
    assert 'BEGIN:VCALENDAR' in data and 'DTSTART:20261026T090000Z' in data and 'URL:'+generated in data
    calendar_user=page_as('teacher',path='/kalender')
    calendar_user.get_by_role('button',name='Montag, 26. Oktober 2026, 1 Termine',exact=True).click()
    calendar_user.get_by_role('heading',name='Jitsi Klassenbesprechung',exact=True).wait_for()
    assert calendar_user.locator('.day').count()==42
    admin=page_as('admin',390,'/kalender')
    admin.get_by_role('button',name='+ Termin erstellen',exact=True).click()
    admin.get_by_label('Titel',exact=True).fill('Schulveranstaltung')
    admin.get_by_label('Beginn',exact=True).fill('2026-10-25T12:00')
    admin.get_by_label('Ende',exact=True).fill('2026-10-25T13:00')
    admin.get_by_label('Ort (optional)',exact=True).fill('Aula')
    admin.get_by_role('button',name='Termin speichern',exact=True).click()
    admin.get_by_role('heading',name='Schulveranstaltung',exact=True).wait_for()
    assert admin.locator('body').evaluate('(e)=>e.scrollWidth<=window.innerWidth')
    admin.screenshot(path='/tmp/portal-calendar-mobile.png',full_page=True)
    admin.get_by_role('button',name='Bearbeiten',exact=True).click()
    admin.get_by_label('Titel',exact=True).fill('Schulveranstaltung geändert')
    admin.get_by_role('button',name='Termin speichern',exact=True).click()
    admin.get_by_role('heading',name='Schulveranstaltung geändert',exact=True).wait_for()
    admin.get_by_role('button',name='Löschen',exact=True).click()
    admin.get_by_role('button',name='Löschen bestätigen',exact=True).click()
    admin.get_by_text('Für diesen Tag sind keine Termine eingetragen.',exact=True).wait_for()
    # A past meeting remains accessible via the filter.
    events.append(dict(events[0],id='past',title='Vergangene Besprechung',starts_at='2026-10-20T08:00:00Z',ends_at='2026-10-20T09:00:00Z'))
    user.goto(BASE+'/videokonferenz',wait_until='domcontentloaded')
    user.get_by_role('heading',name='Jitsi Klassenbesprechung',exact=True).wait_for()
    assert user.get_by_role('heading',name='Vergangene Besprechung',exact=True).count()==0
    user.get_by_label('Vergangene anzeigen',exact=True).check()
    user.get_by_role('heading',name='Vergangene Besprechung',exact=True).wait_for()
    # A failed mutation preserves the entered title and room.
    staff.get_by_role('button',name='Bearbeiten',exact=True).click()
    staff.get_by_label('Titel',exact=True).fill('Entwurf behalten')
    staff.route('**/rest/v1/rpc/portal_event_save',lambda r:r.fulfill(status=500,content_type='application/json',body='{}'))
    staff.get_by_role('button',name='Termin speichern',exact=True).click()
    staff.get_by_role('alert').wait_for()
    assert staff.get_by_label('Titel',exact=True).input_value()=='Entwurf behalten'
    assert staff.locator('.room-url').inner_text()==generated
    anon=browser.new_page();anon.goto(BASE+'/kalender');anon.wait_for_url('**/login')
    assert not errors,errors
    print('PASS: staff/admin event CRUD, generated Jitsi link, read-only users, calendar/date/UTC, ICS export, past meetings, failed-save draft, mobile layout, login guard; simulated API')
    browser.close()
