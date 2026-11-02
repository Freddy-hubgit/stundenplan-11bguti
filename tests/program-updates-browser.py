from browser_fixtures import *
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    ctx=browser.new_context()
    ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session('user')))});")
    ctx.add_init_script('''window.programState={supported:true,phase:'idle',currentVersion:'1.2.0'};window.installs=0;
      window.stundenplanDesktop={getAppVersion:async()=> '1.2.0',checkUpdate:async()=>({available:false}),programUpdater:{version:1,
      status:async()=>window.programState,check:async()=>window.programState={...window.programState,phase:'available',availableVersion:'1.3.0'},
      download:async()=>{window.programState={...window.programState,phase:'downloading',percent:45};await new Promise(r=>setTimeout(r,1800));return window.programState={...window.programState,phase:'downloaded',percent:100};},
      install:async()=>{window.installs++;return window.programState={...window.programState,phase:'installing'};}}};''')
    ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:mock(r,'user'))
    ctx.route('https://api.github.com/repos/Freddy-hubgit/stundenplan-app/releases/latest',lambda r:r.fulfill(status=503,body='offline'))
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE)
    page.get_by_role('button',name='Einstellungen öffnen',exact=True).click();page.get_by_role('button',name='App-Update',exact=True).click()
    page.get_by_role('button',name='Auf Updates prüfen',exact=True).click()
    page.get_by_role('button',name='Programmupdate herunterladen',exact=True).click()
    page.get_by_text('Download: 45 %',exact=True).wait_for()
    page.get_by_role('button',name='Jetzt installieren und neu starten',exact=True).wait_for()
    assert page.evaluate('window.installs')==0
    page.get_by_role('button',name='Jetzt installieren und neu starten',exact=True).click()
    assert page.evaluate('window.installs')==1
    assert not errors,errors
    browser.close()
print('PASS native program UI: independent from release API errors, download progress, ready state and explicit install; native APIs mocked')
