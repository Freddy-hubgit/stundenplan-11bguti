from browser_fixtures import *
from datetime import date
errors=[];calls=[];today=date.today().isoformat()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 def open_as(role,path):
  ctx=b.new_context();ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))});")
  grade=dict(id='grade1',student_id=ids['user'],student_name='Schüler Eins',group_id=CLASS_ID,group_name='11BGUTI',author_id=ids['user'],subject='Deutsch',title='Klausur',term='2026/27',entry_date=today,scale='grade',category='written',weight=2,student_value=2,teacher_value=None,teacher_name=None,self_value=2 if role=='user' else None,self_notes='Eigene Begründung' if role=='user' else None,can_edit=True,revision=1)
  slot=dict(id='slot1',teacher_id=ids['teacher'],teacher_name='Herr Bendig',starts_at=today+'T16:00:00Z',ends_at=today+'T16:30:00Z',location='B211',booking_id=None,student_name=None,topic=None,available=True,can_manage=role=='teacher',can_cancel=False)
  trash=[dict(id='trash1',kind='notebook',title='Gelöschte Heftseite',deleted_at=today,expires_at='2099-12-31')]
  def route(r):
   name=r.request.url.split('/rpc/')[-1].split('?')[0];args=r.request.post_data_json or {} if r.request.method=='POST' else {}
   if '/rpc/' not in r.request.url:return mock(r,role)
   calls.append((role,name,args))
   result=None
   if name=='learning_grades':result=[grade]
   elif name=='learning_roster':result=[dict(id=ids['user'],name='Schüler Eins')]
   elif name=='learning_grade_save':
    grade['teacher_value']=args['score'];grade['teacher_name']='Herr Bendig';grade['self_value']=2;grade['self_notes']='Erst jetzt sichtbar';grade['revision']+=1;result='grade1'
   elif name=='learning_assess':grade['self_value']=args['score'];grade['self_notes']=args['comment']
   elif name=='exam_calendar_groups':result=[dict(id=CLASS_ID,name='11BGUTI')]
   elif name=='exam_calendar_list':result=[]
   elif name=='school_exam_save':return r.fulfill(status=400,content_type='application/json',body=json.dumps(dict(code='23514',message='In dieser Klasse sind bereits drei Klassenarbeiten in dieser Woche eingetragen.')))
   elif name=='consultation_list':result=[slot]
   elif name=='consultation_book':slot['booking_id']='book1';slot['student_name']='Schüler Eins';slot['topic']=args['details'];slot['available']=False;slot['can_cancel']=True;result='book1'
   elif name=='portal_search':result=[dict(kind='Heft',id='note1',title='Deutsch Zusammenfassung',preview='Meine eigene Zusammenfassung',route='/hefte')]
   elif name=='portal_trash_list':result=trash
   elif name=='portal_trash_restore':trash.clear()
   elif name=='school_my_teaching':result=dict(teacher='Herr Bendig',lessons=[dict(day='Mon',subject='Eigener Deutschunterricht',teacher='Herr Bendig',start='07:30',end='09:00',room='B211',group_id=CLASS_ID,group_name='11BGUTI'),dict(day='Tue',subject='Fremde Mathematik',teacher='Herr Lenz',start='11:00',end='12:30',room='B211',group_id=CLASS_ID,group_name='11BGUTI')])
   elif name=='substitution_list':result=[]
   else:return mock(r,role)
   r.fulfill(status=200,content_type='application/json',body=json.dumps(result))
  ctx.route(f'https://{PROJECT}.supabase.co/**',route);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+path);return page
 teacher=open_as('teacher','/noten');teacher.get_by_text('Erst nach eigener Noteneingabe sichtbar.',exact=True).wait_for();assert teacher.get_by_text('Erst jetzt sichtbar',exact=True).count()==0
 teacher.get_by_role('button',name='Bearbeiten',exact=True).click();teacher.get_by_label('Eigene Lehrernote',exact=True).fill('3');teacher.get_by_role('button',name='Speichern',exact=True).click();teacher.get_by_text('Erst jetzt sichtbar',exact=True).wait_for()
 student=open_as('user','/noten');student.get_by_role('button',name='Selbsteinschätzung',exact=True).click();student.get_by_label('Note oder Punkte im Notensystem des Eintrags',exact=True).fill('1.5');student.get_by_label('Begründung (optional)',exact=True).fill('Meine Einschätzung');student.get_by_role('button',name='Selbsteinschätzung speichern',exact=True).click();student.get_by_text('Selbsteinschätzung gespeichert.',exact=True).wait_for()
 exams=open_as('teacher','/pruefungen');exams.get_by_role('button',name='+ Klassenarbeit',exact=True).click();exams.get_by_label('Fach',exact=True).fill('Deutsch');exams.get_by_label('Titel',exact=True).fill('Vierte Arbeit');exams.get_by_role('button',name='Klassenarbeit speichern',exact=True).click();exams.get_by_text('In dieser Klasse sind bereits drei Klassenarbeiten in dieser Woche eingetragen.',exact=True).wait_for();assert exams.get_by_label('Titel',exact=True).input_value()=='Vierte Arbeit';exams.get_by_label('Reihenfolge',exact=False).select_option(label='Nach Klassen')
 consult=open_as('user','/sprechstunden');consult.get_by_role('button',name='Buchen',exact=True).click();consult.get_by_label('Gesprächsthema',exact=True).fill('Fragen zu Deutsch');consult.get_by_role('button',name='Verbindlich buchen',exact=True).click();consult.get_by_text('Sprechstunde gebucht.',exact=True).wait_for();assert consult.get_by_text('Fragen zu Deutsch',exact=False).count()==1
 search=open_as('user','/suche');search.get_by_label('Suchbegriff',exact=True).fill('Deutsch');search.get_by_role('button',name='Suchen',exact=True).click();search.get_by_role('link',name='Deutsch Zusammenfassung',exact=True).wait_for();assert search.get_by_role('link',name='Deutsch Zusammenfassung',exact=True).get_attribute('href').endswith('/hefte?item=note1')
 recycle=open_as('user','/papierkorb');recycle.get_by_text('Gelöschte Heftseite',exact=True).wait_for();recycle.get_by_role('button',name='Wiederherstellen',exact=True).click();recycle.get_by_text('Eintrag wiederhergestellt.',exact=True).wait_for();assert recycle.get_by_text('Gelöschte Heftseite',exact=True).count()==0
 teaching=open_as('teacher','/lehrerstundenplan');teaching.get_by_text('Eigener Deutschunterricht',exact=True).wait_for();assert teaching.get_by_text('Fremde Mathematik',exact=True).count()==0
 assert not errors,errors;b.close()
print('PASS learning UI: teacher blind assessment, student self-assessment, class calendar limit/error recovery, booking, search links, trash restore, own weekly teaching; APIs mocked')
