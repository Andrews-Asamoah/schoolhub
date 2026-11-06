import {afterEach,describe,expect,it,vi} from 'vitest';
import {Webhook} from 'svix';
vi.mock('../../env.js',()=>({env:{NODE_ENV:'test'}}));
import {NotificationDeliveryService} from './delivery.service.js';
describe('Resend verification contract',()=>{
 afterEach(()=>vi.unstubAllEnvs());
 it('parses JSON only after verification with the installed Svix SDK',async()=>{
  const secret='whsec_'+Buffer.from('unit-test-signing-secret-only').toString('base64');vi.stubEnv('RESEND_WEBHOOK_SECRET',secret);
  const createMany=vi.fn().mockResolvedValue({count:1});const service=new NotificationDeliveryService({client:{notificationProviderEvent:{createMany},$queryRaw:vi.fn().mockResolvedValue([])}} as never,{} as never,{} as never,{} as never);
  const date=new Date(),id='unit-event',raw=Buffer.from(JSON.stringify({type:'email.delivered',created_at:date.toISOString(),data:{email_id:'email-1'}}));
  const headers={'svix-id':id,'svix-timestamp':String(Math.floor(date.getTime()/1000)),'svix-signature':new Webhook(secret).sign(id,date,raw.toString())};
  expect(await service.webhook(raw,headers)).toEqual({received:true});expect(createMany).toHaveBeenCalledWith({data:[{id:'resend:unit-event',provider:'RESEND',messageId:'email-1',kind:'email.delivered',eventAt:date}],skipDuplicates:true});
  createMany.mockClear();await expect(service.webhook(Buffer.from('{}'),headers)).rejects.toThrow(/signature/);expect(createMany).not.toHaveBeenCalled();
 });
});
