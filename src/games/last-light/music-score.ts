/** Original score: "A Light Left On". A minor, 108 BPM, 32 bars in 4/4.
 * Written for Last Light; no recordings, borrowed melodies or external samples.
 * This source is used offline to render the shipped track, not by the game loop.
 */
export const SCORE={title:'A Light Left On',bpm:108,bars:32,beatsPerBar:4} as const;
const BEAT=60/SCORE.bpm;
export const THEME_SECONDS=SCORE.bars*SCORE.beatsPerBar*BEAT;
type Note=readonly[pitch:string,beats:number];
export interface MusicNote {voice:'lead'|'answer'|'arp'|'bass'|'pad';midi:number;beat:number;length:number;velocity:number;pan:number}
const REST='-';
// Eight-bar sentences: lantern motif, answer, a quieter bridge, then a lifted return.
const MELODY:readonly (readonly Note[])[]=[
 [['E5',.5],['A5',.5],['B5',.5],['C6',1],['B5',.5],['A5',1]],
 [['G5',.5],['E5',.5],['C5',1],['E5',.5],['A5',.5],['G5',1]],
 [['E5',.5],['G5',.5],['D6',1],['C6',.5],['B5',.5],['G5',1]],
 [['A5',.5],['G5',.5],['D5',1],[REST,.5],['E5',.5],['G5',1]],
 [['E5',.5],['A5',.5],['B5',.5],['C6',.5],['E6',1],['C6',1]],
 [['B5',.5],['A5',.5],['G5',.5],['E5',.5],['C5',1],['E5',1]],
 [['D5',.5],['F5',.5],['A5',1],['G5',.5],['F5',.5],['E5',1]],
 [['G#5',.5],['B5',.5],['E6',1],['B5',.5],['G#5',.5],['E5',.5],[REST,.5]],
 [['A5',.5],['C6',.5],['E6',1],['D6',.5],['C6',.5],['B5',1]],
 [['G5',.5],['C6',.5],['B5',.5],['G5',.5],['E5',1],['G5',1]],
 [['A5',.5],['C6',.5],['E6',.5],['C6',.5],['A5',1],['G5',1]],
 [['B5',.5],['D6',.5],['G6',1],['E6',.5],['D6',.5],['B5',1]],
 [['G5',1],['B5',.5],['E6',.5],['D6',1],['B5',1]],
 [['A5',.5],['G5',.5],['E5',1],['C5',.5],['E5',.5],['A5',1]],
 [['F5',.5],['A5',.5],['D6',1],['C6',.5],['A5',.5],['F5',1]],
 [['E5',1],['G#5',.5],['B5',.5],['E6',1],[REST,1]],
 [[REST,.5],['A4',.5],['D5',1],['F5',1],['E5',1]],
 [['C5',1],['B4',.5],['A4',.5],['E5',1],[REST,1]],
 [['C5',.5],['F5',.5],['A5',1],['G5',1],['E5',1]],
 [['G5',1],['E5',1],['D5',.5],['C5',.5],[REST,1]],
 [['A4',.5],['D5',.5],['E5',.5],['F5',.5],['A5',1],['G5',1]],
 [['E5',.5],['F5',.5],['A5',1],['C6',1],['A5',1]],
 [['G5',.5],['B5',.5],['D6',1],['C6',.5],['B5',.5],['A5',1]],
 [['G#5',1],['B5',1],['E6',1],[REST,1]],
 [['E5',.5],['A5',.5],['B5',.5],['C6',1],['B5',.5],['A5',1]],
 [['C6',.5],['A5',.5],['G5',.5],['E5',.5],['C5',1],['E5',1]],
 [['G5',.5],['C6',.5],['E6',1],['D6',.5],['C6',.5],['G5',1]],
 [['B5',.5],['D6',.5],['G6',1],['E6',.5],['D6',.5],['B5',1]],
 [['A5',.5],['C6',.5],['E6',.5],['A6',.5],['E6',1],['C6',1]],
 [['A5',.5],['G5',.5],['E5',.5],['C5',.5],['E5',1],['A5',1]],
 [['D5',.5],['F5',.5],['A5',1],['G5',.5],['F5',.5],['D5',1]],
 [['E5',.5],['G#5',.5],['B5',1],['E6',.5],['B5',.5],['G#5',.5],['E5',.5]],
];
const HARMONY=['Am','F','C','G','Am','F','Dm','E','Am','C','F','G','Em','F','Dm','E','Dm','Am','F','C','Dm','F','G','E','Am','F','C','G','Am','F','Dm','E'] as const;
const CHORDS:Record<string,readonly string[]>={Am:['A3','C4','E4','B4'],F:['F3','A3','C4','E4'],C:['C3','E3','G3','D4'],G:['G3','B3','D4','A4'],Dm:['D3','F3','A3','E4'],E:['E3','G#3','B3','D4'],Em:['E3','G3','B3','D4']};
export function midi(note:string):number {
 const match=/^([A-G])(#?)([0-8])$/.exec(note);if(!match)throw new Error('Invalid score pitch: '+note);
 const semitones:Record<string,number>={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
 return 12*(Number(match[3])+1)+semitones[match[1]]+(match[2]?1:0);
}
export function composition():MusicNote[]{
 const notes:MusicNote[]=[];
 HARMONY.forEach((name,bar)=>{
  const chord=CHORDS[name].map(midi),bridge=bar>=16&&bar<24,lift=bar>=24;
  let beat=bar*4;
  for(const [pitch,length] of MELODY[bar]){if(pitch!==REST)notes.push({voice:'lead',midi:midi(pitch)-12,beat,length:length*.88,velocity:bridge?.65:lift?.92:.82,pan:.08});beat+=length;}
  // Sustained ninth/seventh voicings leave room for the melody's answer.
  for(const [i,pitch] of chord.entries())notes.push({voice:'pad',midi:pitch,beat:bar*4,length:4.25,velocity:bridge?.38:.28,pan:(i%2?1:-1)*.52});
  for(let i=0;i<8;i++)notes.push({voice:'arp',midi:chord[[0,2,1,3,2,1,3,2][i]]+12,beat:bar*4+i*.5+.25,length:.30,velocity:bridge?.26:i%2?.4:.5,pan:i%2?.36:-.36});
  for(const [i,degree] of [0,0,2,0].entries())notes.push({voice:'bass',midi:chord[degree]-12,beat:bar*4+i,length:i%2?.55:.8,velocity:bridge?.52:.72,pan:0});
  if(bar%2===1){for(const [i,pitch] of [chord[2],chord[3],chord[1]].entries())notes.push({voice:'answer',midi:pitch+12,beat:bar*4+2.5+i*.5,length:.35,velocity:bridge?.25:.38,pan:-.24});}
 });
 return notes.sort((a,b)=>a.beat-b.beat);
}
/** Render two cycles and keep the second, so reverb and delay also meet at the loop boundary. */
export async function renderTheme(sampleRate=22050):Promise<AudioBuffer>{
 const frames=Math.round(THEME_SECONDS*sampleRate),cycle=frames/sampleRate;
 const c=new OfflineAudioContext(2,frames*2,sampleRate),mix=c.createGain();mix.gain.value=.7;mix.connect(c.destination);
 const echo=c.createDelay(1);echo.delayTime.value=BEAT*.75;const echoGain=c.createGain();echoGain.gain.value=.18;echo.connect(echoGain);echoGain.connect(mix);
 const compressor=c.createDynamicsCompressor();compressor.threshold.value=-17;compressor.knee.value=15;compressor.ratio.value=2.2;compressor.attack.value=.01;compressor.release.value=.22;compressor.connect(mix);
 const bus=c.createBiquadFilter();bus.type='lowpass';bus.frequency.value=3900;bus.Q.value=.45;bus.connect(compressor);
 const verb=c.createConvolver(),impulse=c.createBuffer(2,Math.floor(sampleRate*1.5),sampleRate);let seed=4147;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1;};
 for(let channel=0;channel<2;channel++){const a=impulse.getChannelData(channel);for(let i=0;i<a.length;i++)a[i]=random()*Math.exp(-i/sampleRate*5)*.15;}
 verb.buffer=impulse;const wet=c.createGain();wet.gain.value=.11;verb.connect(wet);wet.connect(mix);
 const pulse=c.createPeriodicWave(new Float32Array(9),Float32Array.from({length:9},(_,i)=>i===0?0:Math.sin(Math.PI*i*.32)/(i*i**.3)));
 const noise=c.createBuffer(1,Math.floor(sampleRate*.22),sampleRate),data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=random();
 const gainAt=(level:number,at:number,duration:number,attack:number)=>{const g=c.createGain();g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(level,at+attack);g.gain.exponentialRampToValueAtTime(.00001,at+Math.max(attack+.02,duration));return g;};
 for(let repeat=0;repeat<2;repeat++){
  for(const n of composition()){
   const at=repeat*cycle+n.beat*BEAT,duration=n.length*BEAT,osc=c.createOscillator(),pan=c.createStereoPanner();
   osc.frequency.value=440*2**((n.midi-69)/12);pan.pan.value=n.pan;
   const levels={lead:.115,answer:.048,arp:.045,bass:.16,pad:.028};
   if(n.voice==='lead')osc.setPeriodicWave(pulse);else osc.type=n.voice==='bass'?'triangle':n.voice==='answer'?'triangle':'sine';
   const g=gainAt(levels[n.voice]*n.velocity,at,duration,n.voice==='pad'?.18:.009);
   osc.connect(g);g.connect(pan);pan.connect(bus);if(n.voice!=='bass'){pan.connect(verb);if(n.voice==='lead'||n.voice==='answer')pan.connect(echo);}
   osc.start(at);osc.stop(at+duration+.04);
  }
  for(let bar=0;bar<SCORE.bars;bar++){
   const bridge=bar>=16&&bar<24;
   for(let eighth=0;eighth<8;eighth++){
    const at=repeat*cycle+(bar*4+eighth*.5)*BEAT,source=c.createBufferSource(),filter=c.createBiquadFilter();source.buffer=noise;filter.type='highpass';filter.frequency.value=eighth%2?6000:4800;
    const g=gainAt(bridge?.008:eighth%2?.013:.018,at,.045,.002);source.connect(filter);filter.connect(g);g.connect(bus);source.start(at);source.stop(at+.06);
   }
   if(bridge&&bar%2===0)continue;
   for(const beat of [0,2]){const at=repeat*cycle+(bar*4+beat)*BEAT,kick=c.createOscillator(),g=gainAt(bridge?.05:.085,at,.15,.004);kick.frequency.setValueAtTime(110,at);kick.frequency.exponentialRampToValueAtTime(42,at+.13);kick.connect(g);g.connect(bus);kick.start(at);kick.stop(at+.17);}
   for(const beat of [1,3]){const at=repeat*cycle+(bar*4+beat)*BEAT,snare=c.createBufferSource(),filter=c.createBiquadFilter(),g=gainAt(bridge?.012:.028,at,.11,.003);snare.buffer=noise;filter.type='bandpass';filter.frequency.value=1700;filter.Q.value=.7;snare.connect(filter);filter.connect(g);g.connect(bus);snare.start(at);snare.stop(at+.13);}
  }
 }
 const rendered=await c.startRendering(),result=new AudioBuffer({numberOfChannels:2,length:frames,sampleRate});
 let peak=0;for(let channel=0;channel<2;channel++){const src=rendered.getChannelData(channel).subarray(frames);for(const value of src)peak=Math.max(peak,Math.abs(value));result.copyToChannel(src,channel);}
 // Gentle saturation keeps the quiet melodic details audible without sharp transient peaks.
 const level=peak>0?1/peak:1,drive=2.8,normalizer=.86/Math.tanh(drive);
 for(let channel=0;channel<2;channel++){const a=result.getChannelData(channel);for(let i=0;i<a.length;i++)a[i]=Math.tanh(a[i]*level*drive)*normalizer;}
 return result;
}
