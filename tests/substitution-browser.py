"""Browser checks against a simulated API; start ng serve on port 4200 first."""
from browser_fixtures import *
from datetime import datetime
entries=[]

def plan_mock(route, role):
    url=route.request.url
    args=route.request.post_data_json or {} if route.request.method=='POST' else {}
    if '/rpc/substitution_list' in url:
        result=entries
    elif '/rpc/substitution_save' in url:
        entry=dict(id=args['entry_id'] or '10000000-0000-0000-0000-000000000001',date=args['entry_date'],
                   teacher=args['absent_teacher'],start_time=args['starts'],end_time=args['ends'],
                   kind=args['entry_kind'],replacement_teacher=args['replacement'],room=args['new_room'],note=args['info'],updated_at=now)
        entries[:]=[e for e in entries if e['id']!=entry['id']]+[entry]
        result=entry['id']
    elif '/rpc/substitution_delete' in url:
        entries[:]=[e for e in entries if e['id']!=args['entry_id']]; result=None
    else:
        mock(route,role); return
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    def open_as(role, width=1280):
        ctx=browser.new_context(viewport={'width':width,'height':1000})
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:plan_mock(r,role))
        page=ctx.new_page(); page.on('pageerror',lambda e:errors.append(str(e)))
        # Freeze the displayed week; API token expiry remains in the future.
        page.clock.install(time=datetime(2026,10,21,10,0))
        page.goto(BASE,wait_until='domcontentloaded')
        page.get_by_role('link',name='Vertretungsplan').click()
        page.get_by_role('heading',name='Vertretungsplan',exact=True).wait_for()
        return page
    staff=open_as('support')
    staff.get_by_label('Datum des Eintrags',exact=True).fill('2026-10-19')
    staff.get_by_label('Fehlende Lehrkraft',exact=True).fill('Herr Hansen')
    staff.get_by_label('Von',exact=True).fill('08:15')
    staff.get_by_label('Bis',exact=True).fill('09:00')
    staff.get_by_label('Ersatzlehrkraft',exact=True).fill('Frau Ersatz')
    staff.get_by_label('Ersatzraum (optional)',exact=True).fill('B999')
    staff.get_by_label('Hinweis (optional)',exact=True).fill('Bitte Buch mitbringen.')
    staff.get_by_role('button',name='Eintrag speichern',exact=True).click()
    staff.get_by_text('Eintrag gespeichert.',exact=True).wait_for()
    user=open_as('user')
    user.get_by_text('Frau Ersatz',exact=True).wait_for()
    assert user.get_by_role('button',name='Bearbeiten',exact=True).count()==0
    user.get_by_role('link',name='Zum Stundenplan').click()
    replacement=user.locator('.lesson.substituted')
    replacement.wait_for()
    assert replacement.count()==1
    assert 'Frau Ersatz' in replacement.inner_text() and 'B999' in replacement.inner_text()
    assert '08:15–09:00' in replacement.get_attribute('title')
    assert replacement.locator('.original-teacher').inner_text()=='Herr Hansen'
    regular=user.locator('.lesson').filter(has_text='Herr Hansen').filter(has_text='07:30–08:15')
    assert regular.count()==1 # Partial lesson remains regular before the change.
    card_box=replacement.bounding_box(); teacher_box=replacement.locator('.meta').bounding_box()
    assert teacher_box['y']+teacher_box['height'] <= card_box['y']+card_box['height']
    user.screenshot(path='/tmp/substitution-timetable.png',full_page=True)
    # A different week must not inherit a date-specific change.
    user.get_by_role('button',name='Nächste Woche').click()
    assert user.locator('.lesson.substituted').count()==0
    user.clock.set_fixed_time(datetime(2026,10,19,8,30))
    user.goto(BASE+'/stundenplan',wait_until='domcontentloaded')
    user.locator('.lesson.substituted.is-live').wait_for()
    assert 'B999' in user.locator('.status-detail').inner_text()
    staff.get_by_role('button',name='Bearbeiten',exact=True).click()
    staff.get_by_label('Änderung',exact=True).select_option('cancelled')
    staff.get_by_role('button',name='Änderungen speichern',exact=True).click()
    staff.get_by_text('Eintrag gespeichert.',exact=True).wait_for()
    user.goto(BASE+'/stundenplan',wait_until='domcontentloaded')
    user.locator('.lesson.cancelled').wait_for()
    assert user.locator('.lesson.substituted').count()==0
    admin=open_as('admin',390)
    admin.get_by_role('button',name='Löschen',exact=True).click()
    admin.get_by_role('button',name='Löschen bestätigen',exact=True).click()
    admin.get_by_text('Eintrag gelöscht.',exact=True).wait_for()
    assert admin.locator('body').evaluate('(e) => e.scrollWidth <= window.innerWidth')
    user.goto(BASE+'/stundenplan',wait_until='domcontentloaded')
    user.locator('.lesson').first.wait_for()
    assert user.locator('.lesson.cancelled, .lesson.substituted').count()==0
    assert not errors,errors
    print('PASS: staff create/edit, read-only users, replacement teacher/room/details, partial-hour split, cancellation, admin delete, mobile layout; simulated API')
    browser.close()
