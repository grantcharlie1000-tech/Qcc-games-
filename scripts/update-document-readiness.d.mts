import type {Page} from 'playwright';
export const GAME_DOCUMENT_READINESS_TIMEOUT:30000;
export function reloadGameDocument(page:Page):Promise<{beforeTimeOrigin:number;afterTimeOrigin:number}>;
