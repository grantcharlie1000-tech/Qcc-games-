/** A pointer gesture can move OR tap. Its release can never release a rigid body. */
export class AnimalGesture {
 pointer:number|null=null;startX=0;startY=0;startAim=0;moved=false;startTime=0;
 begin(pointer:number,x:number,y:number,aim:number,time=0){if(this.pointer!==null)return false;this.pointer=pointer;this.startTime=time;this.startX=x;this.startY=y;this.startAim=aim;this.moved=false;return true;}
 move(pointer:number,x:number,y:number){if(pointer!==this.pointer)return null;if(Math.hypot(x-this.startX,y-this.startY)>7)this.moved=true;return this.moved?this.startAim+x-this.startX:null;}
 end(pointer:number,x:number,y:number,time=0){if(pointer!==this.pointer)return false;this.move(pointer,x,y);const tap=!this.moved&&time-this.startTime<=350;this.clear();return tap;}
 clear(){this.pointer=null;this.moved=false;}
}
