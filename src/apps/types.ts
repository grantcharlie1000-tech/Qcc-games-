import type {AccountsClient} from '../accounts/client';

/** What the shell hands every lazy-loaded app view (QCC Social, QCC Chat). */
export interface AppDeps {
  accounts:AccountsClient;
  openAccounts:()=>void;
  reducedMotion:()=>boolean;
  openMenu:()=>void;
}

/** The contract the shell drives: route changes, Study pausing and teardown. */
export interface AppView {
  navigate(hash:string):void;
  pause():void;
  resume():void;
  dispose():void;
}
