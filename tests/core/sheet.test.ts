import {expect,test} from 'vitest';
import {sheetOrigin} from '../../src/ui/sheet';

// Boxes are written as left, top, width and height, which is all sheetOrigin reads.
const box=(left:number,top:number,width:number,height:number)=>({left,top,width,height});

test('the origin is the trigger centre measured from the sheet corner',()=>{
  // The 40 px control is centred at (150, 300) on the page. The sheet starts at (8, 100): (142, 200) inside it.
  expect(sheetOrigin(box(130,280,40,40),box(8,100,374,600))).toBe('142px 200px');
});

test('a trigger below the sheet clamps to its bottom edge',()=>{
  // The centre is (320, 820). Inside the sheet that is (312, 720), so y clamps to the 600 px height.
  expect(sheetOrigin(box(300,800,40,40),box(8,100,374,600))).toBe('312px 600px');
});

test('a trigger to the left of the sheet clamps to 0',()=>{
  // The centre is (-80, 300). Inside the sheet that is x = -88, which clamps to 0.
  expect(sheetOrigin(box(-100,280,40,40),box(8,100,374,600))).toBe('0px 200px');
});

test('the values are rounded to whole pixels',()=>{
  // Centre (20.4, 20.6) on a sheet at the page corner rounds to (20, 21).
  expect(sheetOrigin(box(10.4,10.6,20,20),box(0,0,100,100))).toBe('20px 21px');
});
