// 用 Firebase 官方模拟器测试 firestore.rules（名单登录版）
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, collection, getDocs } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'cangku-rules-test', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
const db = u => env.authenticatedContext(u).firestore();
const anon = env.unauthenticatedContext().firestore();
let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, e.message); } }
const batch = (d, f) => { const b = writeBatch(d); f(b, d); return b.commit(); };

await t('未登录读物品被拒', assertFails(getDocs(collection(anon, 'items'))));
await t('第一个人成为管理员', assertSucceeds(batch(db('A'), (b, d) => { b.set(doc(d, 'roster', '甲'), { role: 'leader', admin: true, t: 1 }); b.set(doc(d, 'members', 'A'), { name: '甲', role: 'leader', admin: true, t: 1 }); b.set(doc(d, 'meta', 'boot'), { uid: 'A', t: 1 }); })));
await t('之后的新人不能自封管理员', assertFails(batch(db('B'), (b, d) => { b.set(doc(d, 'roster', '乙'), { role: 'leader', admin: true, t: 1 }); b.set(doc(d, 'members', 'B'), { name: '乙', role: 'leader', admin: true, t: 1 }); })));
await t('名单外新人登记为领用人', assertSucceeds(batch(db('B'), (b, d) => { b.set(doc(d, 'roster', '乙'), { role: 'user', admin: false, t: 1 }); b.set(doc(d, 'members', 'B'), { name: '乙', role: 'user', admin: false, t: 1 }); })));
await t('领用人不能改名单', assertFails(setDoc(doc(db('B'), 'roster', '乙'), { role: 'keeper', admin: false, t: 2 })));
await t('领用人不能给自己升级', assertFails(updateDoc(doc(db('B'), 'members', 'B'), { role: 'keeper' })));
await t('管理员把丙加进名单设为库管员', assertSucceeds(setDoc(doc(db('A'), 'roster', '丙'), { role: 'keeper', admin: false, t: 1 })));
await t('丙用新设备按名单身份进入', assertSucceeds(setDoc(doc(db('C1'), 'members', 'C1'), { name: '丙', role: 'keeper', admin: false, t: 1 })));
await t('丙第二台设备也能进（多设备）', assertSucceeds(setDoc(doc(db('C2'), 'members', 'C2'), { name: '丙', role: 'keeper', admin: false, t: 1 })));
await t('冒充名单身份以外的身份被拒', assertFails(setDoc(doc(db('C3'), 'members', 'C3'), { name: '丙', role: 'leader', admin: true, t: 1 })));
await t('名单里的人不能被新设备覆盖名单', assertFails(batch(db('C4'), (b, d) => { b.set(doc(d, 'roster', '丙'), { role: 'user', admin: false, t: 1 }); b.set(doc(d, 'members', 'C4'), { name: '丙', role: 'user', admin: false, t: 1 }); })));
await t('名单外的名字不能直接写成库管员', assertFails(setDoc(doc(db('D'), 'members', 'D'), { name: '丁', role: 'keeper', admin: false, t: 1 })));
await t('库管员能读写物品', assertSucceeds(setDoc(doc(db('C1'), 'items', 'i1'), { name: '扳手' })));
await t('没登录过的设备读不到物品', assertFails(getDocs(collection(db('X'), 'items'))));
await t('管理员改身份（名单+设备）', assertSucceeds(batch(db('A'), (b, d) => { b.set(doc(d, 'roster', '丙'), { role: 'buyer', admin: false, t: 2 }); b.update(doc(d, 'members', 'C1'), { role: 'buyer' }); b.update(doc(d, 'members', 'C2'), { role: 'buyer' }); })));
await t('管理员不能设不存在的身份', assertFails(setDoc(doc(db('A'), 'roster', '丙'), { role: 'boss', admin: false, t: 3 })));
await t('库管员不能改别人身份', assertFails(setDoc(doc(db('C1'), 'roster', '乙'), { role: 'keeper', admin: false, t: 3 })));
await t('谁也改不了 boot', assertFails(setDoc(doc(db('A'), 'meta', 'boot'), { uid: 'C1', t: 9 })));
await t('任何登录的人能查名单里的名字', assertSucceeds(getDoc(doc(db('Z'), 'roster', '甲'))));
await t('登录过的人能列出名单', assertSucceeds(getDocs(collection(db('B'), 'roster'))));

await env.cleanup();
console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
