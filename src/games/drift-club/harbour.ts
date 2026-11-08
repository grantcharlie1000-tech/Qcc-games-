import type {Projector, Theme, Vec} from './scene';
const tau=Math.PI*2;
const noise=(i:number)=>{const n=Math.sin(i*72.37+1.72)*43758.54;return n-Math.floor(n);};
function tower(p:Projector,x:number,z:number,winter:boolean){
  p.disc(x,-.92,z,1.55,winter?'#d2e6e5':'#d2ac78',1.2);
  const tiers=['#fbeace','#c75d4a','#ffe8bb','#bd574a','#fff2ce'];
  for(let i=0;i<tiers.length;i++){
    const r=.6-i*.055, y=-.82+i*.52;
    p.box(x,y,z,r*2,.53,r*2,tiers[i],tiers[i],i%2?'#914a48':'#c9b797');
  }
  p.box(x,1.78,z,1.17,.13,1.17,'#264f56','#204450','#213943');
  p.box(x,1.91,z,.65,.49,.65,'#fff3a1','#f7bf5c','#dd964d');
  p.box(x,2.4,z,.96,.17,.96,'#34575a','#24464d','#1c3e47');
  const a:Vec=[x,3,z];p.path([[x-.54,2.55,z+.48],[x+.54,2.55,z+.48],a],'#d66049');p.path([[x+.54,2.55,z+.48],[x+.54,2.55,z-.48],a],'#934e48');
}
function tree(p:Projector,x:number,z:number,h:number){
  p.box(x,-.83,z,.18,h*.4,.18,'#855d43','#6b4c3f','#634239');
  for(let i=0;i<3;i++){
    const y=-.65+i*h*.23,rad=(.29-i*.05)*h;
    const tip:Vec=[x,y+h*(.54-i*.045),z];
    for(let j=0;j<6;j++){
      const a=j*tau/6,b=(j+1)*tau/6;
      p.path([[x+Math.cos(a)*rad,y,z+Math.sin(a)*rad],[x+Math.cos(b)*rad,y,z+Math.sin(b)*rad],tip],['#236456','#367d66','#428f76','#3f8a73','#255d58','#275c56'][j]);
    }
    p.path([[x-rad*.48,y+h*.28,z],[x+rad*.5,y+h*.28,z],[x,y+h*.22,z+rad*.35],tip],'#e8f5e9');
  }
}
function sail(p:Projector,x:number,z:number,i:number){
  const c=i%2?'#ee805a':'#f2b954';
  p.disc(x,-.86,z,.31,'#1b6268',1);
  p.path([[x-.36,-.72,z+.69],[x+.29,-.72,z+.57],[x+.34,-.72,z-.54],[x,-.65,z-.96],[x-.33,-.72,z-.46]],'#f5ddad');
  p.line([x,-.7,z],[x,1.65,z],'#244e52',2);
  p.path([[x-.05,1.6,z],[x-.86,-.40,z],[x-.05,-.37,z]],c);
  p.path([[x+.06,1.35,z],[x+.61,-.31,z],[x+.06,-.35,z]],'#fff2d0');
}
export function harbour(p:Projector,theme:Theme,course:number){
  const {c,w,h}=p, winter=theme==='noel';
  const port=course%3;
  const horizon=Math.max(h*.075,Math.min(h*.22,p.point([-6.6,-.92,-7.4])[1]-h*.038,p.point([6.15,-.86,-8.2])[1]-h*.035));
  const sky=c.createLinearGradient(0,0,0,horizon*1.25);
  sky.addColorStop(0,(winter?['#182c50','#293657','#233451']:['#f3a381','#8fb7c1','#dc926f'])[port]);sky.addColorStop(1,winter?'#aeb8bb':'#ffe1aa');
  c.fillStyle=sky;c.fillRect(0,0,w,h);
  const sunX=w*.78,sunY=horizon*.46,rad=Math.min(w,h)*.067;
  c.fillStyle=winter?'#fff0be':'#fff2ba';c.beginPath();c.arc(sunX,sunY,rad,0,tau);c.fill();
  if(winter){
    for(let i=0;i<45;i++){const x=noise(i+2)*w,y=noise(i+85)*horizon*.85,r=1+noise(i+32)*1.4;c.fillStyle='#fff9d6';c.fillRect(x-r,y,r*2,1);c.fillRect(x,y-r,1,r*2);}
  }else{
    for(let i=0;i<8;i++){
      const x=noise(i)*w,y=horizon*(.06+noise(i+20)*.58);
      c.fillStyle='#ffe4bb';c.beginPath();c.ellipse(x,y,w*.04,h*.004,0,0,tau);c.fill();
    }
  }
  for(let layer=0;layer<3;layer++){
    const count=10+layer*3,base=horizon*(.87+layer*.075);
    const color=(winter?['#8797ab','#607e90','#365c71']:['#d59d96','#b98582','#7c8480'])[layer];
    c.fillStyle=color;c.beginPath();c.moveTo(-12,horizon*1.16);
    for(let i=-1;i<=count+1;i++)c.lineTo(i*w/count,base-horizon*(.12+noise(100+layer*80+i)*(.44-layer*.08)));
    c.lineTo(w+12,horizon*1.16);c.closePath();c.fill();
    if(winter&&layer===0){
      for(let i=1;i<count;i++){
        const y=base-horizon*(.12+noise(100+i)*.44);if(y>horizon*.54)continue;
        c.fillStyle='#d5dfde';c.beginPath();c.moveTo(i*w/count,y);c.lineTo(i*w/count+w/count*.27,y+9);c.lineTo(i*w/count+2,y+5);c.lineTo(i*w/count-8,y+8);c.fill();
      }
    }
  }
  const water=c.createLinearGradient(0,horizon,0,h);water.addColorStop(0,winter?'#62939d':'#9bc3af');water.addColorStop(.43,winter?'#366b7c':'#61a8a0');water.addColorStop(1,winter?'#204d61':'#267f81');c.fillStyle=water;c.fillRect(0,horizon,w,h-horizon);
  c.fillStyle=winter?'#becdc9':'#f2caa5';c.fillRect(0,horizon,w,2);
  c.lineCap='round';
  for(let i=0;i<260;i++){
    const v=noise(i+301),x=noise(i+851)*w,y=horizon+(h-horizon)*v;
    c.strokeStyle=(Math.abs(x-sunX)<w*(.035+v*.14))?(winter?'#c3d6ce99':'#ffe0a988'):(i%3?'#d6e3cd48':'#174e603b');
    c.lineWidth=.7+v*1.4;c.beginPath();c.moveTo(x,y);c.lineTo(x+w*(.003+noise(i+31)*.026)*(.35+v),y);c.stroke();
  }
  tower(p,-6.6,-7.4,winter);
  if(port===1){
    for(const side of [-1,1])for(let i=0;i<5;i++){
      const x=side*(5.9+i*.28),z=-2-i*1.15;
      p.box(x,-.98,z,.26,1.12,.27,'#f7dda5','#986f56','#6b5750');
      p.disc(x,.15,z,.16,winter?'#f7f4d8':'#dc7352');
      if(i<4)p.line([x,.02,z],[x+side*.28,.02,z-1.15],'#726955',2);
    }
  }
  if(port===2)for(const side of [-1,1]){
    const x=side*5.5,z=-2.6;
    p.disc(x,-.8,z,.55,'#d5a34e');p.box(x,-.76,z,.4,1.1,.4,'#edc46b','#a97839','#c29147');
    p.box(x,.34,z,.53,.28,.53,'#fff2b0','#ffe29a','#e7ad55');p.disc(x,.65,z,.36,'#596967');
  }
  if(winter){
    for(const [x,z,hg] of [[6.9,-8.7,2.3],[5.9,-7.5,2.8],[6.8,-6.9,1.6],[-7.7,-6.2,1.8]]){
      p.disc(x,-.91,z,.95,'#dee9e5',.82);tree(p,x,z,hg);
    }
    for(let i=0;i<2;i++){
      const x=-6.4+i*.87,z=2.7+i*.54;
      p.box(x,-.94,z,.77,.63,.7,'#ecbf74',i?'#bc5149':'#338775','#775b4f');
      p.box(x,-.3,z,.15,.025,.71,'#fde09a','#eed287','#b69c72');
    }
  }else{ sail(p,7.1,-6.6,0);sail(p,6.15,-8.2,1);sail(p,-6.15,2.5,1); }
  // The launch end floats on its own timber jetty.
  for(const side of [-1,1]){
    for(let i=0;i<12;i++){
      const z=-8.7+i*1.57,x=side*4.47;
      p.box(x,-.69,z,.66,.27,1.51,winter?'#cadbd3':'#cfa474','#886c56','#9d7b5e');
      if(i%3===0){p.box(x,-1,z,.25,1.43,.24,'#f4ce92','#91684d','#765b49');p.disc(x,.44,z,.16,winter?'#fff2ca':'#efe2b5');}
    }
  }
}
