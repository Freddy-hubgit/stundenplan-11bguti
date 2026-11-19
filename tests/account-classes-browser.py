from browser_fixtures import *
from urllib.parse import urlparse,parse_qs
A='10000000-0000-0000-0000-000000000001';B='10000000-0000-0000-0000-000000000002'
accounts={ids[r]:profile(r) for r in ['user','support','admin']};members=[dict(person_id=ids['user'],class_id=A,class_name='11A')];requests=[];errors=[];fail_assignment=False
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 def page_as(role):
  ctx=browser.new_context();ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))});")
  def api(r):
   global fail_assignment
   url=r.request.url;args=r.request.post_data_json or {} if r.request.method=='POST' else {}
   if '/profiles?' in url:
    q=parse_qs(urlparse(url).query);result=accounts[q['id'][0].removeprefix('eq.')] if 'id' in q else list(accounts.values())
   elif '/rpc/account_class_options' in url:result=[dict(id=A,name='11A'),dict(id=B,name='11B')]
   elif '/rpc/account_class_memberships' in url:result=members
   elif '/rpc/account_class_set' in url:
    requests.append(('assign',args));current=sorted(m['class_id'] for m in members if m['person_id']==args['person'])
    if fail_assignment or current!=sorted(args['expected_classes']):return r.fulfill(status=400,content_type='application/json',body=json.dumps(dict(code='40001',message='Die Klassenzuordnung wurde inzwischen geändert.')))
    members[:]=[m for m in members if m['person_id']!=args['person']]
    if args['target']:members.append(dict(person_id=args['person'],class_id=args['target'],class_name='11A' if args['target']==A else '11B'))
    result=[args['target']] if args['target'] else []
   elif '/functions/v1/quick-responder' in url:
    requests.append(('create',args));key='20000000-0000-0000-0000-00000000000'+str(sum(k.startswith('200') for k in accounts)+1);accounts[key]=dict(id=key,email=args['email'],full_name=args['name'],role='user',created_at=now);result=dict(ok=True)
   elif '/rpc/absence_identities' in url:result=[]
   else:return mock(r,role)
   r.fulfill(status=200,content_type='application/json',body=json.dumps(result))
  ctx.route(f'https://{PROJECT}.supabase.co/**',api);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+'/admin');page.get_by_role('heading',name='Bestehende Konten',exact=True).wait_for();return page
 admin=page_as('admin');row=admin.locator('tbody tr').filter(has_text='user@example.test');row.get_by_role('button',name='Bearbeiten',exact=True).click();admin.get_by_label('Klasse bearbeiten',exact=True).select_option(B);admin.get_by_role('button',name='Klasse speichern',exact=True).click();admin.get_by_text('Klasse gespeichert.',exact=True).wait_for();assert members[0]['class_id']==B
 admin.get_by_label('Klasse bearbeiten',exact=True).select_option(A);fail_assignment=True;admin.get_by_role('button',name='Klasse speichern',exact=True).click();admin.get_by_text('Die Klassenzuordnung wurde inzwischen geändert.',exact=True).wait_for();assert admin.get_by_label('Klasse bearbeiten',exact=True).input_value()==A;fail_assignment=False
 admin.get_by_role('button',name='Abbrechen',exact=True).click()
 form=admin.locator('.create-form').first;form.get_by_label('Name',exact=True).fill('Neuer Schüler');form.get_by_label('E-Mail',exact=True).fill('neu@example.test');form.get_by_label('Passwort',exact=True).fill('Testpasswort123');admin.get_by_label('Klasse beim Anlegen',exact=True).select_option(A);admin.get_by_role('button',name='Konto anlegen',exact=True).click();admin.get_by_text('Konto für Neuer Schüler wurde angelegt. Klasse zugeordnet.',exact=True).wait_for();newid=next(k for k,v in accounts.items() if v['email']=='neu@example.test');assert any(m['person_id']==newid and m['class_id']==A for m in members)
 fail_assignment=True;form.get_by_label('Name',exact=True).fill('Ohne Zuordnung');form.get_by_label('E-Mail',exact=True).fill('teilweise@example.test');form.get_by_label('Passwort',exact=True).fill('Testpasswort123');admin.get_by_label('Klasse beim Anlegen',exact=True).select_option(B);admin.get_by_role('button',name='Konto anlegen',exact=True).click();admin.get_by_text('Das Konto wurde bereits angelegt, aber die Klasse konnte nicht zugeordnet werden.',exact=False).wait_for();assert form.get_by_label('E-Mail',exact=True).input_value()=='';assert sum(kind=='create' for kind,args in requests)==2;fail_assignment=False
 admin.get_by_role('button',name='Klasse speichern',exact=True).click();admin.get_by_text('Klasse gespeichert.',exact=True).wait_for();assert sum(kind=='create' for kind,args in requests)==2
 support=page_as('support');row=support.locator('tbody tr').filter(has_text='user@example.test');row.get_by_role('button',name='Bearbeiten',exact=True).click();support.get_by_label('Klasse bearbeiten',exact=True).select_option('');support.get_by_role('button',name='Speichern',exact=True).click();support.get_by_text('Klassenzuordnung entfernt.',exact=True).wait_for();assert not any(m['person_id']==ids['user'] for m in members)
 assert support.get_by_role('button',name='Klassen & Kurse',exact=True).count()==1
 assert not support.get_by_role('button',name='Schuljahres-Reset',exact=True).count()
 assert not errors,errors;browser.close()
print('PASS account class UI: create+assign, stale edit preserved, recoverable partial creation without duplicate accounts, support edit/clear and roles preserved; APIs mocked')
