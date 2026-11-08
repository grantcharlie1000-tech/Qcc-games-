import {createAppMenu} from '../../apps/menu';
export type {MenuItem} from '../../apps/menu';

const menu=createAppMenu({prefix:'social',sheetId:'social-post-menu'});
export const openMenu=menu.open;
export const closeMenus=menu.close;
