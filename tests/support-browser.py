"""UI regression test with a simulated Supabase API; no live account required.
Run while ng serve listens on port 4200: python tests/support-browser.py
"""
from browser_fixtures import *

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    def open_as(role, mobile=False):
        ctx=browser.new_context(viewport={'width':390,'height':844} if mobile else {'width':1280,'height':900})
        value=json.dumps(session(role))
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(value)})")
        ctx.route(f'https://{PROJECT}.supabase.co/**',lambda route: mock(route,role))
        page=ctx.new_page(); page.on('pageerror',lambda e: errors.append(str(e)))
        page.goto(BASE)
        page.get_by_role('link',name='Support-Tickets' if role in ['support','admin'] else 'Support & Tickets').click()
        page.get_by_role('heading',name='Dein Support-Team').wait_for()
        return page
    user=open_as('user')
    user.locator('.role').get_by_text('Admin',exact=True).wait_for()
    user.get_by_label('Betreff',exact=True).fill('Problem mit Stundenplan')
    user.get_by_label('Deine Nachricht',exact=True).fill('Bitte helft mir <script>alert(1)</script>')
    user.get_by_role('button',name='Ticket erstellen',exact=True).click()
    user.get_by_role('heading',name='Problem mit Stundenplan',exact=True).wait_for()
    user.get_by_text('Bitte helft mir <script>alert(1)</script>',exact=True).wait_for()
    staff=open_as('support')
    staff.get_by_role('button',name='Problem mit Stundenplan').click()
    staff.get_by_label('Nachricht',exact=True).fill('Wir helfen dir!')
    staff.get_by_role('button',name='Nachricht senden',exact=True).click()
    staff.get_by_text('Wir helfen dir!',exact=True).wait_for()
    user.get_by_text('Wir helfen dir!',exact=True).wait_for(timeout=12000)
    staff.get_by_role('button',name='Ticket schließen',exact=True).click()
    staff.get_by_text('Dieses Ticket ist geschlossen.',exact=False).wait_for()
    user.get_by_text('Dieses Ticket ist geschlossen.',exact=False).wait_for(timeout=12000)
    assert user.get_by_label('Nachricht',exact=True).count()==0
    admin=open_as('admin')
    admin.get_by_label('Status',exact=True).select_option('closed')
    admin.get_by_role('button',name='Problem mit Stundenplan').click()
    admin.get_by_role('button',name='Wieder öffnen',exact=True).click()
    admin.get_by_label('Nachricht',exact=True).wait_for()
    other=open_as('other',mobile=True)
    other.get_by_text('Keine Tickets in dieser Ansicht.',exact=True).wait_for()
    assert other.locator('body').evaluate('(e) => e.scrollWidth <= window.innerWidth')
    # A failed write preserves the draft and exposes an error.
    user.get_by_label('Nachricht',exact=True).wait_for(timeout=12000)
    user.route('**/rest/v1/rpc/support_reply', lambda r:r.fulfill(status=500,content_type='application/json',body='{"message":"test failure"}'))
    user.get_by_label('Nachricht',exact=True).fill('Nicht verlieren')
    user.get_by_role('button',name='Nachricht senden',exact=True).click()
    user.get_by_role('alert').wait_for()
    assert user.get_by_label('Nachricht',exact=True).input_value()=='Nicht verlieren'
    anon=browser.new_page(); anon.goto(BASE+'/support'); anon.wait_for_url('**/login')
    assert not errors,errors
    print('PASS: user/staff/admin tiles, team, create/chat/poll, close/reopen, literal HTML, failed-send draft, mobile layout, anonymous guard; mocked API')
    browser.close()
