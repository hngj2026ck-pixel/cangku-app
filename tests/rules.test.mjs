// 用 Firebase 官方模拟器测试 firestore.rules（在 GitHub Actions 里跑）
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, collection, getDocs } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'cangku-rules-test', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
const db = u => env.authenticatedContext(u).firestore();
const anon = env.unauthenticatedContext().firestore();
let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, e.message); } }
const join = (d, u, name, role, admin, boot) => { const b = writeBatch(d); b.set(doc(d, 'names', name), { uid: u, t: 1 }); b.set(doc(d, 'members', u), { name, role, admin, t: 1 }); if (boot) b.set(doc(d, 'meta', 'boot'), { uid: u, t: 1 }); return b.commit(); };

await t('未登录读物品被拒', assertFails(getDocs(collection(anon, 'items'))));
await t('没登记的手机读物品被拒', assertFails(getDocs(collection(db('x'), 'items'))));
await t('第一个人不能冒充普通人以外再加 boot 给别人', assertFails((() => { const d = db('A'); const b = writeBatch(d); b.set(doc(d, 'names', '甲'), { uid: 'A', t: 1 }); b.set(doc(d, 'members', 'A'), { name: '甲', role: 'leader', admin: true, t: 1 }); b.set(doc(d, 'meta', 'boot'), { uid: 'B', t: 1 }); return b.commit(); })()));
await t('第一个人成为管理员', assertSucceeds(join(db('A'), 'A', '甲', 'leader', true, true)));
await t('第二个人不能再当管理员', assertFails(join(db('B'), 'B', '乙', 'leader', true, true)));
await t('第二个人不能自封库管员', assertFails(join(db('B'), 'B', '乙', 'keeper', false, false)));
await t('第二个人以领用人加入', assertSucceeds(join(db('B'), 'B', '乙', 'user', false, false)));
await t('别的手机抢已有的名字被拒', assertFails(join(db('C'), 'C', '乙', 'user', false, false)));
await t('名字和成员对不上被拒', assertFails((() => { const d = db('C'); const b = writeBatch(d); b.set(doc(d, 'names', '丙'), { uid: 'C', t: 1 }); b.set(doc(d, 'members', 'C'), { name: '丁', role: 'user', admin: false, t: 1 }); return b.commit(); })()));
await t('领用人不能给自己升级', assertFails(updateDoc(doc(db('B'), 'members', 'B'), { role: 'keeper' })));
await t('领用人不能把自己设成管理员', assertFails(updateDoc(doc(db('B'), 'members', 'B'), { admin: true })));
await t('领用人不能删别人', assertFails(deleteDoc(doc(db('B'), 'members', 'A'))));
await t('领用人不能改名字绑定', assertFails(updateDoc(doc(db('B'), 'names', '甲'), { uid: 'B' })));
await t('领用人能读物品', assertSucceeds(getDocs(collection(db('B'), 'items'))));
await t('领用人能写申报', assertSucceeds(setDoc(doc(db('B'), 'requests', 'r1'), { kind: 'use', t: 1 })));
await t('领用人不能看换手机申请列表', assertFails(getDocs(collection(db('B'), 'devreqs'))));
await t('新手机提交换手机申请', assertSucceeds(setDoc(doc(db('C'), 'devreqs', 'C'), { name: '乙', t: 2, status: 'pending' })));
await t('新手机不能把自己的申请改成同意', assertFails(setDoc(doc(db('C'), 'devreqs', 'C'), { name: '乙', t: 2, status: 'ok' })));
await t('新手机不能替别人提交申请', assertFails(setDoc(doc(db('C'), 'devreqs', 'D'), { name: '乙', t: 2, status: 'pending' })));
await t('新手机仍然读不到物品', assertFails(getDocs(collection(db('C'), 'items'))));
await t('管理员能看申请列表', assertSucceeds(getDocs(collection(db('A'), 'devreqs'))));
await t('管理员同意换手机', assertSucceeds((() => { const d = db('A'); const b = writeBatch(d); b.set(doc(d, 'names', '乙'), { uid: 'C', t: 3 }); b.set(doc(d, 'members', 'C'), { name: '乙', role: 'user', admin: false, t: 1 }); b.delete(doc(d, 'members', 'B')); b.delete(doc(d, 'devreqs', 'C')); return b.commit(); })()));
await t('旧手机读不到物品了', assertFails(getDocs(collection(db('B'), 'items'))));
await t('新手机能读物品', assertSucceeds(getDocs(collection(db('C'), 'items'))));
await t('管理员改身份', assertSucceeds(updateDoc(doc(db('A'), 'members', 'C'), { role: 'buyer' })));
await t('管理员不能设不存在的身份', assertFails(updateDoc(doc(db('A'), 'members', 'C'), { role: 'boss' })));
await t('谁也改不了 boot', assertFails(setDoc(doc(db('A'), 'meta', 'boot'), { uid: 'C', t: 9 })));
await t('成员能写设置', assertSucceeds(setDoc(doc(db('C'), 'meta', 'settings'), { returnCats: [] })));
await t('管理员移除人员', assertSucceeds((() => { const d = db('A'); const b = writeBatch(d); b.delete(doc(d, 'members', 'C')); b.delete(doc(d, 'names', '乙')); return b.commit(); })()));
await t('被移除的人读不到', assertFails(getDocs(collection(db('C'), 'items'))));
await t('任何登录的人能查名字是否被占用', assertSucceeds(getDoc(doc(db('Z'), 'names', '甲'))));

await env.cleanup();
console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
