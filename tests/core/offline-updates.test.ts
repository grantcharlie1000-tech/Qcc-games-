import {afterEach,expect,test,vi} from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();});
async function setup(){
 vi.stubEnv('PROD',true);vi.stubGlobal('location',{href:'https://arcade.test/'});
 vi.stubGlobal('window',new EventTarget());const document=new EventTarget();vi.stubGlobal('document',document);
 const messages:unknown[]=[];
 const worker=Object.assign(new EventTarget(),{scriptURL:'https://arcade.test/sw.js',state:'activated',postMessage:(message:{type:string},ports?:MessagePort[])=>{messages.push(message);if(message.type==='ARCADE_VERSION')ports![0].postMessage({version:'new',entry:'https://arcade.test/assets/running.js'});}});
 const registration=Object.assign(new EventTarget(),{scope:'https://arcade.test/',active:worker,waiting:undefined as any,installing:undefined as any,update:vi.fn(async()=>{})});
 const sw=Object.assign(new EventTarget(),{controller:worker,getRegistration:vi.fn(async()=>registration),register:vi.fn(async()=>registration)});
 vi.stubGlobal('navigator',{serviceWorker:sw});
 return {sw,document,messages,registration,module:await import('../../src/core/offline')};
}
test('ACK and comparison use the running module URL even if HTML points at another entry',async()=>{
 const {module,messages,document}=await setup();
 Object.assign(document,{querySelector:()=>({src:'https://arcade.test/assets/mixed-bootstrap.js'})});
 const status=vi.fn();module.watchUpdates('https://arcade.test/assets/running.js',status);await module.checkForUpdates();
 expect(messages).toContainEqual({type:'ARCADE_CLIENT_READY',entry:'https://arcade.test/assets/running.js'});
 expect(status).toHaveBeenLastCalledWith({available:false,message:''});
});
test('online recovery retries initial registration failure while preserving the controller',async()=>{
 const {module,sw,registration}=await setup();const controller=sw.controller;
 sw.register.mockRejectedValueOnce(new Error('temporarily offline'));
 module.watchUpdates('https://arcade.test/assets/running.js',vi.fn());await module.checkForUpdates();
 expect(sw.register).toHaveBeenCalledTimes(1);expect(sw.controller).toBe(controller);
 window.dispatchEvent(new Event('online'));
 await vi.waitFor(()=>expect(registration.update).toHaveBeenCalledOnce());
 expect(sw.register).toHaveBeenCalledTimes(2);expect(sw.controller).toBe(controller);
});

test('running module ownership is acknowledged even while a future registration job is unsettled',async()=>{
 const {module,sw,messages}=await setup();let release!:(value:unknown)=>void;
 sw.register.mockImplementationOnce(()=>new Promise(resolve=>release=resolve) as any);
 module.watchUpdates('https://arcade.test/assets/running.js',vi.fn());const check=module.checkForUpdates();
 await vi.waitFor(()=>expect(sw.register).toHaveBeenCalledOnce());
 try{expect(messages).toContainEqual({type:'ARCADE_CLIENT_READY',entry:'https://arcade.test/assets/running.js'});}finally{release(undefined);await check;}
});

function waitingWorker(entry='https://arcade.test/assets/next.js'){
 return Object.assign(new EventTarget(),{scriptURL:'https://arcade.test/sw.js',state:'installed',postMessage:vi.fn((message:{type:string},ports?:MessagePort[])=>{if(message.type==='ARCADE_VERSION')ports![0].postMessage({version:'next',entry});})});
}
test('a coherent waiting worker is offered even while the running controller matches this document',async()=>{
 const {module,registration}=await setup();registration.waiting=waitingWorker();const status=vi.fn();
 module.watchUpdates('https://arcade.test/assets/running.js',status);await module.checkForUpdates();
 expect(status).toHaveBeenLastCalledWith(expect.objectContaining({available:true}));
});
test('an installing worker reaching installed updates the notice without a document navigation',async()=>{
 const {module,registration}=await setup();const next=waitingWorker();next.state='installing';registration.installing=next;const status=vi.fn();
 module.watchUpdates('https://arcade.test/assets/running.js',status);await module.checkForUpdates();registration.dispatchEvent(new Event('updatefound'));
 next.state='installed';registration.waiting=next;next.dispatchEvent(new Event('statechange'));
 await vi.waitFor(()=>expect(status).toHaveBeenLastCalledWith(expect.objectContaining({available:true})));
});

test('explicit activation targets the offered version and waits for its controller',async()=>{
 const {module,registration,sw}=await setup();const next=waitingWorker();registration.waiting=next;module.watchUpdates('https://arcade.test/assets/running.js',vi.fn());await module.checkForUpdates();
 const activation=module.activateUpdate();await vi.waitFor(()=>expect(next.postMessage).toHaveBeenCalledWith({type:'ARCADE_ACTIVATE',version:'next',entry:'https://arcade.test/assets/next.js'}));
 next.state='activated';sw.controller=next as any;registration.waiting=undefined;sw.dispatchEvent(new Event('controllerchange'));await activation;
});
test('replacement of the offered waiting worker refuses activation safely',async()=>{
 const {module,registration}=await setup();const next=waitingWorker();registration.waiting=next;module.watchUpdates('https://arcade.test/assets/running.js',vi.fn());await module.checkForUpdates();registration.waiting=waitingWorker('https://arcade.test/assets/replaced.js');
 await expect(module.activateUpdate()).rejects.toThrow('changed');expect(next.postMessage.mock.calls.some(([message])=>message.type==='ARCADE_ACTIVATE')).toBe(false);
});
test('unresponsive activation fails within the deadline without changing the current controller',async()=>{
 vi.useFakeTimers();try{
  const {module,registration,sw}=await setup();const initial=sw.controller,next=waitingWorker();registration.waiting=next;module.watchUpdates('https://arcade.test/assets/running.js',vi.fn());await module.checkForUpdates();
  const activation=module.activateUpdate(),failure=expect(activation).rejects.toThrow('could not start');
  await vi.waitFor(()=>expect(next.postMessage.mock.calls.some(([message])=>message.type==='ARCADE_ACTIVATE')).toBe(true));await vi.advanceTimersByTimeAsync(12000);await failure;expect(sw.controller).toBe(initial);
 }finally{vi.useRealTimers();}
});

test('a late old-controller inspection cannot clear the newer controller update notice',async()=>{
 const {module,registration,sw}=await setup();const status=vi.fn();module.watchUpdates('https://arcade.test/assets/running.js',status);await module.checkForUpdates();
 const old=sw.controller,post=old.postMessage;let delayed:MessagePort|undefined;
 old.postMessage=(message,ports)=>{if(message.type==='ARCADE_VERSION'&&!delayed)delayed=ports![0];else post(message,ports);};
 const check=module.checkForUpdates();await vi.waitFor(()=>expect(delayed).toBeDefined());
 const next=waitingWorker();next.state='activated';sw.controller=next as any;registration.active=next as any;sw.dispatchEvent(new Event('controllerchange'));
 await vi.waitFor(()=>expect(status).toHaveBeenLastCalledWith(expect.objectContaining({available:true})));const start=status.mock.calls.length;
 delayed!.postMessage({version:'new',entry:'https://arcade.test/assets/running.js'});await check;
 expect(status.mock.calls.slice(start).every(([value])=>value.available)).toBe(true);
});

test('online recovery hooks exist even when the initial inspection fails before registration',async()=>{
 const {module,sw,registration}=await setup();const initial=sw.controller;sw.getRegistration.mockRejectedValueOnce(new Error('transient inspection failure'));
 module.watchUpdates('https://arcade.test/assets/running.js',vi.fn());await module.checkForUpdates();expect(sw.register).not.toHaveBeenCalled();
 window.dispatchEvent(new Event('online'));await vi.waitFor(()=>expect(registration.update).toHaveBeenCalledOnce());expect(sw.controller).toBe(initial);
});

test('an offered update becoming the controller during its initial query does not falsely refuse reload',async()=>{
 const {module,registration,sw}=await setup();
 const next=waitingWorker();registration.waiting=next;
 module.watchUpdates('https://arcade.test/assets/running.js',vi.fn());await module.checkForUpdates();
 const initial=sw.controller,send=initial.postMessage;
 initial.postMessage=(message,ports)=>{
  if(message.type==='ARCADE_VERSION'){
   next.state='activated';sw.controller=next as any;registration.active=next as any;registration.waiting=undefined;
  }
  send(message,ports);
 };
 await expect(module.activateUpdate()).resolves.toBeUndefined();
 expect(next.postMessage.mock.calls.some(([message])=>message.type==='ARCADE_ACTIVATE')).toBe(false);
});

test('a different controller replacing the offered update still refuses reload',async()=>{
 const {module,registration,sw}=await setup();const next=waitingWorker();registration.waiting=next;
 module.watchUpdates('https://arcade.test/assets/running.js',vi.fn());await module.checkForUpdates();
 const different=waitingWorker('https://arcade.test/assets/different.js');different.state='activated';
 registration.waiting=undefined;registration.active=different as any;sw.controller=different as any;
 await expect(module.activateUpdate()).rejects.toThrow('changed');
 expect(next.postMessage.mock.calls.some(([message])=>message.type==='ARCADE_ACTIVATE')).toBe(false);
});

test('a stale offered-build reply cannot authorize reload after another controller takes over',async()=>{
 const {module,registration,sw}=await setup();const next=waitingWorker();registration.waiting=next;
 module.watchUpdates('https://arcade.test/assets/running.js',vi.fn());await module.checkForUpdates();
 const initial=sw.controller,send=initial.postMessage;
 initial.postMessage=(message,ports)=>{
  if(message.type==='ARCADE_VERSION'){
   next.state='activated';registration.waiting=undefined;registration.active=next as any;sw.controller=next as any;
  }
  send(message,ports);
 };
 const nextSend=next.postMessage.getMockImplementation()!;
 next.postMessage.mockImplementation((message,ports)=>{
  if(message.type==='ARCADE_VERSION'){
   const different=waitingWorker('https://arcade.test/assets/different.js');different.state='activated';
   sw.controller=different as any;registration.active=different as any;
  }
  nextSend(message,ports);
 });
 await expect(module.activateUpdate()).rejects.toThrow('changed');
});

