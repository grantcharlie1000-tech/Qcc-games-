import {appSheet,showSheet} from '../../apps/sheets';

export const SHORTCUTS:[string,string][]=[['j / k','Next / previous post'],['o or Enter','Open the post'],['n','New post'],['l','Like or unlike'],['r','Reply'],['/','Search'],['?','This help'],['Esc','Close a sheet']];
export function shortcutRows():string{return SHORTCUTS.map(([key,what])=>`<tr><th scope="row">${key.split(' ').map(part=>part==='or'||part==='/'?part:`<kbd class="ui-kbd">${part}</kbd>`).join(' ')}</th><td>${what}</td></tr>`).join('');}
export function openShortcuts(trigger?:Element|null):void {
 const {dialog,body}=appSheet('social-shortcuts','Keyboard shortcuts',{closeLabel:'Close shortcuts'});
 body.innerHTML=`<table class="social-shortcuts"><tbody>${shortcutRows()}</tbody></table><p class="muted">Shortcuts work when you're not typing, and can be switched off in Settings.</p>`;
 showSheet(dialog,trigger);
}
