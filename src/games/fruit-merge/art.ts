import {TIERS} from './engine';
/** Original vector-like fruit portraits. No downloaded images or emoji. */
export function drawFruit(c:CanvasRenderingContext2D,tier:number,x:number,y:number,r:number,angle=0,number=false){
 const t=TIERS[tier];c.save();c.translate(x,y);c.rotate(angle);c.scale(r/40,r/40);
 c.fillStyle=t.edge;c.beginPath();c.ellipse(1,4,39,39,0,0,Math.PI*2);c.fill();
 const gradient=c.createRadialGradient(-14,-18,3,8,10,50);gradient.addColorStop(0,t.color);gradient.addColorStop(.65,t.color);gradient.addColorStop(1,t.edge);
 c.fillStyle=gradient;c.strokeStyle=t.edge;c.lineWidth=2.4;c.beginPath();c.arc(0,0,38,0,Math.PI*2);c.fill();c.stroke();
 c.save();c.beginPath();c.arc(0,0,37,0,Math.PI*2);c.clip();
 if(tier===10){c.strokeStyle='#247e52';c.lineWidth=7;for(const px of [-27,-8,13,32]){c.beginPath();c.moveTo(px,-45);c.bezierCurveTo(px-18,-10,px+16,17,px,45);c.stroke();}}
 if(tier===9){c.strokeStyle='#639d4b';c.lineWidth=1.4;for(let px=-50;px<60;px+=13){c.beginPath();c.moveTo(px,-45);c.lineTo(px+50,45);c.stroke();c.beginPath();c.moveTo(px,45);c.lineTo(px+50,-45);c.stroke();}}
 if(tier===8){c.strokeStyle='#c39132';c.lineWidth=1.3;for(let k=-60;k<70;k+=15){c.beginPath();c.moveTo(-42,k);c.lineTo(42,k+60);c.moveTo(-42,k+60);c.lineTo(42,k);c.stroke();}}
 if(tier===1){c.fillStyle='#ffe2a0';for(const [sx,sy]of [[-23,-12],[-11,-25],[16,-21],[27,0],[-25,13],[-15,27],[12,26]]){c.beginPath();c.ellipse(sx,sy,1.5,3,.3,0,Math.PI*2);c.fill();}}
 if(tier===2){c.strokeStyle='#8659be';c.lineWidth=2;for(const [gx,gy]of [[-22,-22],[4,-29],[25,-12],[-26,7],[20,21],[-3,30]]){c.beginPath();c.arc(gx,gy,12,0,Math.PI*2);c.stroke();}}
 if(tier===3){c.fillStyle='#cf781e';for(let k=0;k<15;k++){const a=k*2.4;const d=25+(k%3)*4;c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d,1,0,Math.PI*2);c.fill();}}
 if(tier===7){c.strokeStyle='#d9867b';c.lineWidth=2;c.beginPath();c.moveTo(1,-39);c.bezierCurveTo(-8,-20,9,19,0,40);c.stroke();}
 c.fillStyle='#fff';c.globalAlpha=.27;c.beginPath();c.ellipse(-14,-21,14,6,-.6,0,Math.PI*2);c.fill();c.restore();
 // Leaves are distinct silhouettes, consistent with circular collision geometry.
 c.lineCap='round';c.strokeStyle='#6c6332';c.lineWidth=3;c.beginPath();c.moveTo(0,-35);c.quadraticCurveTo(-2,-43,4,-47);c.stroke();
 c.fillStyle=tier===8?'#52955a':'#6caa50';c.strokeStyle='#3d7749';c.lineWidth=1.5;
 c.beginPath();c.moveTo(0,-36);c.quadraticCurveTo(4,-52,22,-43);c.quadraticCurveTo(15,-31,0,-36);c.fill();c.stroke();
 if(tier===1||tier===8){c.beginPath();c.moveTo(-18,-31);c.lineTo(-14,-45);c.lineTo(-2,-35);c.lineTo(7,-48);c.lineTo(15,-31);c.fill();c.stroke();}
 c.fillStyle='#522e38';for(const ex of [-12,12]){c.beginPath();c.ellipse(ex,2,tier===4?2.6:3.1,4.4,0,0,Math.PI*2);c.fill();c.fillStyle='#fff7e5';c.beginPath();c.arc(ex-.7,.3,1,0,Math.PI*2);c.fill();c.fillStyle='#522e38';}
 c.fillStyle='rgba(245,100,105,.5)';for(const ex of [-23,23]){c.beginPath();c.ellipse(ex,11,6,3,0,0,Math.PI*2);c.fill();}
 c.strokeStyle='#522e38';c.lineWidth=2.4;c.beginPath();c.moveTo(-6,13);c.quadraticCurveTo(0,20,6,13);c.stroke();
 if(number){c.fillStyle='#fff8de';c.beginPath();c.arc(23,-23,10,0,Math.PI*2);c.fill();c.fillStyle='#41333e';c.font='bold 12px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(tier+1),23,-22);}
 c.restore();
}
