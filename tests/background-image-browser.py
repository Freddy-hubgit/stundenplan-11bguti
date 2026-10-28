from browser_fixtures import *
import io
from PIL import Image
image=Image.new('RGB',(96,64),(40,120,180));buffer=io.BytesIO();image.save(buffer,format='PNG');png=buffer.getvalue()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    for width in [1440,390]:
        ctx=browser.new_context(viewport={'width':width,'height':1000})
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session('admin')))})")
        def api(route):
            url=route.request.url
            if '/profiles?' in url and 'id=eq.' not in url:result=[]
            elif any('/rpc/'+name in url for name in ['portal_events_list','substitution_list','support_tickets','dm_people','dm_threads']):result=[]
            else:mock(route,'admin');return
            route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
        ctx.route(f'https://{PROJECT}.supabase.co/**',api)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE,wait_until='domcontentloaded');page.get_by_role('heading',name='Hi, Admin',exact=True).wait_for()
        page.get_by_role('button',name='Einstellungen öffnen').click()
        upload=page.get_by_label('Bild auswählen',exact=True)
        upload.set_input_files(dict(name='background.png',mimeType='image/png',buffer=png))
        page.get_by_role('img',name='Vorschau deines Hintergrundbilds').wait_for()
        assert page.locator('.app-background.custom-background').count()==1
        page.get_by_role('button',name='Schließen',exact=True).click()
        for path in ['/admin','/support','/nachrichten','/vertretungsplan','/kalender','/videokonferenz','/stundenplan']:
            page.goto(BASE+path,wait_until='domcontentloaded')
            shell=page.locator('.portal-shell,.admin-shell,.app-shell').first
            shell.wait_for()
            page.wait_for_function("document.querySelector('.app-background')?.classList.contains('custom-background')")
            assert 'blob:' in shell.evaluate('(e)=>getComputedStyle(e).backgroundImage'),path
        page.get_by_role('button',name='⚙ Einstellungen',exact=True).click()
        page.get_by_role('button',name='Darstellung',exact=True).click()
        page.get_by_role('img',name='Vorschau deines Hintergrundbilds').wait_for()
        page.get_by_role('button',name='Fertig',exact=True).click()
        page.goto(BASE,wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('.app-background')?.classList.contains('custom-background')")
        page.get_by_role('button',name='Einstellungen öffnen').click()
        # Reject invalid content and oversized inputs while keeping the existing image.
        upload=page.get_by_label('Bild auswählen',exact=True)
        upload.set_input_files(dict(name='not-an-image.png',mimeType='image/png',buffer=b'not an image'))
        page.get_by_role('alert').get_by_text('Das Bild konnte nicht gelesen werden.',exact=True).wait_for()
        assert page.get_by_role('img',name='Vorschau deines Hintergrundbilds').count()==1
        upload.set_input_files(dict(name='large.png',mimeType='image/png',buffer=b'x'*(10*1024*1024+1)))
        page.get_by_role('alert').get_by_text('Das Bild darf höchstens 10 MB groß sein.',exact=True).wait_for()
        previous=page.get_by_role('img',name='Vorschau deines Hintergrundbilds').get_attribute('src')
        page.evaluate("() => {window.savedTransaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(stores,mode,...rest){if(mode==='readwrite')throw new DOMException('Test quota','QuotaExceededError');return window.savedTransaction.call(this,stores,mode,...rest);};}")
        upload.set_input_files(dict(name='replacement.png',mimeType='image/png',buffer=png))
        page.get_by_role('alert').get_by_text('Das Bild konnte nicht in diesem Browser gespeichert werden. Das bisherige Bild bleibt erhalten.',exact=True).wait_for()
        assert page.get_by_role('img',name='Vorschau deines Hintergrundbilds').get_attribute('src')==previous
        page.evaluate('() => {IDBDatabase.prototype.transaction=window.savedTransaction;}')
        page.get_by_role('button',name='Hell',exact=True).click()
        page.get_by_role('button',name='Schließen',exact=True).click()
        assert page.locator('.app-background.light-background.custom-background').count()==1
        page.screenshot(path=f'/tmp/custom-background-{width}.png')
        # A preset replaces and removes the custom image, including its persisted copy.
        page.get_by_role('button',name='Einstellungen öffnen').click()
        page.get_by_role('button',name='Aurora',exact=True).click()
        page.wait_for_function("!document.querySelector('.app-background').classList.contains('custom-background')")
        page.reload(wait_until='domcontentloaded');page.get_by_role('heading',name='Hi, Admin',exact=True).wait_for()
        assert page.locator('.custom-background').count()==0
        page.get_by_role('button',name='Einstellungen öffnen').click()
        page.get_by_label('Bild auswählen',exact=True).set_input_files(dict(name='background.png',mimeType='image/png',buffer=png))
        page.get_by_role('img',name='Vorschau deines Hintergrundbilds').wait_for()
        page.get_by_role('button',name='Hintergrundbild entfernen',exact=True).click()
        page.wait_for_function("!document.querySelector('.app-background').classList.contains('custom-background')")
        assert page.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
        print('PASS background upload/persistence/all routes/preset/remove/validation/theme/mobile',width)
        ctx.close()
    # The same browser database retains separate images per account.
    ctx=browser.new_context()
    ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:mock(r,'user'))
    page=ctx.new_page()
    page.add_init_script(f"if (!localStorage.getItem('sb-{PROJECT}-auth-token')) localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session('user')))});")
    page.goto(BASE);page.get_by_role('heading',name='Hi, User',exact=True).wait_for()
    page.get_by_role('button',name='Einstellungen öffnen').click()
    page.get_by_label('Bild auswählen',exact=True).set_input_files(dict(name='private.png',mimeType='image/png',buffer=png))
    page.get_by_role('img',name='Vorschau deines Hintergrundbilds').wait_for()
    page.evaluate("([key,token])=>localStorage.setItem(key,token)",[f'sb-{PROJECT}-auth-token',json.dumps(session('teacher'))])
    page.reload(wait_until='domcontentloaded');page.get_by_role('heading',name='Hi, User',exact=True).wait_for()
    page.wait_for_timeout(300)
    assert page.locator('.custom-background').count()==0
    page.evaluate("([key,token])=>localStorage.setItem(key,token)",[f'sb-{PROJECT}-auth-token',json.dumps(session('user'))])
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('.app-background')?.classList.contains('custom-background')")
    page.evaluate("key=>localStorage.setItem(key,'null')",f'sb-{PROJECT}-auth-token')
    page.reload(wait_until='domcontentloaded');page.wait_for_url('**/login')
    assert page.locator('.custom-background').count()==0
    assert not errors,errors
    print('PASS account isolation and restoration from IndexedDB')
    browser.close()
