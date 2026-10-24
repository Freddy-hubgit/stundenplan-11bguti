from browser_fixtures import *
from datetime import datetime
entry=dict(id='change',date='2026-10-19',teacher='Herr Hansen',start_time='07:30',end_time='09:00',kind='replacement',replacement_teacher='Frau Ersatz',room='B999',note='Vertretungshinweis',updated_at=now)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    for width in [1440,390]:
        for role in ['user','teacher','support','admin']:
            ctx=browser.new_context(viewport={'width':width,'height':1000})
            ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
            def api(route):
                if '/rpc/substitution_list' in route.request.url: route.fulfill(status=200,content_type='application/json',body=json.dumps([entry]))
                else:mock(route,role)
            ctx.route(f'https://{PROJECT}.supabase.co/**',api)
            page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
            page.clock.install(time=datetime(2026,10,19,8,30))
            page.goto(BASE,wait_until='domcontentloaded')
            page.get_by_role('heading',name='Hi, '+role.title(),exact=True).wait_for()
            staff=role in ['support','admin']
            assert page.get_by_role('link',name='Vertretungsplan',exact=False).count()==int(staff)
            page.goto(BASE+'/vertretungsplan',wait_until='domcontentloaded')
            if staff:page.get_by_role('heading',name='Vertretungsplan',exact=True).wait_for()
            else:page.wait_for_url(BASE+'/')
            page.goto(BASE+'/stundenplan',wait_until='domcontentloaded')
            replacement=page.locator('.lesson.substituted');replacement.wait_for()
            assert 'Frau Ersatz' in replacement.inner_text() and 'B999' in replacement.inner_text()
            if not staff:
                assert page.locator('.day-col').count()==1
                assert page.get_by_role('button',name='Woche',exact=True).count()==0
                assert page.get_by_role('link',name='VERTRETUNG',exact=False).count()==0
                page.get_by_role('button',name='Nächster Tag',exact=False).click()
                assert page.locator('.lesson.substituted').count()==0
                assert page.locator('.day-col').count()==1
            elif width>920:
                page.get_by_role('button',name='Nächste Woche',exact=False).wait_for()
                assert page.locator('.day-col').count()==5
            else:
                page.get_by_role('button',name='Woche',exact=True).click()
                assert page.locator('.day-col').count()==5
            assert page.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
            ctx.close()
            print('PASS timetable access',role,width)
    assert not errors,errors
    browser.close()
