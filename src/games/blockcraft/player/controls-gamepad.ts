// Gamepad API mapping (standard layout): left stick moves, right stick looks, A jump, B sneak, X drop,
// Y inventory, RT attack, LT use, LB/RB hotbar, left stick click sprints, right stick click picks.
// With a screen open, Y or B closes it (the ui consumes `inventory` to close any screen).
import type {InputAction} from '../engine/contracts';
import type {ControlState,InputPhase} from './controls-core';

/** Standard-mapping button indices. */
export const PAD={A:0,B:1,X:2,Y:3,LB:4,RB:5,LT:6,RT:7,BACK:8,START:9,LS:10,RS:11} as const;
const HELD_BUTTONS:readonly (readonly [number,InputAction])[]=[[PAD.A,'jump'],[PAD.B,'sneak'],[PAD.X,'drop'],[PAD.Y,'inventory'],
  [PAD.RT,'attack'],[PAD.LT,'use'],[PAD.LS,'sprint'],[PAD.RS,'pick']];
/** Button index, action and ControlState source id, built once so polling every frame allocates nothing. */
const HELD:readonly (readonly [number,InputAction,string])[]=HELD_BUTTONS.map(([i,action])=>[i,action,'pad:'+i] as const);
const DEAD_ZONE=.15,TRIGGER=.3;
/** Radians per second at full right-stick deflection (sensitivity 1). */
export const PAD_LOOK_SPEED=3.2;

export interface PadButtonLike{readonly pressed:boolean;readonly value:number}
export interface PadLike{readonly buttons:readonly PadButtonLike[];readonly axes:readonly number[]}
export interface PadFrame{connected:boolean;moveX:number;moveY:number;lookX:number;lookY:number;buttons:boolean[]}

/** Radial dead zone rescaled to 0..1 beyond it. */
function stick(x:number,y:number,out:[number,number]):[number,number]{
  const len=Math.hypot(x,y);
  if(!(len>DEAD_ZONE)){out[0]=out[1]=0;return out;}
  const k=Math.min(1,(len-DEAD_ZONE)/(1-DEAD_ZONE))/len;out[0]=x*k;out[1]=y*k;return out;
}
const pair:[number,number]=[0,0];
/** Normalised snapshot of a gamepad (null = none connected). */
export function readPad(pad:PadLike|null,out:PadFrame={connected:false,moveX:0,moveY:0,lookX:0,lookY:0,buttons:[]}):PadFrame{
  out.connected=!!pad;out.buttons.length=0;
  if(!pad){out.moveX=out.moveY=out.lookX=out.lookY=0;return out;}
  const a=pad.axes;
  stick(a[0]??0,a[1]??0,pair);out.moveX=pair[0];out.moveY=pair[1];
  stick(a[2]??0,a[3]??0,pair);out.lookX=pair[0];out.lookY=pair[1];
  for(let i=0;i<pad.buttons.length;i++){const b=pad.buttons[i];out.buttons.push(i===PAD.LT||i===PAD.RT?b.value>TRIGGER:b.pressed||b.value>.5);}
  return out;
}

/** Turns successive pad frames into held actions, edges, hotbar steps and look deltas. */
export class PadMapper{
  private prev:boolean[]=[];
  private readonly out={hotbar:0,dyaw:0,dpitch:0};
  /** `dt` seconds since the last frame; sensitivity from the settings. The returned object is reused. */
  apply(frame:PadFrame,state:ControlState,phase:InputPhase,dt:number,sensitivity:number){
    const out=this.out;out.hotbar=0;out.dyaw=out.dpitch=0;
    const b=frame.buttons,prev=this.prev;
    if(phase!=='playing'){
      state.releaseAll('pad:');state.setPadMove(0,0);
      if(phase==='screen'&&(b[PAD.Y]&&!prev[PAD.Y]||b[PAD.B]&&!prev[PAD.B]))state.tap('inventory');
    }else{
      // Level-based holds (a button kept down through a screen is held again), edges only on a new press.
      for(let k=0;k<HELD.length;k++){
        const held=HELD[k],i=held[0],action=held[1],source=held[2];
        if(b[i]){if(!state.holds(action,source))state.press(action,source,!prev[i]);}
        else state.release(action,source);
      }
      if(b[PAD.RB]&&!prev[PAD.RB])out.hotbar++;
      if(b[PAD.LB]&&!prev[PAD.LB])out.hotbar--;
      state.setPadMove(frame.moveX,-frame.moveY);
      // Quadratic response: fine aim near the centre, fast turns at full tilt. Stick up (negative y) looks up.
      const k=PAD_LOOK_SPEED*sensitivity*dt;
      out.dyaw=-frame.lookX*Math.abs(frame.lookX)*k;out.dpitch=-frame.lookY*Math.abs(frame.lookY)*k*.75;
    }
    this.prev.length=b.length;for(let i=0;i<b.length;i++)this.prev[i]=b[i];
    return out;
  }
  reset(){this.prev.length=0;}
}
