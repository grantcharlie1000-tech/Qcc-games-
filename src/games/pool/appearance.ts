// One palette keeps the scoreboard balls and the balls on the cloth consistent.
const colors=['#faf6e7','#efbc25','#2781d1','#e7484d','#9868ce','#ed802f','#33a481','#a64445','#162330'];
export const ballColor=(id:number)=>colors[id===0?0:id===8?8:id>8?id-8:id];
