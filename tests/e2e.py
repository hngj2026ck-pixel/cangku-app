# 端到端测试：真实的 Firebase SDK + 本机模拟器（Firestore + Auth），模拟三台手机
import sys
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8000/index.html?emu=1'
fails = []
def check(name, cond):
    print(('ok    ' if cond else 'FAIL  ') + name); 
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    def phone():
        ctx = b.new_context(viewport={'width': 390, 'height': 844}); pg = ctx.new_page()
        pg.on('pageerror', lambda e: print('pageerror', e)); pg.on('console', lambda m: m.type == 'error' and print('console', m.text))
        pg.on('dialog', lambda d: d.accept()); pg.goto(URL); return pg
    a = phone(); a.wait_for_selector('#lgName', timeout=30000)
    a.fill('#lgName', '郜天赐'); a.click('#lgOk')
    a.wait_for_function("document.querySelector('#meBtn').textContent.includes('郜天赐')", timeout=20000)
    check('第一个人成为管理员', '管理员' in a.inner_text('#meBtn'))
    check('管理员有「更多」页', a.query_selector('#tabs [data-tab=more]') is not None)
    bb = phone(); bb.wait_for_selector('#lgName', timeout=30000)
    bb.fill('#lgName', '张三'); bb.click('#lgOk')
    bb.wait_for_function("document.querySelector('#meBtn').textContent.includes('张三')", timeout=20000)
    check('第二个人是领用人', '领用人' in bb.inner_text('#meBtn'))
    c = phone(); c.wait_for_selector('#lgName', timeout=30000)
    c.fill('#lgName', '张三'); c.click('#lgOk')
    c.wait_for_function("document.querySelector('.sheet h2') && document.querySelector('.sheet h2').textContent.includes('等待')", timeout=20000)
    check('第三台手机用同名只能等待', True)
    a.wait_for_function("document.querySelector('#tabs [data-tab=more] .badge')", timeout=20000)
    check('管理员看到申请角标', True)
    a.click('#tabs [data-tab=more]'); a.click('[data-act=admin]'); a.wait_for_selector('[data-dok]', timeout=10000)
    a.click('[data-dok]')
    c.wait_for_function("document.querySelector('#meBtn').textContent.includes('张三')", timeout=20000)
    check('同意后新手机进入', True)
    bb.wait_for_selector('#lgName', timeout=20000)
    check('旧手机被退出', True)
    a.wait_for_selector('.card.adm:has-text("张三") [data-role=buyer]', timeout=10000)
    a.click('.card.adm:has-text("张三") [data-role=buyer]')
    c.wait_for_function("document.querySelector('#meBtn').textContent.includes('设备部')", timeout=20000)
    check('管理员改身份，对方马上变成设备部', True)
    # 设备部能新建物品，管理员能看到
    c.click('#tabs [data-tab=stock]'); c.wait_for_selector('.fab, [data-act=newItem]', timeout=10000)
    c.evaluate("document.querySelector('[data-act=newItem]') ? document.querySelector('[data-act=newItem]').click() : document.querySelector('.fab').click()")
    c.wait_for_selector('.sheet input', timeout=10000)
    c.fill('.sheet input', '测试扳手'); c.click('.sheet .btn.pri')
    a.keyboard.press('Escape'); a.click('#tabs [data-tab=stock]')
    a.wait_for_function("document.body.innerText.includes('测试扳手')", timeout=20000)
    check('设备部新建的物品管理员实时看到', True)
    check('管理员没有新建物品按钮', a.query_selector('.fab:not([hidden])') is None or not a.is_visible('.fab'))
    a.screenshot(path='e2e-admin.png'); c.screenshot(path='e2e-buyer.png')
    b.close()
print(f'\n失败 {len(fails)} 项' if fails else '\n全部通过')
sys.exit(1 if fails else 0)
