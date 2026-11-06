import {describe,expect,it} from 'vitest';
import {rolloverHash} from './rollover-hash.js';
describe('rollover evidence canonicalization',()=>{
 it('survives JSONB object-key reordering without ignoring changed decisions',()=>{
  const original={policy:{name:'Review',version:'1'},decisions:[{studentId:'s',action:'PROMOTED'}]};
  const stored={decisions:[{action:'PROMOTED',studentId:'s'}],policy:{version:'1',name:'Review'}};
  expect(rolloverHash(original)).toBe(rolloverHash(stored));
  expect(rolloverHash(original)).not.toBe(rolloverHash({...stored,policy:{...stored.policy,version:'2'}}));
 });
});
