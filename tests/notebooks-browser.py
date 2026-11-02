from browser_fixtures import *
from datetime import datetime
pages=[];errors=[];saved=[]
def api(route,role):
    url=route.request.url;args=route.request.post_data_json or {} if route.request.method=='POST' else {};name=url.split('/rpc/')[-1].split('?')[0]
    if name=='notebook_subjects':result=sorted(set(['Mathe','Informatik']+[p['subject'] for p in pages if p['owner_id']==ids[role] and p['subject']]))
    elif name=='notebook_pages':result=sorted([p for p in pages if p['owner_id']==ids[role]],key=lambda p:not p['pinned'])
    elif name=='notebook_save':
        saved.append(args);result=args['page'] or 'page'+str(len(pages)+1);old=next((p for p in pages if p['id']==result),None);revision=(old['revision'] if old else 0)+1
        pages[:]=[p for p in pages if p['id']!=result];pages.append(dict(id=result,owner_id=ids[role],subject=args['subject_name'],title=args['label'],body=args['content'],page_date=args['entry_date'],pinned=args['is_pinned'],revision=revision,updated_at=now))
    elif name=='notebook_delete':pages[:]=[p for p in pages if p['id']!=args['page']];result=None
    else:mock(route,role);return
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    def page_as(role,width=1440):
        ctx=browser.new_context(viewport={'width':width,'height':1100})
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:api(r,role));page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));return page
    user=page_as('user',390);user.goto(BASE);user.locator('.tile[data-route="/hefte"]').click();user.get_by_role('heading',name='Meine Hefte',exact=True).wait_for();user.get_by_role('heading',name='Allgemeines Heft',exact=True).wait_for();user.get_by_role('button',name='Mathe 0',exact=True).click();user.get_by_role('button',name='+ Neue Seite',exact=True).click();user.get_by_label('Titel',exact=True).fill('Bruchrechnung');user.get_by_label('Notizen',exact=True).fill('Zähler und Nenner\n<script>alert(1)</script>');user.get_by_label('Seite oben anheften',exact=True).check();user.get_by_role('button',name='Seite speichern',exact=True).click();user.get_by_text('Seite gespeichert.',exact=True).wait_for();user.get_by_role('heading',name='Bruchrechnung',exact=True).wait_for();assert saved[-1]['subject_name']=='Mathe';assert saved[-1]['is_pinned'];assert user.locator('.page-body').inner_text()=='Zähler und Nenner\n<script>alert(1)</script>';assert user.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    user.reload();user.get_by_role('button',name='Mathe 1',exact=True).click();user.get_by_role('heading',name='Bruchrechnung',exact=True).wait_for();user.get_by_label('Im Heft suchen',exact=True).fill('kein Treffer');user.get_by_text('Keine passenden Seiten gefunden.',exact=True).wait_for();user.get_by_label('Im Heft suchen',exact=True).fill('Nenner');user.get_by_role('heading',name='Bruchrechnung',exact=True).wait_for()
    with user.expect_download() as download:user.get_by_role('button',name='Heft als Text exportieren',exact=True).click()
    assert download.value.suggested_filename=='Mathe.txt'
    user.get_by_label('Im Heft suchen',exact=True).fill('');user.get_by_role('button',name='Seite bearbeiten',exact=True).click();user.get_by_label('Heft',exact=True).select_option('');user.get_by_label('Titel',exact=True).fill('Allgemeine Gedanken');user.get_by_role('button',name='Seite speichern',exact=True).click();user.get_by_role('heading',name='Allgemeines Heft',exact=True).wait_for();assert saved[-1]['expected_revision']==1
    admin=page_as('admin');admin.goto(BASE+'/hefte');admin.get_by_text('Dieses Heft ist noch leer.',exact=False).wait_for();assert not admin.get_by_role('heading',name='Allgemeine Gedanken',exact=True).count()
    user.get_by_role('button',name='+ Neue Seite',exact=True).click();user.get_by_label('Titel',exact=True).fill('Nicht gespeichert');user.on('dialog',lambda d:d.dismiss());user.get_by_role('link',name='← Hauptmenü',exact=True).click();assert user.url.endswith('/hefte');user.get_by_role('button',name='Seite speichern',exact=True).click();user.get_by_text('Seite gespeichert.',exact=True).wait_for()
    user.get_by_role('button',name='Seite löschen',exact=True).last.click();user.get_by_role('button',name='Löschen bestätigen',exact=True).click();user.get_by_text('Seite gelöscht.',exact=True).wait_for();user.screenshot(path='/tmp/notebooks-mobile.png',full_page=True)
    assert not errors,errors
    browser.close()
print('PASS notebooks: subject/general pages, literal HTML, pinning, reload, search, text export, move/edit, admin privacy, unsaved navigation guard, delete and mobile; APIs mocked')
