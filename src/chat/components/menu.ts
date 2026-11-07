import {createAppMenu} from '../../apps/menu';
export type {MenuItem} from '../../apps/menu';

const menu=createAppMenu({prefix:'chat',sheetId:'chat-message-menu',deferAction:true,focusSheet:true,captureScroll:true});
export const openChatMenu=menu.open;
export const closeChatMenus=menu.close;
