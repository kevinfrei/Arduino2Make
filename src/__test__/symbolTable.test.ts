import { expect, it } from 'bun:test';

import { MakeSymbolTable } from '../symbols';

it('Basic Symbol Table', () => {
  const st = MakeSymbolTable();
  expect(st.parent()).toBeUndefined();
  const sym = st.add('a.b.c', 'd');
  expect(sym).toBeDefined();
  expect(sym.name).toEqual('c');
  expect(sym.value).toEqual('d');
  const b = sym.parent;
  expect(b).toBeDefined();
  if (!b) throw new Error();
  const c = b.get('c');
  expect(c).toBeDefined();
  if (!c) throw new Error();
  expect(c).toEqual(sym);
  const bp = b.parent();
  expect(bp).toBeDefined();
  if (!bp) throw new Error();
  const ab = bp.parent;
  expect(ab).toBeDefined();
  if (!ab) throw new Error();
  const abp = ab.parent();
  expect(abp).toBeDefined();
  if (!abp) throw new Error();
  expect(abp.name).toEqual('a');
  expect(abp.parent).toEqual(st);
  const sym2 = st.add('a.b.d', 'e');
  expect(sym2.name).toEqual('d');
  expect(sym2.value).toEqual('e');
  expect(st.get('a.b.c')).toEqual(sym);
  expect(st.get(['a', 'b', 'c'])).toEqual(sym);
  expect(st.get('a.b.d')).toEqual(sym2);
  expect(st.get(['a', 'b', 'd'])).toEqual(sym2);
  expect(st.check('a.b.e')).toBeUndefined();
  expect(() => st.get(['a', 'b', 'g'])).toThrowError();
  const bSym = st.get('a.b');
  expect(bSym).toEqual(bp);
  expect(bSym.value).toBeUndefined();
});
