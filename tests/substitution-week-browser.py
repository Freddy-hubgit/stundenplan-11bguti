"""Week grouping and themed calendar regression test with simulated Supabase."""
from browser_fixtures import *
from datetime import datetime

entries=[dict(id=str(i), date=date, teacher=teacher, start_time=start, end_time='12:30', kind='replacement',
              replacement_teacher='Frau Ersatz', room='B200', note='Info', updated_at=now)
         for i,(date,teacher,start) in enumerate([
             ('2026-10-19','Montagslehrer','09:15'),('2026-10-21','Mittwochslehrer','11:00'),
             ('2026-10-19','Früher Lehrer','07:30'),('2026-10-26','Andere Woche','09:15'),
             ('2026-11-01','Sonntagslehrer','09:15')])]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width in [1280,390]:
        ctx=browser.new_context(viewport={'width':width,'height':1000})
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session('user')))})")
        def route_api(route):
            if '/rpc/substitution_list' in route.request.url:
                route.fulfill(status=200,content_type='application/json',body=json.dumps(entries))
            else: mock(route,'user')
        ctx.route(f'https://{PROJECT}.supabase.co/**',route_api)
        page=ctx.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
        page.clock.install(time=datetime(2026,10,21,10,0))
        page.goto(BASE+'/vertretungsplan',wait_until='domcontentloaded')
        page.get_by_text('Mittwochslehrer fehlt',exact=True).wait_for()
        assert page.locator('.day-group').count()==7
        monday=page.locator('.day-group').first
        assert monday.locator('.entry h3').all_text_contents()==['Früher Lehrer fehlt','Montagslehrer fehlt']
        assert page.locator('.day-group.is-today').count()==1
        assert page.get_by_text('Andere Woche fehlt',exact=True).count()==0
        assert page.locator('.day-empty').count()==5
        page.get_by_role('button',name='Nächste Woche',exact=True).click()
        page.get_by_text('Andere Woche fehlt',exact=True).wait_for()
        page.get_by_text('Sonntagslehrer fehlt',exact=True).wait_for()
        assert page.get_by_text('Montagslehrer fehlt',exact=True).count()==0
        page.get_by_role('button',name='Vorherige Woche',exact=True).click()
        page.get_by_text('Montagslehrer fehlt',exact=True).wait_for()
        page.get_by_role('button',name='Kalender öffnen',exact=True).click()
        calendar=page.get_by_role('region',name='Woche im Kalender auswählen')
        assert calendar.locator('.calendar-day.in-week').count()==7
        assert calendar.locator('.calendar-day.today').count()==1
        page.screenshot(path=f'/tmp/substitution-week-{width}.png',full_page=True)
        page.get_by_role('button',name='Nächster Monat',exact=True).click()
        page.get_by_role('button',name='Sonntag, 1. November 2026',exact=True).click()
        assert calendar.count()==0
        page.get_by_text('Sonntagslehrer fehlt',exact=True).wait_for()
        page.get_by_role('button',name='Diese Woche',exact=True).click()
        page.get_by_text('Mittwochslehrer fehlt',exact=True).wait_for()
        # Same calendar in the light theme.
        page.get_by_role('button',name='Einstellungen öffnen',exact=True).click()
        page.get_by_role('button',name='Hell',exact=True).click()
        page.get_by_role('button',name='Schließen',exact=True).click()
        page.get_by_role('button',name='Kalender öffnen',exact=True).click()
        assert page.locator('main.theme-light').count()==1
        assert calendar.evaluate('(e) => getComputedStyle(e).backgroundColor')=='rgb(255, 255, 255)'
        box=calendar.bounding_box(); assert box['x']>=0 and box['x']+box['width']<=width
        page.screenshot(path=f'/tmp/substitution-week-light-{width}.png',full_page=True)
        page.keyboard.press('Escape'); assert calendar.count()==0
        page.get_by_role('button',name='Kalender öffnen',exact=True).click()
        page.get_by_role('heading',name='Vertretungsplan',exact=True).click()
        assert calendar.count()==0
        assert page.locator('body').evaluate('(e) => e.scrollWidth <= window.innerWidth')
        assert not errors,errors
        print('PASS weekly grouping/calendar',width)
        ctx.close()
    browser.close()
