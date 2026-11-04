import type {AccountsClient} from '../accounts/client';
import type {AppsBadgeSubscribe} from './launcher';

/** What the shell hands every lazy-loaded app view (QCC Social, QCC Chat). */
export interface AppDeps {
  accounts:AccountsClient;
  openAccounts:()=>void;
  reducedMotion:()=>boolean;
  openMenu:()=>void;
  /** Opens the Apps launcher sheet; the trigger sets where the sheet grows from. */
  openApps:(trigger?:Element|null)=>void;
  /** The shell launcher's unread badge, for the island's own Apps tab (DESIGN 3.6). */
  appsBadge:AppsBadgeSubscribe;
}

/** The contract the shell drives: route changes, Study pausing and teardown. */
export interface AppView {
  navigate(hash:string):void;
  pause():void;
  resume():void;
  dispose():void;
}
