from browser_fixtures import *
rooms=[];bookings=[];groups=[];group_messages=[];roster=[];period_calls=[];feedback_calls=[];undo_calls=[];errors=[]
report=dict(id='absence1',teacher_id=ids['teacher'],teacher_name='Herr Bendig',start_date='2026-11-02',end_date='2026-11-04',starts='07:00',ends='18:00',status='resolved',resolution='cancelled',replacement_teacher='',requested_teacher='',requested_kind='cancelled',excluded_dates=[])
assignment=dict(task_id='task1',title='Textanalyse',subject='Deutsch',group_name='11BGUTI',due_date='2026-11-03',expected=2,submitted=1,reviewed=0)
review_rows=[dict(student_id=ids['user'],student_name='User',done=True,body='Meine Analyse',link='',file_path='',file_name='',submitted_at='2026-11-02T12:00:00Z',feedback='',reviewed_at=None),dict(student_id=ids['other'],student_name='Other',done=False,body=None,link=None,file_path=None,file_name=None,submitted_at=None,feedback=None,reviewed_at=None)]
changes=[dict(id=1,actor_name='Admin',entity='school_schedule',record_key=CLASS_ID,action='UPDATE',before_value={'lessons':[]},after_value={'lessons':[{'subject':'Deutsch'}]},created_at='2026-10-31T12:00:00Z',reverted_by=None)]
def api(route,role):
    url=route.request.url;args=route.request.post_data_json or {} if route.request.method=='POST' else {}
    result=None
    if '/rpc/dm_people' in url:result=[dict(id=ids[r],full_name=r.title(),role=profile(r)['role']) for r in ['user','other','teacher','support','admin'] if r!=role]
    elif '/rpc/dm_threads' in url:result=[]
    elif '/rpc/portal_notifications' in url:result=[]
    elif '/rpc/substitution_list' in url:result=[]
    elif '/rpc/school_my_teaching' in url:result=dict(teacher='Herr Bendig',lessons=[])
    elif '/rpc/school_rooms' in url:result=[r for r in rooms if r['bookable'] or role=='admin']
    elif '/rpc/school_room_save' in url:
        result=args['target'] or 'room1';rooms[:]=[r for r in rooms if r['id']!=result];rooms.append(dict(id=result,name=args['label'],details=args['info'],bookable=args['enabled']))
    elif '/rpc/school_room_slots' in url:result=[dict(b,can_cancel=b['owner']==role or role=='admin',label=b['label'] if b['owner']==role or role=='admin' else 'Reserviert') for b in bookings]
    elif '/rpc/school_room_book' in url:
        result='booking1';bookings.append(dict(id=result,room_id=args['target'],label=args['label'],starts_at=args['from_time'],ends_at=args['to_time'],owner=role,teaching=False))
    elif '/rpc/school_room_cancel' in url:bookings[:]=[b for b in bookings if b['id']!=args['booking']]
    elif '/rpc/chat_groups' in url:result=[dict(g,member_count=len(roster),unread=0) for g in groups if any(m['user_id']==ids[role] for m in roster)]
    elif '/rpc/chat_group_start' in url:
        result='chat1';groups.append(dict(id=result,name=args['label'],owner_id=ids[role]));roster[:]=[dict(user_id=id,full_name=next(r.title() for r,v in ids.items() if v==id)) for id in args['people']+[ids[role]]];group_messages.append(dict(id='first',sender_id=ids[role],sender_name=role.title(),body=args['message_body'],created_at=now))
    elif '/rpc/chat_group_messages' in url:result=group_messages
    elif '/rpc/chat_group_roster' in url:result=roster
    elif '/rpc/chat_group_send' in url:group_messages.append(dict(id=str(len(group_messages)+1),sender_id=ids[role],sender_name=role.title(),body=args['message_body'],created_at=now))
    elif '/rpc/chat_group_manage' in url:
        groups[0]['name']=args['label']
        if args.get('person'):
            roster[:]=[r for r in roster if r['user_id']!=args['person']]
            if not args['remove_person']:roster.append(dict(user_id=args['person'],full_name='Other'))
    elif '/rpc/chat_group_leave' in url:groups.clear();roster.clear();group_messages.clear()
    elif '/rpc/absence_identities' in url:result=[dict(user_id=ids['teacher'],full_name='Teacher',timetable_name='Herr Bendig')] if role in ['teacher','admin'] else []
    elif '/rpc/absence_list' in url:result=[report]
    elif '/rpc/absence_edit_period' in url:period_calls.append(args);report.update(start_date=args['first_day'],end_date=args['last_day'],starts=args['from_time'],ends=args['to_time'],excluded_dates=args['skip_days'])
    elif '/rpc/hw_tasks_group' in url:result=[dict(id='task1',title='Textanalyse',subject='Deutsch',description='Text lesen',author_id=ids['teacher'],author_name='Teacher',group_id=CLASS_ID,group_name='11BGUTI',lesson_date='2026-11-02',due_date='2026-11-03',is_shared=True,requires_submission=True,done=False,submitted=role=='user')]
    elif '/rpc/hw_submissions' in url:result=[review_rows[0]] if role in ['user','teacher','admin'] else []
    elif '/rpc/hw_my_feedback' in url:result=[dict(body=review_rows[0]['feedback'],reviewed_at=review_rows[0]['reviewed_at'])] if role=='user' and review_rows[0]['reviewed_at'] else []
    elif '/rpc/hw_push_settings' in url:result=[dict(reminder_time='19:00',active=False)]
    elif '/rpc/hw_review_overview' in url:result=[assignment]
    elif '/rpc/hw_review_students' in url:result=review_rows
    elif '/rpc/hw_review_save' in url:feedback_calls.append(args);review_rows[0].update(feedback=args['comment_text'],reviewed_at=now);assignment['reviewed']=1
    elif '/rpc/portal_changes' in url:result=changes
    elif '/rpc/portal_change_undo' in url:undo_calls.append(args);changes[0]['reverted_by']=2
    else:mock(route,role);return
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    def page_as(role,width=1440):
        context=browser.new_context(viewport={'width':width,'height':1050})
        context.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        context.route(f'https://{PROJECT}.supabase.co/**',lambda r:api(r,role))
        page=context.new_page();page.clock.install(time=__import__('datetime').datetime(2026,10,31,13,0));page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());return page
    admin=page_as('admin');admin.goto(BASE+'/raumbuchung');admin.get_by_role('heading',name='Räume verwalten').wait_for();admin.get_by_label('Raumname',exact=True).fill('B211');admin.get_by_label('Beschreibung',exact=True).fill('Klassenraum');release=admin.get_by_label('Zur Buchung freigeben',exact=True);before=release.evaluate('(e)=>getComputedStyle(e).backgroundColor');release.click();assert release.is_checked();assert release.evaluate('(e)=>getComputedStyle(e).backgroundColor')!=before;assert release.evaluate('(e)=>e.getBoundingClientRect().width')==19;release.press('Space');assert not release.is_checked();release.press('Space');assert release.is_checked();admin.get_by_role('button',name='Raum anlegen',exact=True).click();admin.get_by_text('Raum gespeichert.',exact=True).wait_for();admin.get_by_role('button',name='Buchungsfreigabe aufheben',exact=True).click();admin.get_by_text('Buchungsfreigabe aufgehoben. Bestehende Buchungen bleiben erhalten.',exact=True).wait_for();assert not rooms[0]['bookable'];admin.get_by_role('button',name='Zur Buchung freigeben',exact=True).click();admin.get_by_text('Raum zur Buchung freigegeben.',exact=True).wait_for();assert rooms[0]['bookable'];admin.get_by_role('button',name='Bearbeiten',exact=True).click();assert admin.get_by_label('Raumname',exact=True).input_value()=='B211';admin.get_by_role('button',name='Buchungsfreigabe aufheben',exact=True).click();admin.get_by_text('Buchungsfreigabe aufgehoben. Bestehende Buchungen bleiben erhalten.',exact=True).wait_for();assert not admin.get_by_label('Zur Buchung freigeben',exact=True).is_checked();admin.get_by_role('button',name='Zur Buchung freigeben',exact=True).click();admin.get_by_text('Raum zur Buchung freigegeben.',exact=True).wait_for();assert admin.get_by_label('Zur Buchung freigeben',exact=True).is_checked()
    student=page_as('user',390);student.goto(BASE+'/raumbuchung');student.get_by_label('Datum',exact=True).fill('2026-11-02');student.get_by_label('Raum',exact=True).select_option('room1');student.get_by_label('Anlass',exact=True).fill('Projektarbeit');student.get_by_role('button',name='Raum verbindlich buchen',exact=True).click();student.get_by_text('Raum gebucht.',exact=True).wait_for();assert student.get_by_role('heading',name='Räume verwalten').count()==0;assert student.evaluate('document.documentElement.scrollWidth<=innerWidth+1');student.get_by_role('button',name='Buchung stornieren',exact=True).click();student.get_by_text('Buchung storniert.',exact=True).wait_for()
    student.goto(BASE+'/nachrichten');student.get_by_role('button',name='Gruppenchats',exact=True).click();student.get_by_role('button',name='+ Gruppe erstellen',exact=True).click();student.get_by_label('Gruppenname',exact=True).fill('Lerngruppe');student.locator('input[name="invite-'+ids['other']+'"]').check();assert not groups;student.get_by_label('Erste Nachricht',exact=True).fill('Hallo zusammen');student.get_by_role('button',name='Gruppe erstellen und Nachricht senden',exact=True).click();student.get_by_role('heading',name='Lerngruppe',exact=True).wait_for();student.get_by_label('Nachricht',exact=True).fill('Treffen am Montag');student.get_by_role('button',name='Nachricht senden',exact=True).click();student.get_by_text('Treffen am Montag',exact=True).wait_for();assert student.evaluate('document.documentElement.scrollWidth<=innerWidth+1');student.screenshot(path='/tmp/group-chat-mobile.png',full_page=True)
    support=page_as('support');support.goto(BASE+'/krankmeldung');support.get_by_role('button',name='Zeitraum / einzelne Tage ändern',exact=True).click();support.locator('input[name="exclude-2026-11-03"]').check();support.get_by_role('button',name='Zeitraum speichern',exact=True).click();support.get_by_text('An diesen Tagen regulärer Unterricht:',exact=False).wait_for();assert period_calls[-1]['skip_days']==['2026-11-03'];assert not support.get_by_role('button',name='Entscheidung bestätigen',exact=True).count()
    teacher=page_as('teacher');teacher.goto(BASE+'/abgaben');teacher.get_by_role('button',name='Textanalyse',exact=False).click();teacher.get_by_role('heading',name='User',exact=True).wait_for();teacher.get_by_label('Ansicht',exact=True).select_option('missing');assert teacher.get_by_role('heading',name='Other',exact=True).count()==1;assert not teacher.get_by_role('heading',name='User',exact=True).count();teacher.get_by_label('Ansicht',exact=True).select_option('all');teacher.get_by_label('Rückmeldung',exact=True).fill('Gut begründet');teacher.get_by_role('button',name='Rückmeldung speichern / als geprüft markieren',exact=True).click();teacher.get_by_text('Rückmeldung gespeichert.',exact=True).wait_for();assert feedback_calls[-1]['comment_text']=='Gut begründet'
    student.goto(BASE+'/hausaufgaben');student.get_by_role('button',name='Abgabe bearbeiten',exact=True).click();student.get_by_role('heading',name='Rückmeldung deiner Lehrkraft',exact=True).wait_for();student.get_by_text('Gut begründet',exact=True).wait_for()
    admin.goto(BASE+'/aenderungsverlauf');admin.get_by_role('button',name='Stundenplanänderung rückgängig machen',exact=True).click();admin.get_by_text('Stundenplanänderung rückgängig gemacht.',exact=True).wait_for();assert undo_calls[-1]['change_id']==1
    student.goto(BASE+'/aenderungsverlauf');student.locator('.portal-home h1').wait_for();assert not student.get_by_role('heading',name='Änderungsverlauf',exact=True).count()
    assert not errors,errors
    browser.close()
print('PASS browser: admin room configuration, student booking/mobile, lazy group create/send, support excluded day, missing submission/feedback, admin undo and student route denial; APIs mocked')
