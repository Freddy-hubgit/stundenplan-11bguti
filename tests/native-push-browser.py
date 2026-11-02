from browser_fixtures import *
errors=[]
def api(route):
    if '/rpc/portal_notifications' in route.request.url:route.fulfill(status=200,content_type='application/json',body='[]');return
    mock(route,'user')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    ctx=browser.new_context()
    ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session('user')))});window.nativeToasts=[];window.nativeContexts=[];window.permissionCalls=0;Notification.requestPermission=async()=>{{window.permissionCalls++;throw new Error('No browser permission in native mode')}};window.stundenplanDesktop={{checkUpdate:async()=>({{available:false}}),notifications:{{version:1,onOpen:()=>()=>{{}},configure:async settings=>{{nativeContexts.push(settings);return {{supported:true}}}},show:async message=>{{nativeToasts.push(message);return {{ok:true}}}}}}}};")
    ctx.route(f'https://{PROJECT}.supabase.co/**',api)
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+'/hausaufgaben');page.get_by_role('button',name='Benachrichtigungen aktivieren',exact=True).click();page.get_by_text('Aktiv auf diesem Gerät',exact=True).wait_for();assert page.evaluate('nativeToasts.length')==1;assert page.evaluate('permissionCalls')==0;assert page.evaluate('nativeContexts.at(-1).homework')
    page.reload();page.get_by_role('button',name='Erinnerungszeit speichern',exact=True).wait_for();page.get_by_role('button',name='Auf diesem Gerät deaktivieren',exact=True).click();page.get_by_text('Nicht aktiviert',exact=True).wait_for();assert not page.evaluate('nativeContexts.at(-1).homework')
    page.goto(BASE+'/meldungen');page.get_by_role('button',name='Push für Meldungen aktivieren',exact=True).click();page.get_by_role('button',name='Push ist aktiviert',exact=True).wait_for();assert page.evaluate('nativeContexts.at(-1).alerts');assert page.evaluate('permissionCalls')==0;assert not errors,errors;browser.close()
print('PASS native desktop UI: direct homework/alert opt-in, persisted state, native Windows toast bridge, disable and no browser push permission; APIs mocked')
