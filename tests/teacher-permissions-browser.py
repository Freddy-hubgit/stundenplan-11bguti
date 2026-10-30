from browser_fixtures import *

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]; creations=[]
    def page_as(role):
        ctx=browser.new_context()
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        def api(route):
            url=route.request.url
            if '/profiles?' in url and 'id=eq.' not in url:
                route.fulfill(status=200,content_type='application/json',body='[]')
            elif '/rpc/portal_events_list' in url or '/rpc/support_tickets' in url:
                route.fulfill(status=200,content_type='application/json',body='[]')
            elif '/functions/v1/create-teacher' in url:
                creations.append(route.request.post_data_json)
                route.fulfill(status=200,content_type='application/json',body='{"ok":true}')
            else: mock(route,role)
        ctx.route(f'https://{PROJECT}.supabase.co/**',api)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE,wait_until='domcontentloaded');page.get_by_role('heading',name=role.title(),exact=False).wait_for()
        return page
    user=page_as('user')
    user.get_by_role('link',name='Support & Tickets').wait_for()
    assert user.get_by_role('link',name='Kalender',exact=False).count()==0
    user.goto(BASE+'/kalender',wait_until='domcontentloaded');user.wait_for_url(BASE+'/')
    user.get_by_role('link',name='Videokonferenz').click()
    user.get_by_role('heading',name='Videokonferenz',exact=True).wait_for()
    teacher=page_as('teacher')
    teacher.get_by_role('link',name='Kalender').wait_for()
    assert teacher.get_by_role('link',name='Support',exact=False).count()==0
    assert teacher.get_by_role('link',name='Verwaltung',exact=False).count()==0
    teacher.get_by_role('link',name='Kalender').click()
    teacher.get_by_role('heading',name='Kalender',exact=True).wait_for()
    assert teacher.get_by_role('button',name='+ Termin erstellen').count()==0
    for path in ['/support','/admin']:
        teacher.goto(BASE+path,wait_until='domcontentloaded');teacher.wait_for_url(BASE+'/')
    teacher.get_by_role('button',name='Einstellungen öffnen').click()
    teacher.get_by_role('button',name='Account',exact=True).click()
    teacher.get_by_text('Lehrer',exact=True).wait_for()
    admin=page_as('admin')
    admin.get_by_role('link',name='Verwaltung').click()
    admin.get_by_label('Rolle',exact=True).select_option('teacher')
    admin.get_by_label('Name',exact=True).fill('Neue Lehrkraft')
    admin.get_by_label('E-Mail',exact=True).fill('teacher@example.test')
    admin.get_by_label('Passwort',exact=True).fill('test-password')
    admin.get_by_role('button',name='Konto anlegen',exact=True).click()
    admin.get_by_text('Konto für Neue Lehrkraft wurde angelegt.',exact=True).wait_for()
    assert len(creations)==1 and creations[0]['role']=='teacher'
    assert not errors,errors
    print('PASS teacher/user tiles, direct-route restrictions, account role label, teacher creation via dedicated function; simulated API')
    browser.close()
