from browser_fixtures import *
disabled=set();changes=[];errors=[]
def api(route,role):
    url=route.request.url;args=route.request.post_data_json or {} if route.request.method=='POST' else {}
    if '/profiles?' in url:result=profile(role) if 'id=eq.' in url else [profile(r) for r in ['user','teacher','support','admin']]
    elif '/rpc/absence_identities' in url:result=[]
    elif '/rpc/portal_disabled_tiles' in url:result=sorted(disabled)
    elif '/rpc/portal_tile_save' in url:
        changes.append(args)
        if args['is_enabled']:disabled.discard(args['tile_route'])
        else:disabled.add(args['tile_route'])
        result=None
    elif '/rpc/portal_notifications' in url or '/rpc/substitution_list' in url or '/rpc/portal_events_list' in url:result=[]
    elif '/rpc/school_my_teaching' in url:result=dict(teacher='',lessons=[])
    else:mock(route,role);return
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    def page_as(role):
        context=browser.new_context(viewport={'width':1440,'height':1100})
        context.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        context.route(f'https://{PROJECT}.supabase.co/**',lambda r:api(r,role))
        page=context.new_page();page.clock.install();page.on('pageerror',lambda e:errors.append(str(e)));return page
    admin=page_as('admin');admin.goto(BASE+'/admin');admin.get_by_role('heading',name='Kacheln im Hauptmenü',exact=True).wait_for();checkbox=admin.get_by_label('Materialablage',exact=True);checkbox.wait_for();assert checkbox.is_checked();checkbox.uncheck();admin.get_by_text('Kachel für alle Nutzer deaktiviert.',exact=True).wait_for();assert changes[-1]==dict(tile_route='/materialien',is_enabled=False)
    user=page_as('user');user.goto(BASE);user.locator('.tile[data-route="/stundenplan"]').wait_for();assert user.locator('.tile[data-route="/materialien"]').count()==0
    user.get_by_role('button',name='Einstellungen öffnen',exact=True).click();user.get_by_role('button',name='Startbildschirm',exact=True).click();user.locator('.tile-setting').first.wait_for();assert not user.locator('.tile-setting').filter(has_text='Materialablage').count()
    support=page_as('support');support.goto(BASE+'/admin');support.get_by_role('heading',name='Bestehende Konten',exact=True).wait_for();assert not support.get_by_role('heading',name='Kacheln im Hauptmenü',exact=True).count()
    checkbox.check();admin.get_by_text('Kachel aktiviert.',exact=True).wait_for();user.clock.fast_forward(31000);user.locator('.tile[data-route="/materialien"]').wait_for(state='attached');assert not errors,errors
    browser.close()
print('PASS admin central tile toggle, cross-account persistence, personal settings cannot restore disabled tile, support denied and reactivation; APIs mocked')
