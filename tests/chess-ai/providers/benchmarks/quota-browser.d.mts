import type {Browser,BrowserServer,LaunchOptions,Page} from '@playwright/test';
export interface NativeAccounting {totalUserTime100ns:string;totalKernelTime100ns:string;totalProcesses:number;activeProcesses:number;totalPageFaultCount:number;totalTerminatedProcesses:number}
export interface NativeMonotonic {beforeQueryTicks:string;afterQueryTicks:string;frequency:string}
export interface QuotaAck {action:string;rootProcessId:number;controllerProcessId:number;jobName:string;requestedCpuRatePer10000:number;cpuRatePer10000:number;cpuControlFlags:number;logicalCpuCount:number;controllerLogicalCpuCount:number;nominalLogicalProcessorEquivalents:number;processIds:number[];verifiedProcessId?:number;verifiedInJob?:boolean;accounting:NativeAccounting;monotonic:NativeMonotonic}
export interface QuotaCleanup {restored:boolean;browserExited:boolean;helperExited:boolean;errors:string[]}
export interface HostSnapshot {at:number;times:import('node:os').CpuInfo['times'][]}
export interface HostInterval {wallMs:number;busyFraction:number|null;logicalCpuCount:number}
export interface ArithmeticSample {ms:number;checksum:number;iterations:number}
export interface ArithmeticBatch {type:'batch';samples:ArithmeticSample[];summedLoopWallMs:number;batchWallMs:number;totalIterations:number}
export interface AccountingInterval<T> {workerProcessId:number;expectedCpuRatePer10000:number;before:QuotaAck;after:QuotaAck;value:T}
export interface OwnedQuotaBrowser {
  browser:Browser;server:BrowserServer;jobName:string;rootProcessId:number;ready:QuotaAck;controllerSourceSha256:string;javascriptHarnessSourceSha256:string;
  setQuota(rate:number):Promise<QuotaAck>;status():Promise<QuotaAck>;verifyProcess(processId:number):Promise<QuotaAck>;
  accountingInterval<T>(work:()=>Promise<T>,options:{workerProcessId:number;expectedCpuRatePer10000:416|10000}):Promise<AccountingInterval<T>>;
  close():Promise<QuotaCleanup>;
}
export interface CapacityIdentity {method:string;marker:string;event:{name:string;cat:string;ph:string;pid:number;tid:number;ts:number;marker:string};eventCount:number;dataLossOccurred:boolean|null;nativeMembership:QuotaAck;workerKey:string;workerSourceSha256:string}
export interface CapacityLeg {
  protocol:'capacity-v2';workerProcessId:number;workerThreadId:number;workerMarker:string;workerSourceSha256:string;samples:ArithmeticSample[];medianMs:number;summedLoopWallMs:number;batchWallMs:number;totalIterations:number;
  jobUserDelta100ns:string;jobKernelDelta100ns:string;jobCpuSeconds:number;jobCpuPerLoopWall:number;nativeMinimumWallMs:number;nativeMaximumWallMs:number;nativeQueryBeforeSpanMs:number;nativeQueryAfterSpanMs:number;jobCpuPerNativeWallRange:[number,number];
  accountingBefore:QuotaAck;accountingAfter:QuotaAck;hostLoad:HostInterval;
  validation:{queriedHardCapMatches:true;queriedCpuRatePer10000:416|10000;queriedCpuControlFlags:5;workerMembershipProven:true;positiveFiniteAccounting:true;equalSuccessfulArithmetic:true;dutyTolerance:number|null;withinDutyTolerance:boolean|null};interpretation:string;
}
export interface CapacityProbe {protocol:'capacity-v2';identity:CapacityIdentity;warmup:ArithmeticBatch&{workerCreationAndWarmupWallMs:number;excludedFromAccounting:true};measure(options?:{expectedCpuRatePer10000?:416|10000}):Promise<CapacityLeg>;close():Promise<void>}
export interface CapacityDiagnosticError extends Error {capacityDiagnostic?:unknown}
export function median(values:number[]):number;
export function hostSnapshot():HostSnapshot;
export function hostInterval(before:HostSnapshot,after:HostSnapshot):HostInterval;
export function launchQuotaBrowser(options?:LaunchOptions):Promise<OwnedQuotaBrowser>;
export function createCapacityProbe(owned:OwnedQuotaBrowser,page:Page,options?:{workerPath?:string;startupTimeoutMs?:number;identityTimeoutMs?:number;batchTimeoutMs?:number}):Promise<CapacityProbe>;
/** Legacy descriptive wall-ratio arithmetic probe, separate from capacity-v2. */
export function arithmeticProbe(page:Page,options?:{repetitions?:number;iterations?:number;workerPath?:string}):Promise<{samples:ArithmeticSample[];medianMs:number;hostLoad:HostInterval}>;
