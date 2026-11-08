/** Original Christmas waltz: "Snowfall on the Square". D major, 96 BPM, 3/4, 32 bars.
 * Celesta, pizzicato, soft strings, flute, bass and synthesized sleigh bells.
 * Rendering-only source: the application loads the finished MP3, not this synthesizer.
 */
export const SCORE={title:'Snowfall on the Square',bpm:96,bars:32,beatsPerBar:3} as const;
export const THEME_SECONDS=SCORE.bars*SCORE.beatsPerBar*60/SCORE.bpm;
const BEAT=60/SCORE.bpm;
const MELODY=[
 'F#5:.5 A5:.5 D6:1 C#6:.5 B5:.5', 'A5:.5 F#5:.5 E5:.5 F#5:.5 D5:1',
 'G5:.5 B5:.5 E6:1 D6:.5 B5:.5', 'A5:1 E5:.5 F#5:.5 G5:.5 E5:.5',
 'F#5:.5 A5:.5 B5:.5 A5:.5 F#5:.5 E5:.5', 'G5:.5 B5:.5 D6:1 B5:1',
 'E5:.5 G5:.5 B5:1 G5:.5 E5:.5', 'C#5:.5 E5:.5 A5:1 G5:.5 E5:.5',
 'F#5:.5 A5:.5 D6:.5 E6:.5 F#6:1', 'E6:.5 D6:.5 B5:1 A5:1',
 'B5:.5 D6:.5 G6:1 F#6:.5 E6:.5', 'C#6:.5 B5:.5 A5:1 E5:1',
 'A5:.5 F#5:.5 D5:1 F#5:.5 A5:.5', 'B5:.5 A5:.5 G5:.5 F#5:.5 E5:1',
 'G5:.5 B5:.5 E6:1 D6:.5 B5:.5', 'C#6:1 B5:.5 A5:.5 G5:.5 E5:.5',
 'F#5:1 D5:.5 B4:.5 F#5:1', 'G5:.5 F#5:.5 E5:1 B4:1',
 'D5:.5 G5:.5 B5:1 A5:.5 G5:.5', 'F#5:1 E5:.5 D5:.5 A4:1',
 'B4:.5 D5:.5 F#5:1 E5:.5 D5:.5', 'E5:.5 G5:.5 B5:1 A5:.5 G5:.5',
 'G5:1 B5:.5 A5:.5 G5:.5 E5:.5', 'C#5:.5 E5:.5 A5:1 -:1',
 'F#5:.5 A5:.5 D6:1 C#6:.5 B5:.5', 'A5:.5 F#5:.5 E5:.5 F#5:.5 D5:1',
 'G5:.5 B5:.5 D6:.5 E6:.5 G6:1', 'F#6:.5 E6:.5 C#6:1 A5:1',
 'F#5:.5 A5:.5 D6:.5 F#6:.5 E6:.5 D6:.5', 'B5:.5 A5:.5 G5:1 B5:1',
 'E5:.5 G5:.5 B5:1 G5:.5 E5:.5', 'C#5:.5 E5:.5 A5:1 G5:.5 E5:.5',
] as const;
const HARMONY=['D','Bm','G','A','D','G','Em','A','D','Bm','G','A','D','G','Em','A','Bm','Em','G','D','Bm','Em','G','A','D','Bm','G','A','D','G','Em','A'] as const;
const CHORDS:Record<string,readonly string[]>={D:['D3','F#3','A3','E4'],Bm:['B2','D3','F#3','A3'],G:['G2','B2','D3','F#3'],A:['A2','C#3','E3','G3'],Em:['E3','G3','B3','D4']};
const midi=(note:string)=>{const m=/^([A-G])(#?)([0-8])$/.exec(note);if(!m)throw Error('Invalid Christmas score pitch');return(Number(m[3])+1)*12+({C:0,D:2,E:4,F:5,G:7,A:9,B:11} as Record<string,number>)[m[1]]+(m[2]?1:0);};
export interface ChristmasNote {voice:'celesta'|'plucked'|'strings'|'flute'|'bass';midi:number;beat:number;length:number;velocity:number;pan:number}
export function composition():ChristmasNote[]{
 const notes:ChristmasNote[]=[];
 HARMONY.forEach((name,bar)=>{
  const chord=CHORDS[name].map(midi),bridge=bar>=16&&bar<24;let beat=bar*3;
  for(const token of MELODY[bar].split(' ')){const [pitch,value]=token.split(':'),length=Number(value);if(pitch!=='-')notes.push({voice:'celesta',midi:midi(pitch),beat,length:length*.86,velocity:bridge?.62:bar>=24?.94:.8,pan:.12});beat+=length;}
  for(const [i,pitch] of chord.entries())notes.push({voice:'strings',midi:pitch+12,beat:bar*3,length:3.25,velocity:bridge?.34:.24,pan:i%2?.5:-.5});
  for(let i=0;i<6;i++)notes.push({voice:'plucked',midi:chord[[0,2,1,3,2,1][i]]+12,beat:bar*3+i*.5,length:.28,velocity:bridge?.3:i%2?.48:.58,pan:i%2?-.3:.3});
  notes.push({voice:'bass',midi:chord[0],beat:bar*3,length:1.25,velocity:.72,pan:0},{voice:'bass',midi:chord[2]-12,beat:bar*3+1.5,length:.9,velocity:.46,pan:0});
  if(bar%2===1)for(const [i,pitch] of [chord[2],chord[3],chord[1]].entries())notes.push({voice:'flute',midi:pitch+12,beat:bar*3+1.5+i*.5,length:.43,velocity:bridge?.35:.24,pan:-.2});
 });return notes.sort((a,b)=>a.beat-b.beat);
}
export async function renderTheme(sampleRate=22050):Promise<AudioBuffer>{
 const frames=Math.round(THEME_SECONDS*sampleRate),cycle=frames/sampleRate,c=new OfflineAudioContext(2,frames*2,sampleRate);
 const dry=c.createGain();dry.gain.value=.65;dry.connect(c.destination);
 const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=6200;filter.Q.value=.3;filter.connect(dry);
 const verb=c.createConvolver(),impulse=c.createBuffer(2,Math.floor(sampleRate*1.8),sampleRate);let seed=251226;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1;};
 for(let ch=0;ch<2;ch++){const a=impulse.getChannelData(ch);for(let i=0;i<a.length;i++)a[i]=random()*.11*Math.exp(-i/sampleRate*4.5);}
 verb.buffer=impulse;const wet=c.createGain();wet.gain.value=.13;verb.connect(wet);wet.connect(dry);
 function tone(midi:number,at:number,duration:number,level:number,pan:number,type:OscillatorType,ratio=1,attack=.008){
  const osc=c.createOscillator(),gain=c.createGain(),panner=c.createStereoPanner();osc.type=type;osc.frequency.value=440*2**((midi-69)/12)*ratio;panner.pan.value=pan;
  gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+attack);gain.gain.exponentialRampToValueAtTime(.00001,at+Math.max(duration,attack+.03));
  osc.connect(gain);gain.connect(panner);panner.connect(filter);panner.connect(verb);osc.start(at);osc.stop(at+duration+.035);
 }
 for(let repeat=0;repeat<2;repeat++){
  for(const n of composition()){
   const at=repeat*cycle+n.beat*BEAT,d=n.length*BEAT;
   if(n.voice==='celesta'){
    tone(n.midi,at,d+.6,.10*n.velocity,n.pan,'sine');tone(n.midi,at,d*.7+.25,.023*n.velocity,n.pan,'sine',2.76);tone(n.midi,at,.19,.008*n.velocity,n.pan,'sine',4.02);
   }else if(n.voice==='strings')tone(n.midi,at,d,.035*n.velocity,n.pan,'triangle',1,.22);
   else if(n.voice==='plucked')tone(n.midi,at,d+.12,.075*n.velocity,n.pan,'triangle');
   else if(n.voice==='flute')tone(n.midi,at,d+.08,.055*n.velocity,n.pan,'sine',1,.055);
   else tone(n.midi,at,d,.10*n.velocity,0,'triangle');
  }
  for(let bar=0;bar<SCORE.bars;bar++)for(let eighth=0;eighth<6;eighth++){
   const bridge=bar>=16&&bar<24,at=repeat*cycle+(bar*3+eighth*.5)*BEAT,level=(eighth%2?.004:.006)*(bridge?.45:1),pan=eighth%2?-.5:.5;
   // Three short metallic resonances make a quiet sleigh-bell shake, without sampled noise.
   tone(110,at,.065,level,pan,'sine',1);tone(110,at,.045,level*.65,pan,'sine',1.31);tone(110,at,.035,level*.3,pan,'sine',1.63);
  }
 }
 const rendered=await c.startRendering(),result=new AudioBuffer({numberOfChannels:2,length:frames,sampleRate});let peak=0;
 for(let ch=0;ch<2;ch++){const src=rendered.getChannelData(ch).subarray(frames);for(const n of src)peak=Math.max(peak,Math.abs(n));result.copyToChannel(src,ch);}
 const drive=2.1,normalizer=.84/Math.tanh(drive);for(let ch=0;ch<2;ch++){const a=result.getChannelData(ch);for(let i=0;i<a.length;i++)a[i]=Math.tanh(a[i]/Math.max(peak,.00001)*drive)*normalizer;}
 return result;
}
