import { describe,expect,it } from 'vitest';
import { rolloverPlanSchema } from './rollover-policy.js';
const base={fromYearId:'old',fromTermId:'final',toYearId:'new',toTermId:'first',policy:{name:'Annual review',version:'1',requiresPublishedReport:true,basis:'Review published final-term reports.'},decisions:[{studentId:'s',action:'PROMOTED',toClassId:'next',reason:'Reviewed academic evidence.'}]};
describe('rollover policy contracts',()=>{
 it('requires a unique reviewed decision for every selected student',()=>{expect(rolloverPlanSchema.safeParse(base).success).toBe(true);expect(rolloverPlanSchema.safeParse({...base,decisions:[...base.decisions,...base.decisions]}).success).toBe(false);});
 it('requires a destination for continuing students and none for graduates',()=>{expect(rolloverPlanSchema.safeParse({...base,decisions:[{...base.decisions[0],toClassId:null}]}).success).toBe(false);expect(rolloverPlanSchema.safeParse({...base,decisions:[{...base.decisions[0],action:'GRADUATED'}]}).success).toBe(false);});
 it('rejects same-year rollovers and missing reasons or policy basis',()=>{expect(rolloverPlanSchema.safeParse({...base,toYearId:'old'}).success).toBe(false);expect(rolloverPlanSchema.safeParse({...base,policy:{...base.policy,basis:''}}).success).toBe(false);});
});
