# 端到端测试：真实 Firebase SDK + 本机模拟器（Firestore + Auth），名单登录、多设备
import sys, openpyxl
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8000/index.html?emu=1'
wb = openpyxl.Workbook(); ws = wb.active
for r in [('姓名', '身份'), ('郜天赐', '管理员'), ('张三', '库管员'), ('张三102', ''), ('李四', '')]: ws.append(r)
wb.save('roster-test.xlsx')
fails = []
def check(name, cond):
    print(('ok    ' if cond else 'FAIL  ') + name)
    if not cond: fails.append(name)
def me_has(pg, txt, t=20000): pg.wait_for_function(f"document.querySelector('#meBtn').textContent.includes('{txt}')", timeout=t)
with sync_playwright() as p:
    b = p.chromium.launch()
    def dev():
        ctx = b.new_context(viewport={'width': 390, 'height': 844}); pg = ctx.new_page()
        pg.on('pageerror', lambda e: print('pageerror', e)); pg.on('dialog', lambda d: d.accept()); pg.goto(URL)
        pg.wait_for_selector('#lgName', timeout=30000); return pg
    def login(pg, n): pg.fill('#lgName', n); pg.click('#lgOk')
    a = dev(); login(a, '郜天赐'); me_has(a, '郜天赐')
    check('第一个人成为管理员', '管理员' in a.inner_text('#meBtn'))
    a.click('#tabs [data-tab=more]'); a.click('[data-act=admin]'); a.wait_for_selector('#admFile', state='attached', timeout=10000)
    a.set_input_files('#admFile', 'roster-test.xlsx')
    a.wait_for_function("document.querySelectorAll('[data-rn]').length >= 3", timeout=30000)
    check('导入名单：3 人（张三102 合并）', a.eval_on_selector_all('[data-rn]', 'e=>e.length') == 3)
    b1 = dev(); login(b1, '张三'); me_has(b1, '库管员')
    check('名单里的人直接按名单身份进入', True)
    b2 = dev(); login(b2, '张三'); me_has(b2, '库管员')
    check('第二台设备不用同意直接进入', True)
    b1.wait_for_timeout(2000); check('第一台设备照常在线', '张三' in b1.inner_text('#meBtn'))
    w = dev(); login(w, '王五'); me_has(w, '领用人')
    check('名单外的人自动成为领用人', True)
    a.wait_for_selector('[data-rn="张三"] [data-role=buyer]', timeout=10000); a.click('[data-rn="张三"] [data-role=buyer]')
    me_has(b1, '设备部'); me_has(b2, '设备部')
    check('管理员改身份，张三两台设备都变成设备部', True)
    a2 = dev(); login(a2, '郜天赐'); me_has(a2, '管理员')
    check('管理员第二台设备（电脑）直接进入', True)
    b2.click('#tabs [data-tab=stock]'); b2.wait_for_selector('.fab', timeout=10000); b2.click('.fab'); b2.wait_for_selector('#fName')
    b2.fill('#fName', '测试扳手'); b2.fill('#fUnit', '把'); b2.click('.sheet .btn.pri')
    a2.click('#tabs [data-tab=stock]'); a2.wait_for_function("document.body.innerText.includes('测试扳手')", timeout=20000)
    check('设备部新建物品，管理员电脑实时看到', True)
    a2.screenshot(path='e2e-admin.png'); b2.screenshot(path='e2e-buyer.png')
    b.close()
print(f'\n失败 {len(fails)} 项' if fails else '\n全部通过')
sys.exit(1 if fails else 0)
