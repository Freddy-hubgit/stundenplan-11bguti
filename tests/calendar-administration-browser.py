from browser_fixtures import *
from datetime import datetime,timezone
errors=[];actions=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 def open_as(role,path):
  ctx=browser.new_context(viewport={'width':1280,'height':900},timezone_id='Europe/Berlin');ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))});")
  exams=[dict(id='shared',group_id=CLASS_ID,group_name='11BGUTI',author_id=ids['teacher'],title='Gemeinsame Arbeit',subject='Deutsch',date='2026-11-19',starts='07:30',ends='09:00',room='B211',details='',class_ids=[CLASS_ID],personal=False)]
  def api(r):
   url=r.request.url;args=r.request.post_data_json or {} if r.request.method=='POST' else {};name=url.split('/rpc/')[-1].split('?')[0]
   if '/profiles?' in url:result=profile(role) if 'id=eq.' in url else [profile(role),profile('user')]
   elif '/functions/v1/school-year-reset' in url:actions.append(args['action']);result=dict(files_pending=0,accounts_pending=0)
   elif name=='personal_exam_groups' or name=='exam_calendar_groups':result=[dict(id=CLASS_ID,name='11BGUTI')]
   elif name=='exam_calendar_list':result=exams
   elif name=='personal_exam_save':
    exams.append(dict(id='personal',group_id=args['target'],group_name='11BGUTI',author_id=ids[role],title=args['label'],subject=args['subject_name'],date=args['day'],starts=args['from_time'],ends=args['to_time'],room=args['new_room'],details=args['info'],class_ids=[CLASS_ID],personal=True));result='personal'
   elif name=='personal_exam_delete':exams[:]=[e for e in exams if e['id']!=args['exam']];result=None
   elif name=='school_my_teaching':result=dict(teacher='Herr Bendig',lessons=[])
   elif name in ['portal_events_list','substitution_list','account_class_options','account_class_memberships','absence_identities','school_people','school_rooms','school_room_slots','portal_changes','portal_trash_list']:result=[]
   elif name=='school_year_config':result=13
   else:return mock(r,role)
   r.fulfill(status=200,content_type='application/json',body=json.dumps(result))
  ctx.route(f'https://{PROJECT}.supabase.co/**',api);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.clock.install(time=datetime(2026,11,19,12,0,tzinfo=timezone.utc));page.goto(BASE+path);return page
 pupil=open_as('user','/pruefungen');pupil.locator('.exam-day[aria-current="date"]').wait_for();assert pupil.locator('.exam-day[aria-current="date"]').count()==1;assert pupil.locator('.exam-day[aria-current="date"] .day-number').inner_text()=='19';assert pupil.locator('.exam-day[aria-current="date"]').evaluate('(e)=>getComputedStyle(e).outlineStyle')=='solid'
 pupil.get_by_role('button',name='+ Persönliche Arbeit',exact=True).click();pupil.get_by_label('Titel',exact=True).fill('Meine Prüfung');pupil.get_by_label('Fach',exact=True).fill('Deutsch');pupil.get_by_role('button',name='Persönliche Arbeit speichern',exact=True).click();pupil.get_by_text('Persönliche Arbeit gespeichert.',exact=True).wait_for();own=pupil.locator('.cards .card').filter(has_text='Meine Prüfung');own.get_by_text('Persönlich · nur für dich',exact=True).wait_for();assert pupil.locator('.cards .card').filter(has_text='Gemeinsame Arbeit').get_by_role('button').count()==0
 own.get_by_role('button',name='In Papierkorb',exact=True).click();own.get_by_role('button',name='Bestätigen',exact=True).click();pupil.get_by_text('Prüfung in den Papierkorb verschoben.',exact=True).wait_for()
 admin=open_as('admin','/kalender');admin.locator('.day[aria-current="date"]').wait_for();assert admin.locator('.day[aria-current="date"]>span').first.inner_text()=='19'
 admin.goto(BASE+'/vertretungsplan');admin.locator('.calendar-trigger').click();assert admin.locator('.calendar-day[aria-current="date"]').count()==1
 teacher=open_as('teacher','/lehrerstundenplan');teacher.locator('.teaching-day[aria-current="date"]').wait_for();assert teacher.locator('.teaching-day[aria-current="date"]').count()==1
 admin.goto(BASE+'/stundenplan');admin.get_by_role('button',name='Woche',exact=True).click();assert admin.locator('.day-header[aria-current="date"]').count()==1
 admin.goto(BASE);admin.locator('.tile[data-route="/admin"]').wait_for();assert admin.locator('.tile[data-route="/klassen"],.tile[data-route="/schuljahr"],.tile[data-route="/aenderungsverlauf"],.tile[data-route="/papierkorb"]').count()==0
 admin.locator('.tile[data-route="/admin"]').click();admin.get_by_role('button',name='Schuljahres-Reset',exact=True).click();admin.locator('app-year-reset').wait_for();admin.get_by_role('button',name='Vorschau erstellen',exact=True).wait_for();assert actions==['status'];assert 'execute' not in actions
 admin.get_by_role('button',name='Änderungsverlauf',exact=True).click();admin.locator('app-change-history').wait_for();admin.get_by_role('button',name='Papierkorb',exact=True).click();admin.locator('app-trash').wait_for()
 support=open_as('support','/admin?bereich=year');support.get_by_role('heading',name='Bestehende Konten',exact=True).wait_for();assert not support.locator('app-year-reset').count();assert not support.get_by_role('button',name='Änderungsverlauf',exact=True).count();support.get_by_role('button',name='Papierkorb',exact=True).click();support.locator('app-trash').wait_for()
 pupil.goto(BASE);assert pupil.locator('.tile[data-route="/klassen"]').count()==1;assert pupil.locator('.tile[data-route="/papierkorb"]').count()==1
 assert not errors,errors;browser.close()
print('PASS calendar/admin UI: personal student exams, shared read-only, today markers across five views, embedded reset/history/trash, no automatic reset, restricted support and pupil access; APIs mocked')
