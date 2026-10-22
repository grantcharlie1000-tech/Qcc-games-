// Other players' characters: an original blocky explorer (humanoid geometry, art painted here) whose shirt takes the
// player's seat colour, drawn by the entity renderer as the 'player_avatar' kind, plus DOM name tags with a health bar.
// Avatars are never saved, never simulated by mob AI and cannot be targeted by the crosshair.
import * as THREE from 'three';
import type {Entity,EntityKind,EntityModel,Game,PartPose} from '../engine/contracts';
import {buildTexture,grain,hash,jfrom,jpivot,type BoxDef,type Painter} from '../entity/hostile-art';

export const AVATAR_KIND='player_avatar';
/** Shirt colours by seat (host 0, guests 1..3). */
export const SEAT_COLOURS=[0x3f7fd8,0xd8573f,0x3fae5a,0xd8b13f];
const SKIN=0xc08a63,SKIN_DARK=0xa8744f,HAIR=0x4a2f1f,EYE_WHITE=0xf2f2f2,EYE=0x3b5bb0,MOUTH=0x7a4a37,TROUSERS=0x33416e,SHOES=0x3a3a3a;

const head:Painter=(face,x,y)=>{
  const s=7+face.length;
  if(face==='top')return grain(HAIR,x,y,s,.08);
  if(face==='bottom')return grain(SKIN_DARK,x,y,s,.05);
  if(y<2||(face!=='front'&&y<3)||face==='back'&&y<6)return grain(HAIR,x,y,s,.1);
  if(face==='front'){
    if(y===4&&(x===1||x===5))return EYE_WHITE;
    if(y===4&&(x===2||x===6))return EYE;
    if(y===6&&x>=3&&x<=4)return MOUTH;
  }
  return grain(SKIN,x,y,s,.05);
};
/** Shirt in near white: the part is tinted by the seat colour. */
const shirt:Painter=(face,x,y,w)=>{const edge=(face==='front'||face==='back')&&(x===0||x===w-1);return grain(edge?0xcfcfcf:0xf4f4f4,x,y,11+face.length,.05);};
const arm:Painter=(face,x,y,_w,h)=>y>=h-3?grain(SKIN,x,y,13,.05):face==='bottom'?grain(SKIN,x,y,13,.05):shirt(face,x,y,4,h);
const leg:Painter=(face,x,y,_w,h)=>y>=h-2||face==='bottom'?grain(SHOES,x,y,17,.06):grain(hash(x,y,19)<.1?0x2a365c:TROUSERS,x,y,19+face.length,.04);
const box=(x:number,y:number,z:number,w:number,h:number,d:number,u:number,v:number,paint:Painter,mirror=false):BoxDef=>({from:jfrom(x,y,z,w,h),size:[w,h,d],uv:[u,v],paint,mirror});

export function avatarModel():EntityModel{
  const arms=(sign:number)=>[box(sign<0?-3:-1,-2,-2,4,12,4,40,16,arm,sign>0)];
  const t=buildTexture([
    {name:'head',pivot:jpivot(0,0,0),boxes:[box(-4,-8,-4,8,8,8,0,0,head)]},
    {name:'body',pivot:jpivot(0,0,0),tinted:true,boxes:[box(-4,0,-2,8,12,4,16,16,shirt)]},
    {name:'right_arm',pivot:jpivot(-5,2,0),tinted:true,boxes:arms(-1)},
    {name:'left_arm',pivot:jpivot(5,2,0),tinted:true,boxes:arms(1)},
    {name:'right_leg',pivot:jpivot(-1.9,12,0),boxes:[box(-2,0,-2,4,12,4,0,16,leg)]},
    {name:'left_leg',pivot:jpivot(1.9,12,0),boxes:[box(-2,0,-2,4,12,4,0,16,leg,true)]}
  ],64,64);
  const set=(pose:Record<string,PartPose>,name:string,x:number,y:number,z:number)=>{const p=pose[name]??(pose[name]={x,y,z});p.x=x;p.y=y;p.z=z;p.px=0;p.py=0;p.pz=0;p.visible=true;return p;};
  return{textureWidth:t.width,textureHeight:t.height,paint:t.paint,parts:t.parts,
    animate(e,pose,state){
      const phase=typeof e.data.walk==='number'?e.data.walk:0,amount=state.reducedMotion?0:Math.min(1,typeof e.data.stride==='number'?e.data.stride:0);
      const c=Math.cos(phase),sneak=e.data.sneaking===true;
      const pitch=Math.max(-1.3,Math.min(1.3,e.pitch)),yaw=Math.max(-1.3,Math.min(1.3,state.headYaw));
      set(pose,'head',pitch,yaw,0);
      set(pose,'body',sneak?.5:0,0,0);
      set(pose,'right_leg',c*1.4*amount,0,0);set(pose,'left_leg',-c*1.4*amount,0,0);
      const swing=typeof e.data.swing==='number'?Math.sin(Math.max(0,Math.min(1,1-(e.data.swing-state.partial)/6))*Math.PI):0;
      set(pose,'right_arm',-c*amount-swing*1.3,0,0);set(pose,'left_arm',c*amount,0,0);
    },
    appearance(e){return{tint:typeof e.data.color==='number'?e.data.color:SEAT_COLOURS[0]};}};
}

/** Moves an avatar a share of the way to its latest reported position each tick and advances its walk cycle. */
export function stepAvatar(e:Entity){
  const d=e.data,tx=d.tx,ty=d.ty,tz=d.tz;
  if(typeof tx==='number'&&typeof ty==='number'&&typeof tz==='number'){
    const far=Math.hypot(tx-e.x,ty-e.y,tz-e.z)>8;
    const k=far?1:.5;
    const ox=e.x,oz=e.z;
    e.x+=(tx-e.x)*k;e.y+=(ty-e.y)*k;e.z+=(tz-e.z)*k;
    if(typeof d.tyaw==='number'){const dy=Math.atan2(Math.sin(d.tyaw-e.headYaw),Math.cos(d.tyaw-e.headYaw));e.headYaw+=dy*k;e.yaw=e.headYaw;}
    if(typeof d.tpitch==='number')e.pitch+=(d.tpitch-e.pitch)*k;
    const moved=far?0:Math.hypot(e.x-ox,e.z-oz);
    const stride=typeof d.stride==='number'?d.stride:0;
    d.stride=stride+(Math.min(1,moved*4)-stride)*.4;
    d.walk=((typeof d.walk==='number'?d.walk:0)+moved*2.2)%(Math.PI*2*100);
  }
  if(typeof d.swing==='number'){if(d.swing>1)d.swing--;else delete d.swing;}
}

export function avatarKind():EntityKind{
  return{kind:AVATAR_KIND,category:'misc',width:.6,height:1.8,maxHealth:20,render:'model',model:avatarModel(),physics:'none',
    persist:false,pickable:false,despawns:false,
    tick:e=>stepAvatar(e),
    // Damage is the player's own (on their device): the avatar itself cannot be hurt.
    hurt:()=>false};
}

/** Name and health above each avatar, positioned from the camera every frame. */
export class NameTags{
  private layer=document.createElement('div');
  private tags=new Map<number,{el:HTMLDivElement;name:HTMLSpanElement;bar:HTMLSpanElement;last:string}>();
  private v=new THREE.Vector3();
  constructor(private game:Game){
    this.layer.className='bc-nametags';this.layer.setAttribute('aria-hidden','true');
    game.root.append(this.layer);
  }
  frame(avatars:readonly {entity:Entity;name:string;health:number;away:boolean;dead:boolean}[]){
    const cam=this.game.render.camera,w=this.layer.clientWidth||this.game.root.clientWidth,h=this.layer.clientHeight||this.game.root.clientHeight;
    const seen=new Set<number>();
    for(const a of avatars){
      const e=a.entity;if(e.removed)continue;
      seen.add(e.id);
      let t=this.tags.get(e.id);
      if(!t){
        const el=document.createElement('div');el.className='bc-nametag';
        const name=document.createElement('span');name.className='bc-nametag-name';
        const health=document.createElement('span');health.className='bc-nametag-health';
        const bar=document.createElement('span');health.append(bar);el.append(name,health);this.layer.append(el);
        t={el,name,bar,last:''};this.tags.set(e.id,t);
      }
      const label=`${a.name}${a.away?' (away)':a.dead?' (dead)':''}`,key=`${label}|${Math.round(a.health)}`;
      if(key!==t.last){t.last=key;t.name.textContent=label;t.bar.style.width=`${Math.max(0,Math.min(20,a.health))/20*100}%`;}
      this.v.set(e.x,e.y+e.height+.45,e.z).project(cam);
      const visible=this.v.z<1&&this.v.z>-1&&Math.abs(this.v.x)<1.2&&Math.abs(this.v.y)<1.2;
      t.el.hidden=!visible;
      if(visible)t.el.style.transform=`translate(${((this.v.x+1)/2*w).toFixed(1)}px,${((1-this.v.y)/2*h).toFixed(1)}px) translate(-50%,-100%)`;
    }
    for(const [id,t] of this.tags)if(!seen.has(id)){t.el.remove();this.tags.delete(id);}
  }
  dispose(){this.layer.remove();this.tags.clear();}
}
