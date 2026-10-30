from browser_fixtures import *
from datetime import date,datetime
identities=[];reports=[];notes=[];entries=[];errors=[];push_records={};homework_push_calls=[]
users={r:profile(r) for r in ids}
def api(route,role):
    url=route.request.url;args=route.request.post_data_json or {} if route.request.method=='POST' else {}
    me=users[role]
    if '/profiles?' in url:result=me
    elif '/rpc/absence_identities' in url:
        result=[dict(user_id=ids['teacher'],full_name='Teacher',timetable_name=next((i['name'] for i in identities if i['id']==ids['teacher']),''))] if role in ['admin','teacher'] else []
    elif '/rpc/absence_set_identity' in url:identities[:]=[dict(id=args['person'],name=args['teacher'])];result=None
    elif '/rpc/absence_list' in url:result=reports if role=='admin' else [r for r in reports if r['teacher_id']==me['id']]
    elif '/rpc/absence_request' in url and '/absence_request_preference' not in url:
        entry=dict(id='report1',teacher_id=me['id'],teacher_name='Herr Hansen',start_date=args['first_day'],end_date=args['last_day'],starts=args['from_time'],ends=args['to_time'],requested_teacher=args['wish'],requested_kind=args['request_kind'],status='reported',resolution='',replacement_teacher='')
        reports.append(entry);result='report1'
        notes.extend([dict(id='admin1',user_id=ids['admin'],title='Neue Krankmeldung',body='Herr Hansen ist abwesend.',route='/krankmeldung',read_at=None,created_at=now)])
    elif '/rpc/absence_request_preference' in url:
        reports[0].update(requested_kind=args['request_kind'],requested_teacher=args['wish']);result=None
    elif '/rpc/absence_resolve' in url:
        report=reports[0];report.update(status='resolved',resolution=args['kind'],replacement_teacher=args['replacement']);entries[:]=[dict(id='entry1',date=report['start_date'],teacher='Herr Hansen',start_time=report['starts'],end_time=report['ends'],kind=args['kind'],replacement_teacher=args['replacement'],room='',note='',updated_at=now)];notes.append(dict(id='user2',user_id=ids['user'],title='Unterrichtsänderung',body='Vertretung: '+args['replacement'],route='/stundenplan',read_at=None,created_at=now));result=None
    elif '/rpc/portal_notifications' in url:result=[n for n in notes if n['user_id']==me['id']]
    elif '/rpc/portal_notification_read' in url:
        next(n for n in notes if n['id']==args['notification'] and n['user_id']==me['id'])['read_at']=now;result=None
    elif '/functions/v1/homework-reminders' in url:result={'publicKey':'B'+'A'*86}
    elif '/rpc/portal_push_settings' in url:result=me['id'] in push_records
    elif '/rpc/portal_push_save' in url:push_records[me['id']]=args['device'];result=None
    elif '/rpc/portal_push_remove' in url:push_records.pop(me['id'],None);result=None
    elif '/rpc/hw_push_save' in url:homework_push_calls.append(args);result=None
    elif '/rpc/substitution_list' in url:result=entries
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
    def page_as(role,width=1440):
        ctx=browser.new_context(viewport={'width':width,'height':1000})
        ctx.add_init_script("localStorage.setItem('sb-"+PROJECT+"-auth-token',"+json.dumps(json.dumps(session(role)))+");")
        ctx.add_init_script(push_mock)
        ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:api(r,role))
        page=ctx.new_page();page.clock.install(time=datetime(2026,10,26,8,30));page.on('pageerror',lambda e:errors.append(str(e)));return page
    teacher=page_as('teacher');teacher.goto(BASE+'/krankmeldung');teacher.get_by_text('Bitte einen Admin bitten, dein Konto zuerst deinem Namen im Stundenplan zuzuordnen.',exact=True).wait_for()
    admin=page_as('admin');admin.goto(BASE+'/krankmeldung');admin.get_by_label('Lehrerkonto',exact=True).select_option(ids['teacher']);admin.get_by_label('Name im Stundenplan',exact=True).fill('Herr Hansen');admin.get_by_role('button',name='Zuordnung speichern',exact=True).click();admin.get_by_text('Lehrerkonto zugeordnet.',exact=True).wait_for()
    teacher.reload();teacher.get_by_label('Mein Antrag',exact=True).select_option('replacement');teacher.get_by_label('Wunschvertretung',exact=True).fill('Frau Wunsch');teacher.get_by_role('button',name='Antrag senden',exact=True).click();teacher.get_by_text('Antrag gesendet. Admins wurden benachrichtigt. Im Stundenplan ändert sich erst nach Bestätigung etwas.',exact=True).wait_for()
    assert reports[0]['requested_teacher']=='Frau Wunsch' and not entries
    student=page_as('user',390);student.goto(BASE+'/stundenplan');student.locator('.lesson').first.wait_for();assert student.locator('.lesson.cancelled,.lesson.substituted').count()==0
    student.goto(BASE+'/meldungen');student.get_by_text('Keine Benachrichtigungen vorhanden.',exact=True).wait_for()
    # Pending requests can switch to cancellation and back without publishing anything.
    teacher.get_by_role('button',name='Antrag ändern',exact=True).click();teacher.get_by_label('Antragswunsch',exact=True).select_option('cancelled');teacher.get_by_role('button',name='Antrag aktualisieren',exact=True).click();teacher.get_by_text('Antrag geändert. Admins wurden benachrichtigt.',exact=True).wait_for()
    assert reports[0]['requested_kind']=='cancelled' and reports[0]['requested_teacher']=='' and not entries
    teacher.get_by_role('button',name='Antrag ändern',exact=True).click();teacher.get_by_label('Antragswunsch',exact=True).select_option('replacement');teacher.get_by_label('Gewünschte Ersatzlehrkraft',exact=True).fill('Frau Wunsch');teacher.get_by_role('button',name='Antrag aktualisieren',exact=True).click();teacher.get_by_text('Antrag geändert. Admins wurden benachrichtigt.',exact=True).wait_for()
    assert not entries

    admin.goto(BASE+'/meldungen');admin.get_by_role('heading',name='Neue Krankmeldung',exact=True).wait_for();admin.get_by_role('link',name='Details öffnen →').click();admin.get_by_text('Beantragt: Wunschvertretung · Frau Wunsch',exact=True).wait_for()
    admin.get_by_label('Entscheidung',exact=True).select_option('replacement');assert admin.get_by_label('Bestätigte Ersatzlehrkraft',exact=True).input_value()=='Frau Wunsch'
    admin.get_by_label('Bestätigte Ersatzlehrkraft',exact=True).fill('Frau Bestätigt');admin.get_by_role('button',name='Entscheidung bestätigen',exact=True).click();admin.get_by_text('Entfall oder Vertretung bestätigt. Die Schüler wurden benachrichtigt.',exact=True).wait_for()
    student.goto(BASE+'/stundenplan');student.locator('.lesson.substituted').first.wait_for();assert 'Frau Bestätigt' in student.locator('.lesson.substituted').first.inner_text()
    student.goto(BASE+'/meldungen');student.get_by_text('Vertretung: Frau Bestätigt',exact=True).wait_for();assert student.get_by_text('Beantragt: Wunschvertretung · Frau Wunsch',exact=True).count()==0
    assert student.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    assert student.evaluate('window.permissionRequests')==0
    student.get_by_role('button',name='Push für Meldungen aktivieren',exact=True).click();student.get_by_role('button',name='Push ist aktiviert',exact=True).wait_for()
    assert ids['user'] in push_records and student.evaluate('window.permissionRequests')==1
    assert not homework_push_calls
    student.get_by_role('button',name='Push für Meldungen deaktivieren',exact=True).click();student.get_by_role('button',name='Push für Meldungen aktivieren',exact=True).wait_for()
    assert ids['user'] not in push_records

    student.get_by_role('button',name='Als gelesen markieren').first.click();assert any(n['read_at'] for n in notes if n['user_id']==ids['user'])
    student.goto(BASE+'/krankmeldung');student.get_by_role('heading',name='Hi, User',exact=True).wait_for();assert student.get_by_role('heading',name='Krankmeldungen',exact=True).count()==0
    support=page_as('support');support.goto(BASE+'/krankmeldung');support.get_by_role('heading',name='Hi, Support',exact=True).wait_for()
    teacher.goto(BASE+'/');teacher.get_by_role('link',name='Krankmeldungen',exact=False).wait_for()
    assert not errors,errors
    browser.close()
print('PASS admin identity mapping, teacher absence/wish, private pending requests and preference changes, admin inbox and approval-gated timetable, student notifications, unread state, mobile and route guards; simulated API')
