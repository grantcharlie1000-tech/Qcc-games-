/** 02 · A Bell Above the Rain: the bell tower's measurements, shared by the
 * route (route-02.ts) and the set that draws it (set-bell-tower.ts), so every
 * landing and every drawn thing that carries it come from the same numbers.
 *
 * The tower is seen in section, cut in front of the courier. It is exactly as
 * wide as the screen: the cut side walls are its left and right edges. One
 * open well runs up the middle from the flooded pit to the belfry floor; every
 * floor is trimmed round it, and nothing that stands still crosses it. */

/** The cut side walls: outer face, inner face. The courier is kept between the inner faces. */
export const OUT_W=0,WEST=40,EAST=600,OUT_E=640;
/** The well: open from the pit to the belfry floor. */
export const WELL0=276,WELL1=364;
/** Storey height, floor line to floor line. */
export const RISE=192;
/** The top of the ground floor's flags; storey k's floor line is GROUND-RISE*k. */
export const GROUND=3376;
export const floorLine=(k:number)=>GROUND-RISE*k;
/** The flooded pit's water, under the ground floor. A miss in the well ends here. */
export const WATER=GROUND+80;
/** The belfry floor (storey 12) caps the well, all but the hoist's trap. The gallery door is on storey 15's floor. */
export const BELFRY=floorLine(12),GALLERY=floorLine(15);
/** Every storey, from the foot up, with the floor line it stands on. Each is one room. */
export const STOREYS:readonly (readonly [floor:number,name:string])[]=[
 'The tower foot','The ringing floor','The rotten floor','The masons’ scaffold','The muniment room','The weight shaft',
 'The fallen vault','The clock room','Behind the dial','The old stair','The corbel table','The bell hoist',
 'Under the bells','Over the bells','The tie bar','The gallery door',
].map((name,k)=>[floorLine(k),name] as const);
/** The weight chase against the west wall, from the weight shaft (storey 5) up through the vault floor to the clock room (storey 7); the clock's two weights ride it. */
export const CHASE0=WEST,CHASE1=152;
/** The clock's barrel and sheaves, in the clock room, which the weights' cables run up to. */
export const BARREL={x:96,y:floorLine(7)-150};
/** The dial: an iron wheel let into the far wall behind the clock, its centre and the radius of its rim. */
export const DIAL={x:512,y:floorLine(8)-84,r:76};
/** The bell hoist: the windlass on the belfry floor, the jib over the trap, the rope down to the pallet. */
export const JIB={x:WELL0-8,y:BELFRY-150,reach:WELL1-WELL0+16};
/** The door at the foot you came in by, through the west wall. */
export const FOOT_DOOR={x:OUT_W,y:GROUND-64,w:WEST,h:64};

