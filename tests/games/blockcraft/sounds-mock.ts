// A Web Audio stand-in for the sound tests (vitest runs in node). It records the graph and the
// automation calls and is strict where browsers are strict: exponential ramps to zero, non-finite
// values and starting a source twice throw, as they do in a real AudioContext.
type Target=MockNode|MockParam;

export class MockParam{
  value:number;readonly events:{type:string;value:number;time:number}[]=[];
  constructor(value:number){this.value=value;}
  private check(value:number,time:number){
    if(!Number.isFinite(value)||!Number.isFinite(time))throw new TypeError(`non-finite automation ${value} at ${time}`);
    if(time<0)throw new RangeError('negative time');
  }
  setValueAtTime(value:number,time:number){this.check(value,time);this.events.push({type:'set',value,time});this.value=value;return this;}
  linearRampToValueAtTime(value:number,time:number){this.check(value,time);this.events.push({type:'linear',value,time});this.value=value;return this;}
  exponentialRampToValueAtTime(value:number,time:number){
    this.check(value,time);if(value<=0)throw new RangeError('exponential ramp to a non-positive value');
    this.events.push({type:'exp',value,time});this.value=value;return this;
  }
  setTargetAtTime(value:number,time:number,constant:number){
    this.check(value,time);if(!(constant>0))throw new RangeError('time constant must be positive');
    this.events.push({type:'target',value,time});this.value=value;return this;
  }
  cancelScheduledValues(time:number){this.check(0,time);this.events.push({type:'cancel',value:0,time});return this;}
  /** The last value scheduled at or before `time` (enough for envelope peak checks). */
  peak(){return this.events.reduce((m,e)=>Math.max(m,e.value),0);}
}

export class MockNode{
  readonly outputs=new Set<Target>();readonly inputs=new Set<MockNode>();
  constructor(readonly ctx:MockAudioContext,readonly kind:string){ctx.nodes.push(this);}
  connect<T extends Target>(target:T):T{
    this.outputs.add(target);if(target instanceof MockNode)target.inputs.add(this);return target;
  }
  disconnect(){for(const o of this.outputs)if(o instanceof MockNode)o.inputs.delete(this);this.outputs.clear();}
}
export class MockSource extends MockNode{
  startTime:number|null=null;stopTime:number|null=null;offset=0;loop=false;onended:(()=>void)|null=null;
  start(time=0,offset=0){
    if(this.startTime!==null)throw new Error('InvalidStateError: start called twice');
    if(!Number.isFinite(time)||!Number.isFinite(offset))throw new TypeError('non-finite start');
    this.startTime=time;this.offset=offset;
  }
  stop(time=0){if(this.startTime===null)throw new Error('InvalidStateError: stop before start');this.stopTime=time;}
  /** Playing at `time`: started and not yet stopped. */
  playing(time:number){return this.startTime!==null&&this.startTime<=time+1e-9&&(this.stopTime===null||this.stopTime>time);}
}
export class MockOscillator extends MockSource{
  type:OscillatorType='sine';readonly frequency=new MockParam(440);readonly detune=new MockParam(0);
  constructor(ctx:MockAudioContext){super(ctx,'oscillator');}
}
export class MockBufferSource extends MockSource{
  buffer:MockBuffer|null=null;readonly playbackRate=new MockParam(1);loopStart=0;loopEnd=0;
  constructor(ctx:MockAudioContext){super(ctx,'buffer');}
}
export class MockGain extends MockNode{readonly gain=new MockParam(1);constructor(ctx:MockAudioContext){super(ctx,'gain');}}
export class MockPanner extends MockNode{readonly pan=new MockParam(0);constructor(ctx:MockAudioContext){super(ctx,'panner');}}
export class MockFilter extends MockNode{
  type:BiquadFilterType='lowpass';readonly frequency=new MockParam(350);readonly Q=new MockParam(1);readonly gain=new MockParam(0);
  constructor(ctx:MockAudioContext){super(ctx,'filter');}
}
export class MockCompressor extends MockNode{
  readonly threshold=new MockParam(-24);readonly knee=new MockParam(30);readonly ratio=new MockParam(12);
  readonly attack=new MockParam(.003);readonly release=new MockParam(.25);
  constructor(ctx:MockAudioContext){super(ctx,'compressor');}
}
export class MockBuffer{
  readonly channels:Float32Array[];
  constructor(readonly numberOfChannels:number,readonly length:number,readonly sampleRate:number){
    this.channels=Array.from({length:numberOfChannels},()=>new Float32Array(length));
  }
  get duration(){return this.length/this.sampleRate;}
  getChannelData(channel:number){return this.channels[channel];}
}

export class MockAudioContext{
  static created:MockAudioContext[]=[];
  currentTime=0;readonly sampleRate=8000;state:'running'|'suspended'|'closed'='running';
  readonly nodes:MockNode[]=[];readonly buffers:MockBuffer[]=[];
  readonly destination:MockNode;
  resumes=0;suspends=0;closes=0;
  constructor(){this.destination=new MockNode(this,'destination');MockAudioContext.created.push(this);}
  createGain(){return new MockGain(this);}
  createOscillator(){return new MockOscillator(this);}
  createBufferSource(){return new MockBufferSource(this);}
  createBiquadFilter(){return new MockFilter(this);}
  createStereoPanner(){return new MockPanner(this);}
  createDynamicsCompressor(){return new MockCompressor(this);}
  createBuffer(channels:number,length:number,rate:number){
    if(!(length>0)||!(rate>0))throw new RangeError('bad buffer');
    const b=new MockBuffer(channels,length,rate);this.buffers.push(b);return b;
  }
  resume(){if(this.state==='closed')return Promise.reject(new Error('closed'));this.resumes++;this.state='running';return Promise.resolve();}
  suspend(){if(this.state==='closed')return Promise.reject(new Error('closed'));this.suspends++;this.state='suspended';return Promise.resolve();}
  close(){this.closes++;this.state='closed';return Promise.resolve();}
  /** Nodes of one type. */
  all<T extends MockNode>(kind:string):T[]{return this.nodes.filter(n=>n.kind===kind) as T[];}
  /** Sources (oscillators and buffer sources) playing at the current time. */
  playingSources(){return this.nodes.filter((n):n is MockSource=>n instanceof MockSource&&n.playing(this.currentTime));}
  /** Is `node` connected (through any chain) to the destination? */
  reaches(node:MockNode,seen=new Set<MockNode>()):boolean{
    if(node===this.destination)return true;if(seen.has(node))return false;seen.add(node);
    for(const o of node.outputs){
      // A modulator feeding an AudioParam reaches the output through the param's node.
      const next=o instanceof MockNode?o:this.nodes.find(n=>Object.values(n).includes(o));
      if(next&&this.reaches(next,seen))return true;
    }
    return false;
  }
}

/** A gesture target and a dispatcher of user gestures for the sound service. */
export function gestureTarget(){
  const target=new EventTarget();
  return{target,gesture(type='pointerdown'){target.dispatchEvent(new Event(type));}};
}

/** Seeded random for deterministic synth choices. */
export function seeded(seed=1){
  let s=seed>>>0;
  return()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}
