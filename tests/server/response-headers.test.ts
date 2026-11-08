import {it,expect} from 'vitest';
import {nodeResponseHeaders} from '../../server/response-headers';
it('Node adapter preserves independent Set-Cookie headers for transaction clear plus context creation',()=>{
 const response=Response.json({linked:true});
 response.headers.append('Set-Cookie','__Host-nceastudy_pair=; Path=/; HttpOnly; Secure; Max-Age=0');
 response.headers.append('Set-Cookie','__Host-nceastudy_context=random; Path=/; HttpOnly; Secure; Max-Age=900');
 const headers=nodeResponseHeaders(response);
 expect(headers['set-cookie']).toEqual(['__Host-nceastudy_pair=; Path=/; HttpOnly; Secure; Max-Age=0','__Host-nceastudy_context=random; Path=/; HttpOnly; Secure; Max-Age=900']);
 expect(headers['content-type']).toBe('application/json');
});
