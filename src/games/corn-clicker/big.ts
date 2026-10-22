/**
 * Immutable non-negative-friendly big number: value = m × 10^e with 1 ≤ |m| < 10.
 * Doubles overflow at 1.8e308; Corn Clicker's exponents stay finite far beyond that.
 * Serialized as a compact string such as "1.2345678901234e412".
 */
export class Big {
  private constructor(readonly m:number,readonly e:number){}
  static readonly ZERO=new Big(0,0);
  static readonly ONE=new Big(1,0);

  static fromME(m:number,e:number):Big {
    if(!Number.isFinite(m)||m===0||!Number.isFinite(e))return Big.ZERO;
    const shift=Math.floor(Math.log10(Math.abs(m)));
    let mm=m/10**shift,ee=e+shift;
    // Floating error can leave 9.9999999 or 10.0000001 at the boundary.
    if(Math.abs(mm)>=10){mm/=10;ee++;}else if(Math.abs(mm)<1){mm*=10;ee--;}
    return new Big(mm,ee);
  }
  static of(value:number|Big|string):Big {
    if(value instanceof Big)return value;
    if(typeof value==='string')return Big.parse(value)??Big.ZERO;
    if(!Number.isFinite(value))return value===Infinity?Big.fromME(1,308):Big.ZERO;
    return Big.fromME(value,0);
  }
  static fromLog10(log:number):Big {
    if(!Number.isFinite(log))return log>0?Big.fromME(1,1e15):Big.ZERO;
    const e=Math.floor(log);return Big.fromME(10**(log-e),e);
  }
  /** Parses a stored value; returns undefined for anything malformed, negative or non-finite. */
  static parse(raw:unknown):Big|undefined {
    if(typeof raw==='number')return Number.isFinite(raw)&&raw>=0?Big.of(raw):undefined;
    if(typeof raw!=='string'||raw.length>40)return undefined;
    const match=/^(\d+(?:\.\d+)?)(?:e([+-]?\d+))?$/i.exec(raw.trim());
    if(!match)return undefined;
    const m=Number(match[1]),e=match[2]?Number(match[2]):0;
    if(!Number.isFinite(m)||!Number.isFinite(e)||Math.abs(e)>9e15)return undefined;
    return Big.fromME(m,e);
  }
  static max(a:Big,b:Big):Big {return a.gte(b)?a:b;}
  static min(a:Big,b:Big):Big {return a.lte(b)?a:b;}
  static sum(values:Iterable<Big>):Big {let total=Big.ZERO;for(const v of values)total=total.add(v);return total;}

  isZero():boolean {return this.m===0;}
  isNegative():boolean {return this.m<0;}
  add(other:Big|number):Big {
    const b=Big.of(other);
    if(b.m===0)return this;if(this.m===0)return b;
    const [big,small]=this.e>=b.e?[this as Big,b]:[b,this as Big];
    const diff=big.e-small.e;
    if(diff>17)return big;
    return Big.fromME(big.m+small.m/10**diff,big.e);
  }
  sub(other:Big|number):Big {const b=Big.of(other);return this.add(new Big(-b.m,b.e));}
  mul(other:Big|number):Big {
    const b=Big.of(other);
    if(b.m===0||this.m===0)return Big.ZERO;
    return Big.fromME(this.m*b.m,this.e+b.e);
  }
  div(other:Big|number):Big {
    const b=Big.of(other);
    if(b.m===0)return Big.ZERO; // Callers never divide by zero intentionally; avoid NaN/Infinity.
    if(this.m===0)return Big.ZERO;
    return Big.fromME(this.m/b.m,this.e-b.e);
  }
  /** this^power for a non-negative base. */
  pow(power:number):Big {
    if(this.m===0)return power===0?Big.ONE:Big.ZERO;
    return Big.fromLog10(this.log10()*power);
  }
  log10():number {return this.m<=0?-Infinity:Math.log10(this.m)+this.e;}
  cmp(other:Big|number):number {
    const b=Big.of(other);
    if(this.m===0||b.m===0||Math.sign(this.m)!==Math.sign(b.m))return Math.sign(this.m-b.m);
    const sign=Math.sign(this.m);
    if(this.e!==b.e)return this.e>b.e?sign:-sign;
    return this.m===b.m?0:this.m>b.m?1:-1;
  }
  gt(o:Big|number):boolean {return this.cmp(o)>0;}
  gte(o:Big|number):boolean {return this.cmp(o)>=0;}
  lt(o:Big|number):boolean {return this.cmp(o)<0;}
  lte(o:Big|number):boolean {return this.cmp(o)<=0;}
  eq(o:Big|number):boolean {return this.cmp(o)===0;}
  floor():Big {
    if(this.e>=15)return this;
    if(this.e<0)return this.m<0?Big.of(-1):Big.ZERO;
    return Big.of(Math.floor(this.toNumber()));
  }
  /** Never below zero: balances use this after subtraction. */
  clampZero():Big {return this.m<0?Big.ZERO:this;}
  toNumber():number {
    if(this.e>308)return this.m>0?Infinity:-Infinity;
    if(this.e<-324)return 0;
    const v=this.m*10**this.e;
    // Undo mantissa rounding noise for whole numbers (123456 rather than 123456.00000000001).
    if(this.e>=0&&this.e<16){const r=Math.round(v);if(Math.abs(v-r)<=Math.abs(v)*1e-13)return r;}
    return v;
  }
  toJSON():string {return this.toString();}
  toString():string {
    if(this.m===0)return '0';
    if(this.e<15&&this.e>=0&&Number.isInteger(Math.round(this.toNumber()*1e3)/1e3))return String(Math.round(this.toNumber()*1e3)/1e3);
    return `${Number(this.m.toPrecision(15))}e${this.e}`;
  }
}

const SHORT=['','K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','Dc','UDc','DDc','TDc','QaDc','QiDc','SxDc','SpDc','OcDc','NoDc','Vg'];
const LONG=['','thousand','million','billion','trillion','quadrillion','quintillion','sextillion','septillion','octillion','nonillion','decillion','undecillion','duodecillion','tredecillion','quattuordecillion','quindecillion','sexdecillion','septendecillion','octodecillion','novemdecillion','vigintillion'];
export type NumberStyle='short'|'long'|'scientific';

/** Human formatting for any magnitude. Small numbers keep useful decimals. */
export function format(value:Big|number,style:NumberStyle='short',decimals=false):string {
  const b=Big.of(value);
  if(b.isZero())return '0';
  if(b.isNegative())return '-'+format(Big.fromME(-b.m,b.e),style,decimals);
  if(b.e<6){
    const n=b.toNumber();
    if(n<1000&&decimals&&!Number.isInteger(Math.round(n*10)/10))return n<10?n.toFixed(n<1?2:1):n.toFixed(1);
    return Math.floor(n+1e-9).toLocaleString('en-GB');
  }
  const group=Math.floor(b.e/3);
  if(style==='scientific'||group>=SHORT.length){
    return `${b.m.toFixed(3)}e${b.e}`;
  }
  const scaled=b.m*10**(b.e-group*3);
  const text=scaled>=100?scaled.toFixed(1):scaled.toFixed(scaled>=10?2:3);
  return style==='long'?`${text} ${LONG[group]}`:`${text} ${SHORT[group]}`;
}
