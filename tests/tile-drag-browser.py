from browser_fixtures import *
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1440,'height':1500})
    ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session('user')))})")
    ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:mock(r,'user'))
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE)
    source=page.locator('.tile[data-route="/stundenplan"]');target=page.locator('.tile[data-route="/materialien"]');source.wait_for()
    storage=lambda:page.evaluate('localStorage.getItem('+json.dumps('portal-home:'+ids['user'])+')')
    def start_drag():
        source.hover();page.wait_for_timeout(220);rect=source.bounding_box();x=rect['x']+85;y=rect['y']+65;page.mouse.move(x,y);page.mouse.down(button='right');page.mouse.move(x+20,y+20,steps=3);page.locator('.tile-drag-ghost').wait_for();return rect,x,y
    before=storage();rect,x,y=start_drag();ghost=page.locator('.tile-drag-ghost');box=ghost.bounding_box();assert abs(box['x']-(rect['x']+20))<1;assert abs(box['y']-(rect['y']+20))<1;assert storage()==before;assert source.evaluate('e=>getComputedStyle(e).opacity')=='0.22';assert not page.locator('.tile-context').count()
    destination=target.bounding_box();tx=destination['x']+destination['width']/2;ty=destination['y']+destination['height']/2;page.mouse.move(tx,ty,steps=8);box=ghost.bounding_box();assert abs(box['x']-(tx-85))<1;assert abs(box['y']-(ty-65))<1;assert target.evaluate('e=>getComputedStyle(e).outlineStyle')=='dashed';assert storage()==before
    page.screenshot(path='/tmp/tile-drag-preview.png',full_page=True);page.mouse.up(button='right');assert not page.locator('.tile-drag-ghost').count();assert not page.locator('.tile-drop-target').count();assert not page.locator('.tile-context').count();saved=json.loads(storage());assert saved['order'].index('/stundenplan')<saved['order'].index('/materialien');assert page.url.rstrip('/')==BASE
    page.reload();source.wait_for();routes=page.locator('.tile[data-route]').evaluate_all('els=>els.map(e=>e.dataset.route)');assert routes.index('/stundenplan')<routes.index('/materialien')
    saved=storage();start_drag();page.mouse.move(tx,ty);page.keyboard.press('Escape');page.mouse.up(button='right');assert not page.locator('.tile-drag-ghost').count();assert storage()==saved;assert page.evaluate('document.body.style.cursor')=='';assert page.evaluate('document.body.style.userSelect')==''
    start_drag();page.mouse.move(5,5);page.mouse.up(button='right');assert not page.locator('.tile-drag-ghost').count();assert storage()==saved
    start_drag();page.evaluate("window.dispatchEvent(new Event('blur'))");page.mouse.up(button='right');assert not page.locator('.tile-drag-ghost').count();assert storage()==saved
    source.click(button='right');page.locator('.tile-context').wait_for();page.get_by_role('button',name='Schließen',exact=True).click();source=page.locator('.tile[data-route="/support"]');page.locator('.portal-home').evaluate("e=>e.classList.add('theme-light')");start_drag();assert page.locator('.tile-drag-ghost').evaluate("e=>getComputedStyle(e).getPropertyValue('--tile-accent')")==source.evaluate("e=>getComputedStyle(e).getPropertyValue('--tile-accent')");page.keyboard.press('Escape');page.mouse.up(button='right');assert not errors,errors;browser.close()
print('PASS tile drag: live pointer attachment/grab offset, placeholder/target, no early save, drop persistence, escape/outside/blur cancellation and ordinary context menu; APIs mocked')
