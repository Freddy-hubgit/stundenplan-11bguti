from browser_fixtures import *
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1440,'height':1100})
    ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session('user')))});if(!localStorage.getItem('portal-home:{ids['user']}'))localStorage.setItem('portal-home:{ids['user']}',JSON.stringify({{version:1,order:[],hidden:[],colors:{{}},compact:false}}));")
    ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:mock(r,'user'))
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    tile=lambda:page.locator('.tile[data-route="/stundenplan"]')
    alpha=lambda:float(tile().evaluate("e=>getComputedStyle(e,'::before').opacity"))
    page.goto(BASE);tile().wait_for();assert alpha()==1
    tile().click(button='right');slider=page.get_by_role('slider',name='Transparenz dieser Kachel',exact=True);slider.press('End');assert alpha()==0;assert tile().evaluate('e=>getComputedStyle(e).opacity')=='1';assert tile().locator('.tile-title').evaluate('e=>getComputedStyle(e).opacity')=='1'
    page.reload();tile().wait_for();assert alpha()==0
    page.get_by_role('button',name='Einstellungen öffnen',exact=True).click();page.get_by_role('button',name='Startbildschirm',exact=True).click();slider=page.get_by_role('slider',name='Transparenz aller Kacheln',exact=True);slider.press('Home')
    for _ in range(10):slider.press('ArrowRight')
    assert alpha()==.5
    single=page.get_by_role('slider',name='Transparenz für Stundenplan',exact=True);single.press('Home')
    for _ in range(4):single.press('ArrowRight')
    assert alpha()==.8;assert float(page.locator('.tile[data-route="/materialien"]').evaluate("e=>getComputedStyle(e,'::before').opacity"))==.5
    page.reload();tile().wait_for();assert alpha()==.8
    page.set_viewport_size({'width':390,'height':900});page.get_by_role('button',name='Einstellungen öffnen',exact=True).click();page.get_by_role('button',name='Startbildschirm',exact=True).click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    page.get_by_role('button',name='Startbildschirm zurücksetzen',exact=True).click();assert alpha()==1
    page.reload();tile().wait_for();page.locator('.portal-home').evaluate("e=>{e.classList.add('theme-light');e.style.backgroundImage='linear-gradient(90deg,#ed8490,#6197db)'}")
    tile().click(button='right');page.get_by_role('slider',name='Transparenz dieser Kachel',exact=True).press('End');assert alpha()==0;assert '255, 255, 255' in tile().evaluate("e=>getComputedStyle(e,'::before').backgroundImage") or tile().evaluate("e=>getComputedStyle(e,'::before').backgroundColor")=='rgb(255, 255, 255)'
    page.get_by_role('button',name='Schließen',exact=True).click();page.screenshot(path='/tmp/tile-transparency-mobile.png',full_page=True)
    assert not errors,errors
    browser.close()
print('PASS tile transparency: compatible old settings, keyboard global/individual ranges, text stays opaque, reload persistence, reset, mobile and light theme; APIs mocked')
