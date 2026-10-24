from browser_fixtures import *
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    ctx=browser.new_context(viewport={'width':1280,'height':1000})
    ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session('admin')))})")
    def api(route):
        url=route.request.url
        if '/profiles?' in url and 'id=eq.' not in url: result=[profile('user'),profile('admin')]
        elif '/rpc/portal_events_list' in url or '/rpc/substitution_list' in url: result=[]
        else: mock(route,'admin');return
        route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
    ctx.route(f'https://{PROJECT}.supabase.co/**',api)
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    def audit():
        result=page.locator('button, select, input[type=checkbox]').evaluate_all('''elements => elements.filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,type:e.type,radius:getComputedStyle(e).borderRadius,background:getComputedStyle(e).backgroundColor,appearance:getComputedStyle(e).appearance})).filter(e=>e.radius==='0px' && e.background==='rgba(0, 0, 0, 0)')''')
        assert not result,result
    page.goto(BASE+'/admin',wait_until='domcontentloaded')
    page.locator('tr').filter(has_text='user@example.test').get_by_role('button',name='Bearbeiten',exact=True).click()
    role=page.get_by_label('Kontorolle',exact=True)
    assert role.evaluate('(e)=>parseFloat(getComputedStyle(e).borderRadius)')>=8
    audit();page.screenshot(path='/tmp/styled-role-control.png')
    page.goto(BASE+'/videokonferenz',wait_until='domcontentloaded')
    checkbox=page.get_by_label('Vergangene anzeigen',exact=True);checkbox.wait_for()
    assert checkbox.evaluate('(e)=>getComputedStyle(e).appearance')=='none'
    checkbox.check();assert checkbox.is_checked()
    assert checkbox.evaluate("(e)=>getComputedStyle(e,'::after').content")=='""'
    audit();page.screenshot(path='/tmp/styled-checkbox.png')
    # Toggle light theme and repeat the two controls.
    page.get_by_role('button',name='Einstellungen öffnen').click()
    page.get_by_role('button',name='Hell',exact=True).click()
    page.get_by_role('button',name='Schließen',exact=True).click()
    assert checkbox.evaluate('(e)=>getComputedStyle(e).backgroundColor')!='rgb(21, 28, 39)'
    page.goto(BASE+'/admin',wait_until='domcontentloaded')
    page.locator('tr').filter(has_text='user@example.test').get_by_role('button',name='Bearbeiten',exact=True).click()
    audit();page.screenshot(path='/tmp/styled-role-control-light.png')
    for path in ['/support','/vertretungsplan','/stundenplan']:
        page.goto(BASE+path,wait_until='domcontentloaded')
        page.wait_for_timeout(250)
        audit()
    # Timetable checkboxes retain their existing custom checkbox appearance.
    page.get_by_role('button',name='+ Stunde hinzufügen',exact=True).click()
    check=page.get_by_label('Diese Stunde ist ausgefallen',exact=True)
    check.check();assert check.is_checked()
    assert not errors,errors
    print('PASS control defaults across administration, meetings, support, substitution plan, timetable; role select, custom checkbox, light/dark and existing checkbox behavior')
    browser.close()
