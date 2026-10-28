from browser_fixtures import *
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote,urlparse
import tempfile
users={r:profile(r) for r in ['user','other','teacher','support','admin']}
users['support']['roles']=['support','teacher']
tasks=[];progress={};submissions={};files=set();push_records={};permission_calls=[]
def api(route,role):
    url=route.request.url;args=route.request.post_data_json or {} if route.request.method=='POST' and 'multipart' not in route.request.headers.get('content-type','') else {}
    me=users[role]
    if '/profiles?' in url:
        result=me if 'id=eq.' in url else list(users.values())
    elif '/rpc/hw_tasks' in url:
        result=[dict(t,done=progress.get((t['id'],me['id']),False),submitted=(t['id'],me['id']) in submissions) for t in tasks if t['is_shared'] or t['author_id']==me['id']]
    elif '/rpc/hw_save' in url:
        id=args['task'] or f'00000000-2222-0000-0000-{len(tasks)+1:012d}'
        entry=dict(id=id,author_id=me['id'],author_name=me['full_name'],title=args['task_title'],subject=args['task_subject'],description=args['details'],lesson_date=args['lesson'],due_date=args['due'],is_shared=args['shared'],requires_submission=args['submission_required'])
        tasks[:]=[t for t in tasks if t['id']!=id]+[entry];result=id
    elif '/rpc/hw_set_done' in url:progress[(args['task'],me['id'])]=args['completed'];result=None
    elif '/rpc/hw_submissions' in url:
        task=next(t for t in tasks if t['id']==args['task'])
        result=[v for (id,student),v in submissions.items() if id==task['id'] and (student==me['id'] or task['author_id']==me['id'])]
    elif '/rpc/hw_submit' in url:
        key=(args['task'],me['id']);result=submissions.get(key,{}).get('file_path','')
        submissions[key]=dict(student_id=me['id'],student_name=me['full_name'],body=args['answer'],link=args['answer_link'],file_path=args['attachment'],file_name=args['attachment_name'],submitted_at=now)
    elif '/rpc/hw_archive' in url:tasks[:]=[t for t in tasks if t['id']!=args['task']];result=None
    elif '/rpc/hw_push_settings' in url:result=[dict(reminder_time='19:00',active=me['id'] in push_records)]
    elif '/rpc/hw_push_save' in url:push_records[me['id']]=args;result=None
    elif '/rpc/hw_push_remove' in url:push_records.pop(me['id'],None);result=None
    elif '/rpc/set_profile_roles' in url:
        person=next(u for u in users.values() if u['id']==args['target_id']);person['roles']=args['new_roles'];person['role']=next(r for r in ['admin','support','teacher','user'] if r in person['roles']);result=None
    elif '/functions/v1/homework-reminders' in url:result={'publicKey':'B'+'A'*86}
    elif '/storage/v1/object/homework-submissions/' in url and route.request.method=='POST':files.add(unquote(urlparse(url).path.split('/homework-submissions/',1)[1]));result={'Key':'file','Id':'file'}
    elif '/storage/v1/object/sign/homework-submissions/' in url:result={'signedURL':'/object/sign/homework-submissions/test?token=test'}
    elif '/rpc/substitution_list' in url:result=[]
    else:mock(route,role);return
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))

push_mock="""(() => {
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test',toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}}}};
 let active=null;window.permissionRequests=0;
 Object.defineProperty(window,'Notification',{value:class {static requestPermission(){window.permissionRequests++;return Promise.resolve('granted')}},configurable:true});
 const registration={pushManager:{getSubscription:async()=>active,subscribe:async()=>{active=subscription;return active}}};
 Object.defineProperty(Navigator.prototype,'serviceWorker',{get:()=>({register:async()=>registration,ready:Promise.resolve(registration),getRegistration:async()=>registration}),configurable:true});
 if(!window.PushManager)window.PushManager=class {};
})();"""
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    def page_as(role,width=1280):
        ctx=browser.new_context(viewport={'width':width,'height':1000})
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        ctx.add_init_script(push_mock)
        ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:api(r,role))
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/hausaufgaben',wait_until='domcontentloaded')
        page.get_by_role('heading',name='Hausaufgaben',exact=True).wait_for()
        return page
    teacher=page_as('teacher')
    teacher.get_by_role('button',name='+ Aufgabe eintragen',exact=True).click()
    teacher.get_by_label('Titel',exact=True).fill('Mathe bis morgen')
    teacher.get_by_label('Fach',exact=True).fill('Mathe')
    teacher.get_by_label('Unterrichtsdatum',exact=True).fill('2030-01-07')
    assert teacher.get_by_label('Fällig am',exact=True).input_value()=='2030-01-10'
    teacher.get_by_label('Fällig am',exact=True).fill('2030-01-15')
    teacher.get_by_label('Titel',exact=True).fill('Mathe bis morgen')
    assert teacher.get_by_label('Fällig am',exact=True).input_value()=='2030-01-15'
    teacher.get_by_label('Fach',exact=True).fill('Unbekanntes Fach')
    assert teacher.get_by_label('Fällig am',exact=True).input_value()=='2030-01-15'
    teacher.get_by_text('Keine passende Stunde gefunden. Bitte Fälligkeitsdatum selbst auswählen.',exact=True).wait_for()
    teacher.get_by_label('Fach',exact=True).fill('Mathe')
    teacher.get_by_label('Fällig am',exact=True).fill('2026-10-29')
    teacher.get_by_label('Für alle Nutzer veröffentlichen',exact=True).check()
    teacher.get_by_label('Abgabe erforderlich',exact=True).check()
    teacher.get_by_role('button',name='Aufgabe speichern',exact=True).click()
    teacher.get_by_text('Aufgabe gespeichert.',exact=True).wait_for()
    student=page_as('user',390)
    task=student.locator('.task').filter(has_text='Mathe bis morgen')
    task.get_by_label('Erledigt',exact=True).check()
    assert task.count()==1 # Done but mandatory submission missing remains outstanding.
    task.get_by_role('button',name='Aufgabe abgeben',exact=True).click()
    student.get_by_label('Deine Antwort',exact=True).fill('Meine Lösung <script>alert(1)</script>')
    student.get_by_label('Link (optional)',exact=True).fill('https://example.test/answer')
    student.get_by_label('Datei (optional)',exact=True).set_input_files(dict(name='answer.pdf',mimeType='application/pdf',buffer=b'%PDF-1.4 test'))
    student.get_by_role('button',name='Abgabe speichern',exact=True).click()
    student.get_by_text('Abgabe gespeichert.',exact=True).wait_for()
    assert len(files)==1 and next(iter(files)).startswith(ids['user']+'/')
    assert student.locator('.task').count()==0 # Now complete and submitted.
    other=page_as('other');assert other.locator('.task').count()==1
    teacher.get_by_role('button',name='Abgaben ansehen',exact=True).click()
    teacher.get_by_text('Meine Lösung <script>alert(1)</script>',exact=True).wait_for()
    teacher.get_by_role('button',name='Datei herunterladen: answer.pdf',exact=True).wait_for()
    # Own tasks are private.
    student.get_by_role('button',name='+ Aufgabe eintragen',exact=True).click()
    assert student.get_by_label('Für alle Nutzer veröffentlichen',exact=True).count()==0
    student.get_by_label('Titel',exact=True).fill('Eigene Aufgabe')
    student.get_by_label('Fach',exact=True).fill('Deutsch')
    student.get_by_role('button',name='Aufgabe speichern',exact=True).click()
    student.get_by_role('heading',name='Eigene Aufgabe',exact=True).wait_for()
    other.reload();other.get_by_role('heading',name='Hausaufgaben',exact=True).wait_for()
    assert other.get_by_role('heading',name='Eigene Aufgabe',exact=True).count()==0
    # Optional push opt-in never prompts on page load.
    assert student.evaluate('window.permissionRequests')==0
    student.get_by_role('button',name='Benachrichtigungen aktivieren',exact=True).click()
    student.get_by_text('Aktiv auf diesem Gerät',exact=True).wait_for()
    assert student.evaluate('window.permissionRequests')==1 and ids['user'] in push_records
    student.get_by_role('button',name='Auf diesem Gerät deaktivieren',exact=True).click()
    student.get_by_text('Nicht aktiviert',exact=True).wait_for();assert ids['user'] not in push_records
    assert student.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
    student.screenshot(path='/tmp/homework-mobile.png',full_page=True)
    # Combined teacher + support permissions are available together.
    combo=page_as('support');combo.get_by_role('button',name='+ Aufgabe eintragen',exact=True).click()
    combo.get_by_label('Für alle Nutzer veröffentlichen',exact=True).wait_for()
    combo.goto(BASE+'/stundenplan',wait_until='domcontentloaded')
    combo.get_by_role('link',name='Hausaufgabe für',exact=False).first.click()
    combo.get_by_role('heading',name='Neue Aufgabe',exact=True).wait_for()
    assert combo.get_by_label('Fach',exact=True).input_value()
    admin=page_as('admin');admin.goto(BASE+'/admin',wait_until='domcontentloaded')
    admin.locator('tr').filter(has_text='user@example.test').get_by_role('button',name='Bearbeiten',exact=True).click()
    group=admin.locator('.multi-roles');group.get_by_label('Lehrer',exact=True).check();group.get_by_label('Support',exact=True).check()
    admin.get_by_role('button',name='Rolle speichern',exact=True).click();admin.get_by_text('Rolle gespeichert.',exact=True).wait_for()
    assert set(users['user']['roles'])=={'user','teacher','support'}
    assert group.locator('input').evaluate_all('(items)=>items.every(e=>e.getBoundingClientRect().width<=22)')
    assert admin.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
    admin.screenshot(path='/tmp/multi-role-editor.png',full_page=True)
    assert not errors,errors
    print('PASS shared/personal homework, per-user completion, required text/link/file submission, teacher review, private task visibility, optional push opt-in/out, combined roles, timetable shortcut and mobile; simulated API/browser push')
    browser.close()
