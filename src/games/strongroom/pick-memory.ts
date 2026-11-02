import{OPERATOR_IDS,validateLoadout,type LoadoutSelection,type OperatorId}from'./loadouts';
type Side='attack'|'defend';
export class PickMemory{
 private choices:Record<Side,Partial<Record<OperatorId,LoadoutSelection>>>={attack:{},defend:{}};
 private last:Partial<Record<Side,OperatorId>>={};
 remember(attacking:boolean,value:unknown){const pick=validateLoadout(attacking,value);if(!pick)return false;const side=attacking?'attack':'defend';this.choices[side][pick.operator]=pick;this.last[side]=pick.operator;return true;}
 recall(attacking:boolean,operator?:OperatorId){const side=attacking?'attack':'defend',op=operator??this.last[side],pick=op?this.choices[side][op]:undefined;return pick?{...pick}:undefined;}
 snapshot(){return{choices:{attack:Object.fromEntries(Object.entries(this.choices.attack).map(([op,p])=>[op,{...p}])),defend:Object.fromEntries(Object.entries(this.choices.defend).map(([op,p])=>[op,{...p}]))},last:{...this.last}};}
 restore(value:unknown){if(!value||typeof value!=='object')return;const data=value as any;for(const side of ['attack','defend']as const){if(data[side])this.remember(side==='attack',data[side]);for(const op of OPERATOR_IDS){const pick=validateLoadout(side==='attack',data.choices?.[side]?.[op]);if(pick&&pick.operator===op)this.choices[side][op]=pick;}const last=data.last?.[side];if(OPERATOR_IDS.includes(last)&&this.choices[side][last as OperatorId])this.last[side]=last;}}
}
