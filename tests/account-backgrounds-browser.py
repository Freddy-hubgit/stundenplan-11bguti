from browser_fixtures import *
from PIL import Image
from urllib.parse import unquote,urlparse
import io
buffer=io.BytesIO();Image.new('RGB',(96,64),(50,120,170)).save(buffer,format='PNG');png=buffer.getvalue()
remote={};uploads=[];downloads=[];fail_upload=False
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    def open_device(role='admin'):
        ctx=browser.new_context(viewport={'width':1280,'height':1000})
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        def api(route):
            url=route.request.url
            if '/storage/v1/object/' in url:
                path=unquote(urlparse(url).path)
                if route.request.method=='GET':
                    key=path.split('/account-backgrounds/',1)[1];downloads.append(key)
                    if key in remote:route.fulfill(status=200,content_type='image/png',body=remote[key])
                    else:route.fulfill(status=404,content_type='application/json',body='{"statusCode":"404","error":"not_found","message":"Object not found"}')
                elif route.request.method=='POST':
                    if fail_upload:route.fulfill(status=403,content_type='application/json',body='{"message":"Denied"}');return
                    key=path.split('/account-backgrounds/',1)[1];uploads.append(key);remote[key]=png
                    route.fulfill(status=200,content_type='application/json',body=json.dumps(dict(Key='account-backgrounds/'+key,Id='file')))
                elif route.request.method=='DELETE':
                    for key in route.request.post_data_json['prefixes']:remote.pop(key,None)
                    route.fulfill(status=200,content_type='application/json',body='[]')
                return
            mock(route,role)
        ctx.route(f'https://{PROJECT}.supabase.co/**',api)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE,wait_until='domcontentloaded');page.get_by_role('heading',name='Hi, '+role.title(),exact=True).wait_for()
        page.get_by_role('button',name='Einstellungen öffnen').click()
        return page
    a=open_device()
    a.get_by_label('Bild auswählen',exact=True).set_input_files(dict(name='private.png',mimeType='image/png',buffer=png))
    a.get_by_role('img',name='Vorschau deines Hintergrundbilds').wait_for()
    assert not uploads and not remote
    a.get_by_role('button',name='Im Konto speichern',exact=True).click()
    a.get_by_text('Kontobild aktiv',exact=True).wait_for()
    key=ids['admin']+'/background';assert uploads==[key] and key in remote
    b=open_device()
    b.get_by_role('img',name='Vorschau deines Hintergrundbilds').wait_for()
    b.get_by_text('Kontobild aktiv',exact=True).wait_for()
    # Local overrides never silently upload or replace the account picture.
    a.get_by_label('Bild auswählen',exact=True).set_input_files(dict(name='local.png',mimeType='image/png',buffer=png))
    a.get_by_text('Lokale Einstellung',exact=True).wait_for()
    assert len(uploads)==1
    a.reload(wait_until='domcontentloaded');a.get_by_role('button',name='Einstellungen öffnen').click()
    a.get_by_role('img',name='Vorschau deines Hintergrundbilds').wait_for()
    assert a.get_by_text('Lokale Einstellung',exact=True).count()==1
    a.get_by_role('button',name='Kontobild laden',exact=True).click()
    a.get_by_text('Kontobild aktiv',exact=True).wait_for()
    # Cloud failure must not remove the local picture.
    fail_upload=True
    previous=a.get_by_role('img',name='Vorschau deines Hintergrundbilds').get_attribute('src')
    a.get_by_role('button',name='Im Konto speichern',exact=True).click()
    a.get_by_role('alert').get_by_text('Kontobild konnte nicht hochgeladen werden.',exact=False).wait_for()
    assert a.get_by_role('img',name='Vorschau deines Hintergrundbilds').get_attribute('src')==previous
    fail_upload=False
    # Other accounts never request the owner's path.
    other=open_device('teacher')
    other.get_by_role('button',name='Kontobild laden',exact=True).click()
    other.get_by_text('Für dieses Konto ist kein Hintergrundbild gespeichert.',exact=True).wait_for()
    assert other.locator('.custom-background').count()==0
    assert ids['teacher']+'/background' in downloads
    # Removing only the browser picture leaves the cloud copy available on other devices.
    a.get_by_role('button',name='Hintergrundbild entfernen',exact=True).click()
    a.wait_for_function("!document.querySelector('.app-background').classList.contains('custom-background')")
    assert key in remote
    a.reload(wait_until='domcontentloaded');a.get_by_role('heading',name='Hi, Admin',exact=True).wait_for()
    assert a.locator('.custom-background').count()==0
    a.get_by_role('button',name='Einstellungen öffnen').click()
    a.get_by_role('button',name='Kontobild laden',exact=True).click()
    a.get_by_text('Kontobild aktiv',exact=True).wait_for()
    # Delete in account, preserve an explicit local copy on the deleting device.
    b.get_by_role('button',name='Kontobild löschen',exact=True).click()
    b.get_by_text('Kontobild gelöscht.',exact=False).wait_for()
    assert not remote and b.locator('.custom-background').count()==1
    a.reload(wait_until='domcontentloaded');a.get_by_role('heading',name='Hi, Admin',exact=True).wait_for()
    a.wait_for_function("!document.querySelector('.app-background').classList.contains('custom-background')")
    assert not errors,errors
    print('PASS explicit-only upload, fresh-device account download, local override, manual account load, cloud failure fallback, account isolation, local removal vs account deletion; simulated Storage API')
    browser.close()
