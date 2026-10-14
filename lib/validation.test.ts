import test from 'node:test';
import assert from 'node:assert/strict';
import { ownedPath, requestSchema, fileType } from './validation';
const user='9fe811b5-8c5b-46c9-b35f-772e32ae1aa1',chat='5c26e312-fc91-4762-a867-4d9cd12e52b0';
test('attachment paths must match both authenticated owner and conversation',()=>{
 const path=`${user}/${chat}/25a69142-adbb-41bb-8e28-46f6d847f1c1.pdf`;
 assert.equal(ownedPath(path,user,chat),true);
 assert.equal(ownedPath(path,chat,chat),false);
 assert.equal(ownedPath(path,user,user),false);
 assert.equal(ownedPath(`${user}/${chat}/../../secret.pdf`,user,chat),false);
 assert.equal(ownedPath(path.replace('.pdf','.exe'),user,chat),false);
});
test('reject empty and oversized requests; allow attachment-only requests',()=>{
 assert.equal(requestSchema.safeParse({conversationId:chat,text:'   ',attachments:[]}).success,false);
 assert.equal(requestSchema.safeParse({conversationId:chat,text:'a'.repeat(12001),attachments:[]}).success,false);
 assert.equal(requestSchema.safeParse({conversationId:chat,text:'',attachments:[{path:'p',name:'report.pdf'}]}).success,true);
 assert.equal(fileType('REPORT.PDF'),'application/pdf');
 assert.equal(fileType('report.exe'),undefined);
});
