from browser_fixtures import *

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    for width in [1440,390]:
        ctx=browser.new_context(viewport={'width':width,'height':1000})
        ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session('admin')))})")
        ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:mock(r,'admin'))
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE,wait_until='domcontentloaded')
        page.get_by_role('link',name='Verwaltung').wait_for()
        original=page.locator('.tile').evaluate_all('(tiles)=>tiles.map(t=>t.getAttribute("data-route"))')
        def settings():
            page.get_by_role('button',name='Einstellungen öffnen',exact=True).click()
            page.get_by_role('button',name='Startbildschirm',exact=True).click()
        settings()
        panel=page.get_by_role('region',name='Startbildschirm anpassen')
        panel.get_by_role('button',name='Nachrichten nach unten',exact=True).click()
        rows=panel.locator('.tile-setting')
        moved=rows.locator('strong').all_inner_texts()
        assert moved.index('Nachrichten')==original.index('/nachrichten')+1
        panel.get_by_role('combobox',name='Farbe für Nachrichten',exact=True).select_option('rose')
        panel.get_by_label('Kompakte Kacheln',exact=True).check()
        row=rows.filter(has=page.get_by_text('Videokonferenz',exact=True))
        row.get_by_label('Anzeigen',exact=True).uncheck()
        page.get_by_role('button',name='Schließen',exact=True).click()
        assert page.locator('.tile[data-route="/videokonferenz"]').count()==0
        assert page.locator('.tile-grid.compact').count()==1
        tile=page.locator('.tile[data-route="/nachrichten"]')
        assert tile.evaluate('(e)=>getComputedStyle(e).getPropertyValue("--tile-accent").trim()')=='#f29cbe'
        page.reload(wait_until='domcontentloaded');page.get_by_role('link',name='Verwaltung').wait_for()
        assert page.locator('.tile[data-route="/videokonferenz"]').count()==0
        assert page.locator('.tile-grid.compact').count()==1
        settings()
        # Drag support complements keyboard/touch-accessible move buttons.
        source=panel.locator('.tile-setting').filter(has=page.get_by_text('Stundenplan',exact=True))
        target=panel.locator('.tile-setting').filter(has=page.get_by_text('Nachrichten',exact=True))
        target_index=panel.locator('.tile-setting strong').all_inner_texts().index('Nachrichten')
        source.drag_to(target)
        assert panel.locator('.tile-setting').nth(target_index).locator('strong').inner_text()=='Stundenplan'
        # Hide everything; settings must remain reachable for recovery.
        for check in panel.locator('.tile-options input[type=checkbox]').all():check.uncheck()
        page.get_by_role('button',name='Schließen',exact=True).click()
        assert page.locator('.tile').count()==0
        page.get_by_text('Alle Kacheln sind ausgeblendet.',exact=False).wait_for()
        settings();panel.get_by_role('button',name='Startbildschirm zurücksetzen',exact=True).click()
        page.get_by_role('button',name='Darstellung',exact=True).click()
        page.get_by_role('button',name='Hell',exact=True).click()
        page.get_by_role('button',name='Startbildschirm',exact=True).click()
        panel.get_by_role('combobox',name='Farbe für Nachrichten',exact=True).select_option('blue')
        page.screenshot(path=f'/tmp/home-customization-{width}.png',full_page=True)
        page.get_by_role('button',name='Schließen',exact=True).click()
        assert page.locator('.tile').evaluate_all('(tiles)=>tiles.map(t=>t.getAttribute("data-route"))')==original
        assert tile.evaluate('(e)=>getComputedStyle(e).getPropertyValue("--tile-accent").trim()')=='#315f9f'
        assert page.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth')
        ctx.close();print('PASS home personalization',width)
    # User-provided layout cannot add unauthorized tiles.
    ctx=browser.new_context()
    preferences=json.dumps(dict(version=1,order=['/admin','/vertretungsplan','/nachrichten'],hidden=[],colors={'/admin':'rose'},compact=False))
    ctx.add_init_script(f"localStorage.setItem('sb-{PROJECT}-auth-token', {json.dumps(json.dumps(session('user')))});localStorage.setItem('portal-home:{ids['user']}',{json.dumps(preferences)});localStorage.setItem('portal-home:{ids['admin']}', '{{\"version\":1,\"hidden\":[\"/nachrichten\"]}}');")
    ctx.route(f'https://{PROJECT}.supabase.co/**',lambda r:mock(r,'user'))
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE);page.get_by_role('heading',name='User',exact=False).wait_for()
    assert page.get_by_role('link',name='Verwaltung',exact=False).count()==0
    assert page.get_by_role('link',name='Vertretungsplan',exact=False).count()==0
    page.locator('.tile[data-route="/nachrichten"]').wait_for()
    page.get_by_role('button',name='Einstellungen öffnen').click();page.get_by_role('button',name='Startbildschirm',exact=True).click()
    assert page.get_by_role('combobox',name='Farbe für Verwaltung').count()==0
    assert not errors,errors
    print('PASS account-scoped preferences and role-limited tiles; simulated API')
    browser.close()
