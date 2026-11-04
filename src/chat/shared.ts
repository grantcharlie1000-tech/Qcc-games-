export const MESSAGE_MAX_CHARS=1000;
export const RETENTION_MODES=['viewed','week'] as const;
export type Retention=typeof RETENTION_MODES[number];
export const EXPIRY={viewedHours:24,weekDays:7,unviewedDays:30,savedDays:90} as const;
export const POLL_MS={conversation:4000,list:15000,badge:60000} as const;
export interface Friend {username:string;displayName:string;avatar:string|null}
export interface LastMessage {kind:'text'|'snap'|'system';mine:boolean;viewed:boolean;at:string}
export interface ConversationRow {friend:Friend;last:LastMessage|null;unread:number}
export interface RequestRow {friend:Friend;at:string}
export interface ChatList {friends:ConversationRow[];incoming:RequestRow[];outgoing:RequestRow[]}
export interface MessageView {id:string;kind:'text'|'snap'|'system';mine:boolean;body:string|null;snap:{opened:boolean}|null;createdAt:string;viewedAt:string|null;saved:boolean}
export interface ConversationView {friend:Friend;retention:Retention;messages:MessageView[]}
export interface ChatSummary {unread:number;requests:number}
