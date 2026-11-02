from browser_fixtures import *
errors=[];native_checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    def page_as(version):
        ctx=browser.new_context()
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session('user')))});window.stundenplanDesktop={{checkUpdate:async()=>({{available:false}}){',getAppVersion:async()=>'+json.dumps(version) if version else ''}}};")
        ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:mock(r,'user'))
        def release(route):
            native_checks.append(route.request.url)
            route.fulfill(status=200,content_type='application/json',body=json.dumps(dict(tag_name='v1.1.1',draft=False,prerelease=False,assets=[dict(name='Schulportal.Setup.1.1.1.exe',state='uploaded',size=100,browser_download_url='https://github.com/Freddy-hubgit/stundenplan-app/releases/download/v1.1.1/Schulportal.Setup.1.1.1.exe')])))
        ctx.route('https://api.github.com/repos/Freddy-hubgit/stundenplan-app/releases/latest',release)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.get_by_role('button',name='Einstellungen öffnen',exact=True).click();page.get_by_role('button',name='App-Update',exact=True).click();page.get_by_role('button',name='Auf Updates prüfen',exact=True).click();return page
    old=page_as('1.1.0');old.get_by_text('Neue Windows-Version 1.1.1 verfügbar.',exact=True).wait_for();old.get_by_text('Weboberfläche ist auf dem neuesten Stand.',exact=True).wait_for();assert old.get_by_role('link',name='Windows 1.1.1 herunterladen',exact=False).get_attribute('href').endswith('Schulportal.Setup.1.1.1.exe');assert old.get_by_text('Installiert: 1.1.0',exact=True).count()==1
    current=page_as('1.1.1');current.get_by_text('Windows-Programm 1.1.1 ist aktuell.',exact=True).wait_for();assert current.get_by_role('link',name='Windows 1.1.1 herunterladen',exact=False).count()==0
    legacy=page_as(None);legacy.get_by_text('Diese ältere App meldet ihre installierte Programmversion noch nicht.',exact=False).wait_for();assert legacy.get_by_role('link',name='Windows 1.1.1 herunterladen',exact=False).count()==1
    assert len(native_checks)==3;assert not errors,errors;browser.close()
print('PASS update UI: web current/native newer coexist, installed version and verified installer link, native current hides download and legacy version remains explicitly unknown; APIs mocked')
