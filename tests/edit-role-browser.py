from browser_fixtures import *
from urllib.parse import urlparse,parse_qs

accounts={ids[r]:profile(r) for r in ['user','support','admin']}
changes=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    def open_as(role):
        ctx=browser.new_context()
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        def api(route):
            url=route.request.url
            if '/profiles?' in url:
                query=parse_qs(urlparse(url).query)
                result=accounts[query['id'][0].removeprefix('eq.')] if 'id' in query else list(accounts.values())
            elif '/rpc/set_profile_role' in url:
                args=route.request.post_data_json
                target=accounts[args['target_id']]
                if target['role']=='admin' and args['new_role']!='admin' and sum(a['role']=='admin' for a in accounts.values())==1:
                    route.fulfill(status=400,content_type='application/json',body=json.dumps(dict(code='P0001',message='Der letzte Admin muss seine Adminrolle behalten.')));return
                changes.append(args);target['role']=args['new_role'];result=None
            else:mock(route,role);return
            route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
        ctx.route(f'https://{PROJECT}.supabase.co/**',api)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/admin',wait_until='domcontentloaded')
        page.get_by_role('heading',name='Verwaltung',exact=True).wait_for()
        return page
    admin=open_as('admin')
    row=admin.locator('tr').filter(has_text='user@example.test')
    row.get_by_role('button',name='Bearbeiten',exact=True).click()
    admin.get_by_label('Kontorolle',exact=True).select_option('teacher')
    admin.get_by_role('button',name='Rolle speichern',exact=True).click()
    admin.get_by_text('Rolle gespeichert.',exact=True).wait_for()
    assert accounts[ids['user']]['role']=='teacher' and changes==[dict(target_id=ids['user'],new_role='teacher')]
    row=admin.locator('tr').filter(has_text='admin@example.test')
    row.get_by_role('button',name='Bearbeiten',exact=True).click()
    admin.get_by_label('Kontorolle',exact=True).select_option('teacher')
    admin.get_by_role('button',name='Rolle speichern',exact=True).click()
    admin.get_by_text('Der letzte Admin muss seine Adminrolle behalten.',exact=True).wait_for()
    assert accounts[ids['admin']]['role']=='admin'
    support=open_as('support')
    support.locator('tr').filter(has_text='user@example.test').get_by_role('button',name='Bearbeiten',exact=True).click()
    support.get_by_text('Rollen können nur von Admins geändert werden.',exact=True).wait_for()
    assert support.get_by_label('Kontorolle',exact=True).count()==0
    # Once another admin exists, a self-demotion updates navigation immediately.
    admin.locator('tr').filter(has_text='user@example.test').get_by_role('button',name='Bearbeiten',exact=True).click()
    admin.get_by_label('Kontorolle',exact=True).select_option('admin')
    admin.get_by_role('button',name='Rolle speichern',exact=True).click()
    admin.get_by_text('Rolle gespeichert.',exact=True).wait_for()
    admin.locator('tr').filter(has_text='admin@example.test').get_by_role('button',name='Bearbeiten',exact=True).click()
    admin.get_by_label('Kontorolle',exact=True).select_option('teacher')
    admin.get_by_role('button',name='Rolle speichern',exact=True).click()
    admin.wait_for_url(BASE+'/')
    admin.get_by_role('heading',name='Hi, Admin',exact=True).wait_for()
    assert admin.get_by_role('link',name='Verwaltung',exact=False).count()==0
    assert not errors,errors
    print('PASS role editor, role-only RPC, last-admin error, support read-only, self-demotion navigation; simulated API')
    browser.close()
