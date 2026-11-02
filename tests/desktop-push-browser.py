from browser_fixtures import *
errors=[];push_calls=[]
def api(route):
    url=route.request.url
    if '/rpc/portal_notifications' in url:route.fulfill(status=200,content_type='application/json',body='[]');return
    if '/rpc/hw_push_' in url or '/rpc/portal_push_' in url or '/functions/v1/homework-reminders' in url:push_calls.append(url)
    mock(route,'user')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    ctx=browser.new_context()
    ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session('user')))});window.stundenplanDesktop={{checkUpdate:async()=>({{updated:false,available:false}})}};window.pushPermissionCalls=0;Notification.requestPermission=async()=>{{window.pushPermissionCalls++;return 'granted'}};")
    ctx.route(f'https://{PROJECT}.supabase.co/**',api)
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    for path in ['/hausaufgaben','/meldungen']:
        page.goto(BASE+path);page.get_by_text('Die installierte App unterstützt Web-Push derzeit nicht.',exact=False).wait_for();link=page.get_by_role('link',name='Schulportal im Browser öffnen',exact=False);assert link.get_attribute('href')=='https://freddy-hubgit.github.io/stundenplan-11bguti/';assert link.get_attribute('target')=='_blank';assert page.get_by_role('button',name='Benachrichtigungen aktivieren',exact=True).count()==0;assert page.get_by_role('button',name='Push für Meldungen aktivieren',exact=True).count()==0;assert page.evaluate('pushPermissionCalls')==0
    assert not push_calls,push_calls;assert not errors,errors;browser.close()
print('PASS desktop UI: clear unsupported message/browser link in homework and notifications, no permission prompt or push registration; APIs mocked')
