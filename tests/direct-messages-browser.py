from browser_fixtures import *
threads=[];messages=[];open_calls=[]
roles=['user','teacher','support','admin']
def api(route,role):
    url=route.request.url
    args=route.request.post_data_json or {} if route.request.method=='POST' else {}
    if '/rpc/dm_people' in url: result=[dict(id=ids[r],full_name=r.title(),role=r) for r in roles if r!=role]
    elif '/rpc/dm_threads' in url:
        result=[]
        for t in threads:
            if role not in t['roles']:continue
            peer=next(r for r in t['roles'] if r!=role)
            history=[m for m in messages if m['thread_id']==t['id']]
            result.append(dict(id=t['id'],peer_id=ids[peer],peer_name=peer.title(),peer_role=peer,updated_at=now,last_message=history[-1]['body'] if history else None))
    elif '/rpc/dm_start' in url or '/rpc/dm_open' in url:
        open_calls.append(url)
        peer=next(r for r in roles if ids[r]==args['peer_id'])
        pair=sorted([role,peer]);result='-'.join(pair)
        if not any(t['id']==result for t in threads):threads.append(dict(id=result,roles=pair))
        if '/rpc/dm_start' in url:messages.append(dict(id=str(len(messages)),thread_id=result,sender_id=ids[role],sender_name=role.title(),body=args['message_body'],created_at=now))
    elif '/rpc/dm_messages' in url:result=[m for m in messages if m['thread_id']==args['chat_id']]
    elif '/rpc/dm_send' in url:
        messages.append(dict(id=str(len(messages)),thread_id=args['chat_id'],sender_id=ids[role],sender_name=role.title(),body=args['message_body'],created_at=now));result=None
    else:mock(route,role);return
    route.fulfill(status=200,content_type='application/json',body=json.dumps(result))

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    def page_as(role,width=1280):
        ctx=browser.new_context(viewport={'width':width,'height':1000})
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session(role)))})")
        ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:api(r,role))
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE,wait_until='domcontentloaded')
        page.get_by_role('link',name='Nachrichten',exact=False).click()
        page.get_by_role('heading',name='Neuer Chat',exact=True).wait_for()
        return page
    user=page_as('user')
    user.get_by_label('Person suchen',exact=True).fill('Teacher')
    user.locator('.person').filter(has_text='Teacher').click()
    assert not threads and not open_calls # Selecting a person must not write a chat.
    user.get_by_label('Nachricht',exact=True).fill('   ')
    assert user.get_by_role('button',name='Nachricht senden',exact=True).is_disabled()
    user.wait_for_timeout(4500) # Let the background refresh run with a pending chat.
    assert not threads and not open_calls
    assert user.get_by_label('Nachricht',exact=True).input_value()=='   '
    user.get_by_label('Nachricht',exact=True).fill('Hallo <script>alert(1)</script>')
    user.get_by_role('button',name='Nachricht senden',exact=True).click()
    user.get_by_text('Hallo <script>alert(1)</script>',exact=True).first.wait_for()
    teacher=page_as('teacher',390)
    teacher.locator('.thread').filter(has_text='User').click()
    teacher.get_by_label('Nachricht',exact=True).fill('Antwort von Lehrer')
    teacher.get_by_role('button',name='Nachricht senden',exact=True).click()
    user.locator('.message').filter(has_text='Antwort von Lehrer').wait_for(timeout=12000)
    assert teacher.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
    # Chat selection preserves unsent drafts.
    user.get_by_label('Nachricht',exact=True).fill('Entwurf behalten')
    user.get_by_label('Person suchen',exact=True).fill('Admin')
    user.locator('.person').filter(has_text='Admin').click()
    user.get_by_text('Schreibe die erste Nachricht.',exact=True).wait_for()
    user.locator('.thread').filter(has_text='Teacher').click()
    user.locator('.message').filter(has_text='Antwort von Lehrer').wait_for()
    assert user.get_by_label('Nachricht',exact=True).input_value()=='Entwurf behalten'
    user.route('**/rest/v1/rpc/dm_send',lambda r:r.fulfill(status=403,content_type='application/json',body=json.dumps({'code':'42501','message':'Test: Kein Zugriff auf diesen Chat.'})))
    user.get_by_role('button',name='Nachricht senden',exact=True).click()
    user.get_by_role('alert').wait_for()
    assert '42501' in user.get_by_role('alert').inner_text()
    assert 'Test: Kein Zugriff auf diesen Chat.' in user.get_by_role('alert').inner_text()
    assert user.get_by_label('Nachricht',exact=True).input_value()=='Entwurf behalten'
    admin=page_as('admin');assert admin.locator('.thread').count()==0 # Selecting admin without sending did not create a chat.
    assert len(threads)==1 and len(open_calls)==1
    support=page_as('support');assert support.locator('.thread').count()==0
    support.locator('.person').filter(has_text='Admin').click()
    support.get_by_label('Nachricht',exact=True).fill('Support an Admin')
    support.get_by_role('button',name='Nachricht senden',exact=True).click()
    support.locator('.message').filter(has_text='Support an Admin').wait_for()
    teacher.get_by_role('button',name='Einstellungen öffnen').click()
    teacher.get_by_role('button',name='Hell',exact=True).click()
    teacher.get_by_role('button',name='Schließen',exact=True).click()
    teacher.screenshot(path='/tmp/direct-messages-mobile-light.png',full_page=True)
    anon=browser.new_page();anon.goto(BASE+'/nachrichten');anon.wait_for_url('**/login')
    assert not errors,errors
    print('PASS lazy chat creation, no writes on person selection, whitespace rejection, all-role conversation/polling, literal HTML, draft retention/switch/failure, no staff override, mobile/light theme and login guard; simulated API')
    browser.close()
