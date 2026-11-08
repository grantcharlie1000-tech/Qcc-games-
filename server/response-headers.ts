/** Node requires Set-Cookie as a string array; Object.fromEntries loses cookies. */
export function nodeResponseHeaders(response:Response):Record<string,string|string[]>{
 const headers:Record<string,string|string[]>={};
 for(const [name,value] of response.headers)if(name.toLowerCase()!=='set-cookie')headers[name]=value;
 const cookies=response.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;
 return headers;
}
