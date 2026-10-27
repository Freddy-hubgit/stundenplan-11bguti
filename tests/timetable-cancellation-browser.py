from browser_fixtures import *
from datetime import datetime
central=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    def page_as(role):
        ctx=browser.new_context()
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        def api(route):
            if '/rpc/substitution_list' in route.request.url:route.fulfill(status=200,content_type='application/json',body=json.dumps(central))
            else:mock(route,role)
        ctx.route(f'https://{PROJECT}.supabase.co/**',api)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.clock.install(time=datetime(2026,10,26,8,0));page.goto(BASE+'/stundenplan',wait_until='domcontentloaded')
        page.locator('.lesson').first.wait_for()
        return page
    for role in ['user','teacher']:
        page=page_as(role)
        assert page.get_by_role('button',name='+ Stunde hinzufügen',exact=True).count()==0
        assert page.get_by_role('button',name='Stunde bearbeiten',exact=True).count()==0
        page.locator('.lesson').first.click()
        assert page.locator('.modal-backdrop').count()==0
        page.get_by_role('button',name='⚙ Einstellungen',exact=True).click()
        page.get_by_role('button',name='Daten',exact=True).click()
        assert page.get_by_role('button',name='Eingefügten Text importieren',exact=True).count()==0
        assert page.get_by_role('button',name='⭱ Datei auswählen',exact=True).count()==0
        assert page.get_by_label('Diese Stunde ist ausgefallen',exact=True).count()==0
        page.context.close()
    staff=page_as('support')
    staff.get_by_role('button',name='+ Stunde hinzufügen',exact=True).click()
    assert staff.get_by_label('Diese Stunde ist ausgefallen',exact=True).count()==0
    staff.get_by_role('button',name='Abbrechen',exact=True).click()
    staff.get_by_role('button',name='⚙ Einstellungen',exact=True).click()
    staff.get_by_role('button',name='Daten',exact=True).click()
    payload=dict(lessons=[dict(subject='Testfach',teacher='Testlehrer',room='A100',day='Mon',start='07:30',end='09:00',cancelled=True)])
    staff.locator('.import-textarea').fill(json.dumps(payload))
    staff.on('dialog',lambda d:d.accept())
    staff.get_by_role('button',name='Eingefügten Text importieren',exact=True).click()
    staff.get_by_role('button',name='Fertig',exact=True).click()
    lesson=staff.locator('.lesson').filter(has_text='Testfach');lesson.wait_for()
    assert 'cancelled' not in (lesson.get_attribute('class') or '')
    central.append(dict(id='central',date='2026-10-26',teacher='Testlehrer',start_time='07:30',end_time='09:00',kind='cancelled',replacement_teacher='',room='',note='Zentraler Ausfall',updated_at=now))
    staff.clock.fast_forward(16000)
    staff.locator('.lesson.cancelled').filter(has_text='Testfach').wait_for()
    assert not errors,errors
    print('PASS no self-cancellation/editor/import for user/teacher; local cancellation flags ignored, central staff cancellation still visible; simulated API')
    browser.close()
