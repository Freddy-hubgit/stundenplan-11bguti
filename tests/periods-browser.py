from browser_fixtures import *
from datetime import datetime
calls={};reports=[];entries=[];exams=[];bookings=[];lessons=DEFAULT_SCHOOL_LESSONS.copy();errors=[]
def api(route,role):
    url=route.request.url;args=route.request.post_data_json or {} if route.request.method=='POST' else {};name=url.split('/rpc/')[-1].split('?')[0]
    result=None
    if name=='school_rooms':result=[dict(id='room1',name='B211',details='',bookable=True)]
    elif name=='school_room_slots':result=bookings
    elif name=='school_room_book':
        calls['booking']=args;result='book'+str(len(bookings));bookings.append(dict(id=result,room_id=args['target'],label=args['label'],starts_at=args['from_time'],ends_at=args['to_time'],can_cancel=True,teaching=False))
    elif name=='absence_identities':result=[dict(user_id=ids['teacher'],full_name='Teacher',timetable_name='Herr Bendig')]
    elif name=='absence_list':result=reports
    elif name=='absence_request':
        calls['absence']=args;result='report1';reports.append(dict(id=result,teacher_id=ids['teacher'],teacher_name='Herr Bendig',start_date=args['first_day'],end_date=args['last_day'],starts=args['from_time'],ends=args['to_time'],requested_kind=args['request_kind'],requested_teacher='',status='reported',resolution='',replacement_teacher='',excluded_dates=[]))
    elif name=='absence_edit_period':calls['period_edit']=args;reports[0].update(starts=args['from_time'],ends=args['to_time'])
    elif name=='substitution_list':result=entries
    elif name=='substitution_save':
        calls['substitution']=args;result='entry1';entries.append(dict(id=result,date=args['entry_date'],teacher=args['absent_teacher'],start_time=args['starts'],end_time=args['ends'],kind=args['entry_kind'],replacement_teacher=args['replacement'],room=args['new_room'],note=args['info'],updated_at=now))
    elif name=='school_exams':result=exams
    elif name=='school_exam_save':
        calls['exam']=args;result='exam1';exams.append(dict(id=result,group_id=args['target'],group_name='11BGUTI',author_id=ids['teacher'],title=args['label'],subject=args['subject_name'],date=args['day'],starts=args['from_time'],ends=args['to_time'],room=args['new_room'],details=args['info']))
    elif name=='school_timetable':result=[dict(l,group_id=CLASS_ID) for l in lessons]
    elif name=='school_schedule_save':calls['schedule']=args;lessons[:]=args['entries']
    elif name=='school_my_teaching':result=dict(teacher='Herr Bendig',lessons=[l for l in lessons if l['teacher']=='Herr Bendig'])
    elif name=='portal_notifications':result=[]
    else:mock(route,role);return
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
labels=['07:30–08:15','08:15–09:00','09:15–10:00','10:00–10:45','11:00–11:45','11:45–12:30','13:00–13:45','13:45–14:30','14:45–15:30','15:30–16:15']
def pick(group,first,last):
    group.get_by_label('Ab Stunde',exact=True).select_option(label=f'{first}. Stunde · {labels[first-1]}')
    group.get_by_label('Bis Stunde',exact=True).select_option(label=f'{last}. Stunde · {labels[last-1]}')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    def page_as(role,width=1440):
        ctx=browser.new_context(viewport={'width':width,'height':1100},timezone_id='Europe/Berlin')
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:api(r,role));page=ctx.new_page();page.clock.install(time=datetime(2026,10,31,8,0));page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());return page
    student=page_as('user',390);student.goto(BASE+'/raumbuchung');student.get_by_label('Datum',exact=True).fill('2026-11-09');student.get_by_label('Raum',exact=True).select_option('room1');student.get_by_label('Anlass',exact=True).fill('Doppelstunde');group=student.get_by_role('group',name='Raum für Unterrichtsstunden buchen',exact=True);pick(group,3,4);student.get_by_role('button',name='Raum verbindlich buchen',exact=True).click();student.get_by_text('Raum gebucht.',exact=True).wait_for();assert calls['booking']['from_time']=='2026-11-09T08:15:00.000Z';assert calls['booking']['to_time']=='2026-11-09T09:45:00.000Z';student.locator('.slot').filter(has_text='3.–4. Stunde').wait_for();assert student.evaluate('document.documentElement.scrollWidth<=innerWidth+1');student.screenshot(path='/tmp/period-booking-mobile.png',full_page=True)
    group.get_by_label('Zeitauswahl',exact=True).select_option('custom');group.get_by_label('Von',exact=True).fill('17:00');group.get_by_label('Bis',exact=True).fill('18:00');student.get_by_label('Anlass',exact=True).fill('Besprechung');student.get_by_role('button',name='Raum verbindlich buchen',exact=True).click();student.get_by_text('Raum gebucht.',exact=True).wait_for();assert calls['booking']['from_time']=='2026-11-09T16:00:00.000Z'
    teacher=page_as('teacher');teacher.goto(BASE+'/krankmeldung');group=teacher.get_by_role('group',name='Täglich fehlende Unterrichtsstunden',exact=True);pick(group,1,2);teacher.get_by_role('button',name='Antrag senden',exact=True).click();teacher.get_by_text('Antrag gesendet. Admins wurden benachrichtigt. Im Stundenplan ändert sich erst nach Bestätigung etwas.',exact=True).wait_for();assert calls['absence']['from_time']=='07:30';assert calls['absence']['to_time']=='09:00'
    reports[0].update(starts='07:00',ends='18:00');support=page_as('support');support.goto(BASE+'/krankmeldung');support.get_by_role('button',name='Zeitraum / einzelne Tage ändern',exact=True).click();group=support.get_by_role('group',name='Täglich fehlende Unterrichtsstunden',exact=True);assert group.get_by_label('Von',exact=True).input_value()=='07:00';assert group.get_by_label('Bis',exact=True).input_value()=='18:00';group.get_by_label('Zeitauswahl',exact=True).select_option('lessons');pick(group,5,6);support.get_by_role('button',name='Zeitraum speichern',exact=True).click();support.get_by_text('Zeitraum geändert.',exact=False).wait_for();assert calls['period_edit']['from_time']=='11:00';assert calls['period_edit']['to_time']=='12:30'
    support.goto(BASE+'/vertretungsplan');support.get_by_label('Fehlende Lehrkraft',exact=True).fill('Herr Hansen');support.get_by_label('Ersatzlehrkraft',exact=True).fill('Herr Bendig');pick(support.get_by_role('group',name='Betroffene Unterrichtsstunden',exact=True),2,3);support.get_by_role('button',name='Eintrag speichern',exact=True).click();support.get_by_text('Eintrag gespeichert.',exact=True).wait_for();assert calls['substitution']['starts']=='08:15';assert calls['substitution']['ends']=='10:00'
    teacher.goto(BASE+'/stundenplan');teacher.get_by_role('button',name='Prüfung eintragen',exact=True).click();teacher.locator('app-exam-plan input[name=title]').fill('Klausur');teacher.locator('app-exam-plan input[name=subject]').fill('Deutsch');pick(teacher.get_by_role('group',name='Prüfungsstunden',exact=True),5,6);teacher.get_by_role('button',name='Prüfung speichern',exact=True).click();teacher.locator('app-exam-plan').get_by_text('Klausur',exact=False).first.wait_for();assert calls['exam']['from_time']=='11:00';assert calls['exam']['to_time']=='12:30'
    teacher.get_by_role('button',name='+ Stunde hinzufügen',exact=True).click();modal=teacher.locator('.modal').filter(has=teacher.get_by_role('heading',name='Stunde hinzufügen',exact=True));modal.get_by_label('Fach',exact=True).fill('Teststunde');modal.get_by_label('Lehrer',exact=True).fill('Herr Bendig');modal.get_by_label('Raum',exact=True).fill('B211');modal.get_by_label('Wochentag',exact=False).select_option('Mon');pick(modal.get_by_role('group',name='Unterricht',exact=True),9,10);modal.get_by_role('button',name='Speichern',exact=True).click();teacher.locator('.lesson').filter(has_text='Teststunde').wait_for();lesson=next(l for l in calls['schedule']['entries'] if l['subject']=='Teststunde');assert lesson['start']=='14:45' and lesson['end']=='16:15'
    assert not errors,errors
    browser.close()
print('PASS period booking/UI: rooms with Berlin timestamps, custom times, absence creation and legacy edits, substitutions, exams, timetable editor and mobile; APIs mocked')
