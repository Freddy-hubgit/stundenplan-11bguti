from portal_events_fixtures import *

seed=[
 dict(id='one',kind='event',title='Erster Termin',description='Details zum Termin',starts_at='2026-10-26T09:00:00Z',ends_at='2026-10-26T10:00:00Z',location='Aula',meeting_url=''),
 dict(id='two',kind='meeting',title='Überlappender Termin',description='',starts_at='2026-10-26T09:30:00Z',ends_at='2026-10-26T10:30:00Z',location='',meeting_url='https://meet.jit.si/test-room'),
 dict(id='night',kind='event',title='Über Mitternacht',description='',starts_at='2026-10-25T22:30:00Z',ends_at='2026-10-26T00:30:00Z',location='',meeting_url='')]
events.extend(seed)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    def page_as(role,width=1440):
        ctx=browser.new_context(viewport={'width':width,'height':1000},timezone_id='Europe/Berlin')
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:event_mock(r,role))
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.clock.install(time=datetime(2026,10,24,12,0))
        page.goto(BASE+'/kalender',wait_until='domcontentloaded')
        return page
    for width in [1440,390]:
        staff=page_as('admin',width)
        staff.get_by_role('button',name='Montag, 26. Oktober 2026, 3 Termine',exact=True).click()
        dialog=staff.get_by_role('dialog',name='Montag, 26. Oktober 2026',exact=True)
        dialog.wait_for()
        assert dialog.bounding_box()['width']>min(700,width*.9)
        assert dialog.locator('.time-slot').count()==48
        blocks=dialog.locator('.timeline-event')
        assert blocks.count()==3
        first=blocks.filter(has_text='Erster Termin').bounding_box()
        second=blocks.filter(has_text='Überlappender Termin').bounding_box()
        assert abs(first['width']-second['width'])<2 and first['x']+first['width']<=second['x']+1
        blocks.filter(has_text='Erster Termin').click()
        dialog.get_by_role('region',name='Termindetails').get_by_text('Details zum Termin',exact=True).wait_for()
        staff.screenshot(path=f'/tmp/calendar-day-{width}.png',full_page=True)
        dialog.get_by_role('button',name='Termin um 08:30 MEZ erstellen',exact=True).click()
        assert staff.get_by_role('dialog').count()==0
        assert staff.get_by_label('Beginn',exact=True).input_value()=='2026-10-26T08:30'
        assert staff.get_by_label('Ende',exact=True).input_value()=='2026-10-26T09:30'
        assert staff.get_by_label('Titel',exact=True).evaluate('(e)=>document.activeElement===e')
        staff.get_by_label('Titel',exact=True).fill('Schnelltermin '+str(width))
        staff.get_by_role('button',name='Termin speichern',exact=True).click()
        staff.get_by_text('Termin gespeichert.',exact=True).wait_for()
        assert any(e['title']=='Schnelltermin '+str(width) and e['starts_at']=='2026-10-26T07:30:00.000Z' for e in events)
        assert staff.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
        staff.context.close()
        # Each viewport starts with the same seed.
        events[:]=seed[:]
    teacher=page_as('teacher')
    teacher.get_by_role('button',name='Montag, 26. Oktober 2026, 3 Termine',exact=True).click()
    assert teacher.locator('.quick-slot').count()==0
    teacher.locator('.timeline-event').filter(has_text='Überlappender Termin').click()
    teacher.get_by_role('dialog').get_by_role('link',name='Teilnehmen',exact=True).wait_for()
    teacher.keyboard.press('Escape');assert teacher.get_by_role('dialog').count()==0
    teacher.get_by_role('button',name='Einstellungen öffnen').click()
    teacher.get_by_role('button',name='Hell',exact=True).click()
    teacher.get_by_role('button',name='Schließen',exact=True).click()
    teacher.get_by_role('button',name='Montag, 26. Oktober 2026, 3 Termine',exact=True).click()
    assert teacher.get_by_role('dialog').evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(244, 246, 249)'
    teacher.keyboard.press('Escape')
    # Clock-change day has 50 real half-hour slots; preserve the later 02:30 offset.
    staff=page_as('support')
    staff.get_by_role('button',name='Sonntag, 25. Oktober 2026, 1 Termine',exact=True).click()
    assert staff.locator('.time-slot').count()==50
    staff.get_by_role('button',name='Termin um 02:30 MEZ erstellen',exact=True).click()
    staff.get_by_label('Titel',exact=True).fill('Zeitumstellung')
    staff.get_by_role('button',name='Termin speichern',exact=True).click()
    staff.get_by_text('Termin gespeichert.',exact=True).wait_for()
    assert next(e for e in events if e['title']=='Zeitumstellung')['starts_at']=='2026-10-25T01:30:00.000Z'
    assert not errors,errors
    print('PASS expanded day, overlap lanes, midnight clip, quick create/focus/save, teacher read-only, keyboard close, mobile and clock-change offset; simulated API')
    browser.close()
