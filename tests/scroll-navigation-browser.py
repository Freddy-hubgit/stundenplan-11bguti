from browser_fixtures import *
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':1000,'height':500})
 ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session('admin')))});")
 def api(r):
  name=r.request.url.split('/rpc/')[-1].split('?')[0]
  if '/rpc/' in r.request.url and name in ['substitution_list','portal_events_list','absence_identities','portal_notifications','account_class_options','account_class_memberships']:r.fulfill(status=200,content_type='application/json',body='[]')
  else:mock(r,'admin')
 ctx.route(f'https://{PROJECT}.supabase.co/**',api);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE)
 def scroll_home():
  page.locator('.tile-grid .tile').first.wait_for();page.evaluate('window.scrollTo(0,0);document.body.scrollTop=0');before=page.locator('.portal-home h1').bounding_box()['y'];page.mouse.move(500,400);page.mouse.wheel(0,600);page.wait_for_timeout(200);after=page.locator('.portal-home h1').bounding_box()['y'];assert after<before-30,('main menu cannot scroll',before,after,page.evaluate("({html:getComputedStyle(document.documentElement).overflowY,body:getComputedStyle(document.body).overflowY})"))
 scroll_home()
 for cycle in range(3):
  page.evaluate('window.scrollTo(0,0);document.body.scrollTop=0');page.locator('.tile[data-route="/stundenplan"]').click();page.locator('.app-shell').wait_for();page.get_by_role('link',name='← Zurück zum Hauptmenü',exact=True).click();page.locator('.portal-home').wait_for();scroll_home()
  assert page.evaluate("getComputedStyle(document.body).overflowY")!='hidden'
  other=ctx.new_page();other.goto('about:blank');other.bring_to_front();page.bring_to_front();other.close();page.set_viewport_size({'width':820,'height':350});page.set_viewport_size({'width':1000,'height':500});scroll_home()
  cdp=ctx.new_cdp_session(page);cdp.send('Page.setWebLifecycleState',{'state':'frozen'});cdp.send('Page.setWebLifecycleState',{'state':'active'});cdp.detach();scroll_home()
 page.evaluate('window.scrollTo(0,0)');page.get_by_role('button',name='Einstellungen öffnen',exact=True).click();page.get_by_role('dialog',name='Einstellungen',exact=True).wait_for();page.keyboard.press('Escape');scroll_home()
 assert not errors,errors;browser.close()
print('PASS scroll: repeated SPA timetable→home navigation, focus/background/resizing, Chromium freeze/resume and settings close; APIs mocked')
