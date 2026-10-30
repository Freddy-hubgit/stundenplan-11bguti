from browser_fixtures import *
from datetime import datetime
groups=[];members=[];schedules={};exams=[];materials=[];tasks=[];files=set();reset_calls=[];errors=[]
def allowed(role,g):return role in ['admin','support'] or any(m['group_id']==g and m['user_id']==ids[role] for m in members)
def teaches(role,g):return role=='admin' or role=='teacher' and any(m['group_id']==g and m['user_id']==ids[role] and m['member_kind']=='teacher' for m in members)
def api(route,role):
    url=route.request.url;args=route.request.post_data_json or {} if route.request.method=='POST' and 'multipart' not in route.request.headers.get('content-type','') else {}
    if '/profiles?' in url:result={**profile(role),'roles':[profile(role)['role']]}
    elif '/rpc/school_groups' in url:result=[dict(g,can_teach=teaches(role,g['id'])) for g in groups if allowed(role,g['id'])]
    elif '/rpc/school_group_save' in url:
        result=f'20000000-0000-0000-0000-{len(groups)+1:012d}';groups.append(dict(id=result,name=args['label'],kind=args['group_kind'],parent_id=args['parent'],grade=None));schedules[result]=[]
    elif '/rpc/school_grade' in url:next(g for g in groups if g['id']==args['target'])['grade']=args['new_grade'];result=None
    elif '/rpc/school_year_config' in url:result=13
    elif '/rpc/school_people' in url:result=[dict(id=ids[r],full_name=r.title(),roles=[profile(r)['role']]) for r in ['user','other','teacher','support','admin']]
    elif '/rpc/school_roster' in url:result=[dict(m,full_name=next(r.title() for r,id in ids.items() if id==m['user_id'])) for m in members if m['group_id']==args['target']]
    elif '/rpc/school_enrol' in url:
        members[:]=[m for m in members if not(m['group_id']==args['target'] and m['user_id']==args['person'])]
        if not args['remove_member']:members.append(dict(group_id=args['target'],user_id=args['person'],member_kind=args['member_type']))
        result=None
    elif '/rpc/school_timetable' in url:result=[dict(l,group_id=args['target']) for l in schedules.get(args['target'],[])]
    elif '/rpc/school_lessons' in url:result=schedules.get(args['target'],[])
    elif '/rpc/school_schedule_save' in url:schedules[args['target']]=args['entries'];result=None
    elif '/rpc/school_exams' in url:result=[e for e in exams if allowed(role,e['group_id'])]
    elif '/rpc/school_exam_conflicts' in url:result=0
    elif '/rpc/school_exam_save' in url:
        result='exam1';exams[:]=[dict(id=result,group_id=args['target'],group_name=next(g['name'] for g in groups if g['id']==args['target']),author_id=ids[role],title=args['label'],subject=args['subject_name'],date=args['day'],starts=args['from_time'],ends=args['to_time'],room=args['new_room'],details=args['info'])]
    elif '/rpc/school_materials' in url:result=[m for m in materials if allowed(role,m['group_id'])]
    elif '/storage/v1/object/school-materials/' in url and route.request.method=='POST':files.add(url.split('/school-materials/',1)[1]);result={'Key':'file','Id':'file'}
    elif '/rpc/school_material_save' in url:
        result='material1';materials.append(dict(id=result,group_id=args['target'],group_name=next(g['name'] for g in groups if g['id']==args['target']),author_id=ids[role],title=args['label'],subject=args['subject_name'],description=args['details'],link=args['external_link'],file_path=args['path'],file_name=args['filename'],created_at=now))
    elif '/rpc/hw_tasks_group' in url:result=[t for t in tasks if t['author_id']==ids[role] or t['is_shared'] and allowed(role,t['group_id'])]
    elif '/rpc/hw_save_group' in url:
        result='task1';tasks.append(dict(id=result,group_id=args['target'],group_name=next(g['name'] for g in groups if g['id']==args['target']),author_id=ids[role],author_name=role.title(),title=args['task_title'],subject=args['task_subject'],description=args['details'],lesson_date=args['lesson'],due_date=args['due'],is_shared=args['shared'],requires_submission=args['submission_required'],done=False,submitted=False))
    elif '/rpc/substitution_list' in url:result=[]
    elif '/rpc/dm_unread' in url:result=2 if role=='user' else 0
    elif '/rpc/portal_notifications' in url:result=[]
    elif '/rpc/hw_push_settings' in url:result=[dict(reminder_time='19:00',active=False)]
    elif '/functions/v1/school-year-reset' in url:
        reset_calls.append(args)
        if args['action']=='preview':result=dict(token='preview1',counts={'Hausaufgaben':len(tasks),'Materialien':len(materials),'Abschlusskonten':1 if args['delete_graduates'] else 0},graduates=[dict(id=ids['other'],name='Other')] if args['delete_graduates'] else [],confirmation='SCHULJAHR UND ABSCHLUSSKONTEN LÖSCHEN' if args['delete_graduates'] else 'SCHULJAHR ZURÜCKSETZEN')
        else:result=dict(ok=args['action']!='status',files_pending=0,accounts_pending=0,cleanup_errors=[])
    else:mock(route,role);return
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    def page_as(role,width=1440):
        ctx=browser.new_context(viewport={'width':width,'height':1100})
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:api(r,role))
        page=ctx.new_page();page.clock.install(time=datetime(2026,10,26,8,30));page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());return page
    admin=page_as('admin');admin.goto(BASE+'/klassen')
    admin.locator('input[name=name]').fill('11A');admin.get_by_role('button',name='Gruppe anlegen',exact=True).click();admin.get_by_text('Gruppe angelegt. Jetzt Personen zuordnen und Stundenplan einrichten.',exact=True).wait_for()
    first=groups[0]['id'];admin.get_by_role('button',name='Bisherigen Stundenplan als Vorlage übernehmen',exact=True).click();admin.get_by_text('Vorlage übernommen. Der Stundenplan kann anschließend bearbeitet werden.',exact=True).wait_for();assert schedules[first]
    admin.get_by_label('Person',exact=False).select_option(ids['teacher']);admin.get_by_label('Zuordnung',exact=False).select_option('teacher');admin.get_by_role('button',name='Person zuordnen',exact=True).click();admin.get_by_text('Zuordnung gespeichert.',exact=True).wait_for()
    admin.get_by_label('Person',exact=False).select_option(ids['user']);admin.get_by_label('Zuordnung',exact=False).select_option('student');admin.get_by_role('button',name='Person zuordnen',exact=True).click();admin.get_by_text('Zuordnung gespeichert.',exact=True).wait_for()
    admin.locator('input[name=name]').fill('13B');admin.locator('input[name=grade]').fill('13');admin.get_by_role('button',name='Gruppe anlegen',exact=True).click();admin.get_by_text('Gruppe angelegt. Jetzt Personen zuordnen und Stundenplan einrichten.',exact=True).wait_for();second=groups[1]['id']
    admin.get_by_label('Person',exact=False).select_option(ids['other']);admin.get_by_role('button',name='Person zuordnen',exact=True).click();admin.get_by_text('Zuordnung gespeichert.',exact=True).wait_for()
    teacher=page_as('teacher');teacher.goto(BASE+'/materialien');teacher.locator('input[name=title]').fill('Mathe Arbeitsblatt');teacher.locator('input[name=subject]').fill('Mathe');teacher.get_by_label('Datei (optional)',exact=True).set_input_files(dict(name='blatt.pdf',mimeType='application/pdf',buffer=b'%PDF-1.4 test'));teacher.get_by_role('button',name='Material veröffentlichen',exact=True).click();teacher.get_by_role('heading',name='Mathe Arbeitsblatt',exact=True).wait_for();assert len(files)==1
    teacher.goto(BASE+'/stundenplan');teacher.get_by_role('button',name='Prüfung eintragen',exact=True).click();teacher.locator('app-exam-plan input[name=title]').fill('Mathe Klausur');teacher.locator('app-exam-plan input[name=subject]').fill('Mathe');teacher.locator('app-exam-plan input[name=date]').fill('2026-10-26');teacher.locator('app-exam-plan input[name=start]').fill('11:00');teacher.locator('app-exam-plan input[name=end]').fill('12:30');teacher.get_by_role('button',name='Prüfung speichern',exact=True).click();teacher.locator('.exam-badge').filter(has_text='Mathe Klausur').wait_for()
    teacher.goto(BASE+'/hausaufgaben');teacher.get_by_role('button',name='+ Aufgabe eintragen',exact=True).click();teacher.get_by_label('Titel',exact=True).fill('Gezielte Aufgabe');teacher.get_by_label('Fach',exact=True).fill('Mathe');teacher.get_by_label('Für Klasse oder Kurs veröffentlichen',exact=True).check();teacher.get_by_role('button',name='Aufgabe speichern',exact=True).click();teacher.get_by_text('Aufgabe gespeichert.',exact=True).wait_for()
    user=page_as('user',390);user.goto(BASE+'/materialien');user.get_by_role('heading',name='Mathe Arbeitsblatt',exact=True).wait_for();assert user.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    user.goto(BASE+'/stundenplan');user.locator('.exam-badge').filter(has_text='Mathe Klausur').wait_for();user.goto(BASE);user.get_by_role('heading',name='Deine Übersicht',exact=True).wait_for();user.locator('app-dashboard').get_by_text('Mathe: Gezielte Aufgabe',exact=False).wait_for();assert user.locator('app-dashboard .count').inner_text()=='2'
    other=page_as('other');other.goto(BASE+'/materialien');other.get_by_role('heading',name='Materialablage',exact=True).wait_for();assert other.get_by_role('heading',name='Mathe Arbeitsblatt',exact=True).count()==0;other.goto(BASE+'/stundenplan');other.get_by_text('Keine Prüfungen in dieser Ansicht.',exact=True).wait_for()
    # Right click opens direct customization; right-button drag changes persistent tile order.
    home=page_as('user');home.goto(BASE);tile=home.locator('.tile[data-route="/stundenplan"]');tile.click(button='right');home.locator('.tile-context select').select_option('rose');assert json.loads(home.evaluate("localStorage.getItem('portal-home:'+"+json.dumps(ids['user'])+")"))['colors']['/stundenplan']=='rose';home.locator('.tile-context').get_by_role('button',name='Schließen',exact=True).click()
    source=tile.bounding_box();target=home.locator('.tile[data-route="/materialien"]').bounding_box();home.mouse.move(source['x']+source['width']/2,source['y']+source['height']/2);home.mouse.down(button='right');home.mouse.move(target['x']+target['width']/2,target['y']+target['height']/2,steps=12);home.mouse.up(button='right');prefs=json.loads(home.evaluate("localStorage.getItem('portal-home:'+"+json.dumps(ids['user'])+")"));assert prefs['order'].index('/stundenplan')<prefs['order'].index('/materialien');assert home.url.rstrip('/')==BASE
    admin.goto(BASE+'/schuljahr');admin.get_by_label('Zusätzlich Schülerkonten des Abschlussjahrgangs',exact=False).check();admin.get_by_role('button',name='Vorschau erstellen',exact=True).click();admin.get_by_role('heading',name='Betroffene Abschlusskonten',exact=False).wait_for();assert admin.get_by_role('button',name='Ausgewählte Daten endgültig löschen',exact=True).is_disabled();admin.locator('input[autocomplete=off]').fill('SCHULJAHR UND ABSCHLUSSKONTEN LÖSCHEN');admin.get_by_role('button',name='Ausgewählte Daten endgültig löschen',exact=True).click();admin.get_by_text('Aktion ausgeführt.',exact=True).wait_for();assert [c['action'] for c in reset_calls]==['status','preview','execute']
    teacher.goto(BASE+'/schuljahr');teacher.locator('.portal-home h1').wait_for()
    assert not errors,errors
    home.screenshot(path='/tmp/school-home.png',full_page=True)
    browser.close()
print('PASS classes/grades/enrolment, scoped homework/material upload, exam lesson badges, dashboard, right-click colors/right-drag, mobile and guarded reset preview/confirmation; APIs mocked')
