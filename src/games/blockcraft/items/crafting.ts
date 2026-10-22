// Crafting and smelting service: matches 2×2 and 3×3 crafting grids against items/recipes.ts (shaped recipes anywhere in
// the grid and mirrored left-to-right, shapeless recipes in any slots), repairs two worn tools of one kind, and answers
// smelting, fuel and recipe-book queries from items/recipes-smelting.ts.
import {itemDef,type ItemId,type ItemStack} from '../data/items';
import type {CraftingService,Game,RecipeMatch,RecipeView,SmeltResult} from '../engine/contracts';
import {CRAFTING_RECIPES,type CraftingRecipe,type ShapedRecipe,type ShapelessRecipe} from './recipes';
import {FUEL_SECONDS,SMELTING_RECIPES,type SmeltingRecipe} from './recipes-smelting';

type Grid=readonly (ItemStack|null)[];
type Matcher=(grid:Grid,width:number,height:number)=>RecipeMatch|null;

/** Durability bonus of the vanilla repair recipe: 5% of the maximum. */
const REPAIR_BONUS=.05;

function validGrid(grid:Grid,width:number,height:number){
  if(!Array.isArray(grid)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>3||height>3)return false;
  if(grid.length!==width*height)return false;
  for(const cell of grid)if(cell!==null&&(!cell||!itemDef(cell.id)||!(cell.count>=1)))return false;
  return true;
}
function remaindersFor(grid:Grid):(ItemStack|null)[]{
  return grid.map(cell=>{const rest=cell?itemDef(cell.id)?.remainder:undefined;return rest?{id:rest,count:1}:null;});
}
/** Shaped recipe against the occupied box of the grid (top-left at r0,c0), normal or mirrored. */
function shapedFits(recipe:ShapedRecipe,grid:Grid,width:number,r0:number,c0:number,mirror:boolean){
  for(let r=0;r<recipe.height;r++)for(let c=0;c<recipe.width;c++){
    const want=recipe.grid[r*recipe.width+(mirror?recipe.width-1-c:c)],cell=grid[(r0+r)*width+c0+c];
    if(!want){if(cell)return false;}
    else if(!cell||!want.includes(cell.id))return false;
  }
  return true;
}
/** Assigns each occupied cell to a distinct ingredient (backtracking; at most nine of each). */
function shapelessFits(recipe:ShapelessRecipe,ids:readonly ItemId[]){
  const used=new Array<boolean>(recipe.ingredients.length).fill(false);
  const assign=(i:number):boolean=>{
    if(i===ids.length)return true;
    for(let k=0;k<recipe.ingredients.length;k++){
      if(used[k]||!recipe.ingredients[k].includes(ids[i]))continue;
      used[k]=true;if(assign(i+1))return true;used[k]=false;
    }
    return false;
  };
  return assign(0);
}
/** Vanilla "repair item": exactly two damageable items of the same kind combine their durability plus 5%. */
function repair(stacks:readonly ItemStack[]):ItemStack|null{
  if(stacks.length!==2||stacks[0].id!==stacks[1].id)return null;
  const def=itemDef(stacks[0].id),max=def?.durability??0;
  if(!def||max<=0||def.maxStack!==1)return null;
  const left=(s:ItemStack)=>max-Math.min(max,Math.max(0,s.damage??0));
  const damage=Math.max(0,max-(left(stacks[0])+left(stacks[1])+Math.floor(max*REPAIR_BONUS)));
  return damage?{id:def.id,count:1,damage}:{id:def.id,count:1};
}

/** Builds a grid matcher over a recipe list, indexed by shape size and ingredient count. */
export function createMatcher(recipes:readonly CraftingRecipe[]):Matcher{
  const shapedBySize=new Map<number,ShapedRecipe[]>(),shapelessByCount=new Map<number,ShapelessRecipe[]>();
  for(const r of recipes){
    if(r.kind==='shaped'){const k=r.width*4+r.height,l=shapedBySize.get(k)??[];l.push(r);shapedBySize.set(k,l);}
    else{const k=r.ingredients.length,l=shapelessByCount.get(k)??[];l.push(r);shapelessByCount.set(k,l);}
  }
  return(grid,width,height)=>{
    if(!validGrid(grid,width,height))return null;
    let minR=height,maxR=-1,minC=width,maxC=-1;
    const stacks:ItemStack[]=[];
    for(let r=0;r<height;r++)for(let c=0;c<width;c++){
      const cell=grid[r*width+c];if(!cell)continue;
      stacks.push(cell);if(r<minR)minR=r;if(r>maxR)maxR=r;if(c<minC)minC=c;if(c>maxC)maxC=c;
    }
    if(!stacks.length)return null;
    const found=(result:ItemStack):RecipeMatch=>({result:{...result},remainders:remaindersFor(grid)});
    for(const recipe of shapedBySize.get((maxC-minC+1)*4+maxR-minR+1)??[])
      if(shapedFits(recipe,grid,width,minR,minC,false)||shapedFits(recipe,grid,width,minR,minC,true))return found(recipe.result);
    const ids=stacks.map(s=>s.id);
    for(const recipe of shapelessByCount.get(stacks.length)??[])if(shapelessFits(recipe,ids))return found(recipe.result);
    const repaired=repair(stacks);
    return repaired?{result:repaired,remainders:new Array(grid.length).fill(null)}:null;
  };
}
/** Matches a grid against an explicit recipe list (pure; the service uses the vanilla list). */
export function matchRecipes(recipes:readonly CraftingRecipe[],grid:Grid,width:number,height:number):RecipeMatch|null{
  return createMatcher(recipes)(grid,width,height);
}

// ---- Recipe book views -------------------------------------------------------------------------
function craftingView(recipe:CraftingRecipe):RecipeView{
  if(recipe.kind==='shaped')return Object.freeze({kind:'shaped',station:recipe.width<=2&&recipe.height<=2?'inventory':'crafting_table',
    width:recipe.width,height:recipe.height,grid:recipe.grid,result:recipe.result});
  const n=recipe.ingredients.length,width=n<=1?1:n<=4?2:3,height=Math.ceil(n/width);
  const grid=Array.from({length:width*height},(_,i)=>recipe.ingredients[i]??null);
  return Object.freeze({kind:'shapeless',station:n<=4?'inventory':'crafting_table',width,height,grid:Object.freeze(grid),result:recipe.result});
}
const smeltingView=(recipe:SmeltingRecipe):RecipeView=>
  Object.freeze({kind:'smelting',station:'furnace',width:1,height:1,grid:Object.freeze([recipe.input]),result:recipe.result});

const MATCH=createMatcher(CRAFTING_RECIPES);
const SMELT_BY_INPUT=new Map<ItemId,SmeltingRecipe>();
for(const recipe of SMELTING_RECIPES)for(const id of recipe.input)if(!SMELT_BY_INPUT.has(id))SMELT_BY_INPUT.set(id,recipe);
const ALL_VIEWS:readonly RecipeView[]=Object.freeze([...CRAFTING_RECIPES.map(craftingView),...SMELTING_RECIPES.map(smeltingView)]);
const VIEWS_BY_RESULT=new Map<ItemId,readonly RecipeView[]>();
for(const view of ALL_VIEWS)VIEWS_BY_RESULT.set(view.result.id,[...(VIEWS_BY_RESULT.get(view.result.id)??[]),view]);
for(const [id,views] of VIEWS_BY_RESULT)VIEWS_BY_RESULT.set(id,Object.freeze(views));
const NONE:readonly RecipeView[]=Object.freeze([]);

export function createCrafting(_game:Game):CraftingService{
  return{
    match:(grid,width,height)=>MATCH(grid,width,height),
    smelt(input):SmeltResult|null{
      const recipe=SMELT_BY_INPUT.get(input);
      return recipe?{result:{...recipe.result},xp:recipe.xp}:null;
    },
    fuelSeconds:id=>FUEL_SECONDS.get(id)??0,
    recipesFor:id=>VIEWS_BY_RESULT.get(id)??NONE,
    allRecipes:()=>ALL_VIEWS
  };
}
