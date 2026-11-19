from browser_fixtures import *
from urllib.parse import urlparse,parse_qs
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=browser.new_context();me=dict(profile('admin'),roles=['admin','teacher','support','user']);s=session('admin');s['user']=me
 ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(s))});")
 def api(r):
  url=r.request.url
  if '/profiles?' in url:result=me if 'id=eq.' in url else [me,profile('user')]
  elif '/rpc/account_class_options' in url:result=[dict(id=CLASS_ID,name='11BGUTI')]
  elif '/rpc/account_class_memberships' in url or '/rpc/absence_identities' in url:result=[]
  elif '/rpc/school_people' in url:result=[]
  elif '/rpc/school_year_config' in url:result=13
  elif '/rpc/school_rooms' in url or '/rpc/school_room_slots' in url:result=[]
  elif '/rpc/school_my_teaching' in url:result=dict(teacher='Herr Bendig',lessons=[])
  elif '/rpc/personal_exam_groups' in url or '/rpc/learning_grades' in url or '/rpc/exam_calendar_groups' in url or '/rpc/exam_calendar_list' in url or '/rpc/consultation_list' in url or '/rpc/portal_trash_list' in url or '/rpc/notebook_pages' in url or '/rpc/notebook_subjects' in url or '/rpc/school_materials' in url:result=[]
  elif '/rpc/portal_events_list' in url or '/rpc/substitution_list' in url or '/rpc/portal_notifications' in url or '/rpc/absence_list' in url or '/rpc/portal_changes' in url:result=[]
  else:return mock(r,'admin')
  r.fulfill(status=200,content_type='application/json',body=json.dumps(result))
 ctx.route(f'https://{PROJECT}.supabase.co/**',api);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 routes=['/','/admin','/stundenplan','/hausaufgaben','/nachrichten','/support','/kalender','/videokonferenz','/vertretungsplan','/krankmeldung','/meldungen','/klassen','/materialien','/hefte','/noten','/pruefungen','/sprechstunden','/suche','/papierkorb','/lehrerstundenplan','/raumbuchung','/abgaben','/aenderungsverlauf','/schuljahr','/login']
 for width in [320,1440,3840]:
  page.set_viewport_size(dict(width=width,height=1000))
  for route in routes:
   page.goto(BASE+route);page.locator('.portal-shell,.admin-shell,.app-shell,.login-shell').first.wait_for();page.wait_for_timeout(120)
   body=page.evaluate('document.documentElement.scrollWidth');assert body<=width+2,(route,width,'overflow',body)
   for element in page.locator('.admin-header,.homework-content,.support-content,.plan-content,.events-content,.messages-content,.notebooks-content,.learning,.app,.login-card').all():
    if not element.is_visible():continue
    rect=element.bounding_box();assert rect['width']>=width-120,(route,width,'constrained content',rect)
  page.goto(BASE+'/admin');page.get_by_role('button',name='Klassen & Kurse',exact=True).click();page.get_by_role('heading',name='Klassen & Kurse verwalten',exact=True).wait_for();assert page.locator('.admin-embedded app-school').is_visible();page.wait_for_function("document.querySelector('app-school fieldset')?.disabled===false");assert page.evaluate('document.documentElement.scrollWidth')<=width+2
  page.get_by_role('button',name='Räume & Buchbarkeit',exact=True).click();page.get_by_role('heading',name='Räume verwalten',exact=True).wait_for();assert page.locator('.admin-embedded app-room-booking').is_visible();assert page.evaluate('document.documentElement.scrollWidth')<=width+2
  page.goto(BASE);page.get_by_role('button',name='Einstellungen öffnen',exact=True).click();dialog=page.get_by_role('dialog',name='Einstellungen',exact=True);dialog.wait_for();assert dialog.bounding_box()['width']>=width-40,(width,dialog.bounding_box())
 assert not errors,errors;browser.close()
print('PASS full width: 25 routes at 320/1440/3840px, no page overflow, expanded content/settings and embedded class/room administration; APIs mocked')
