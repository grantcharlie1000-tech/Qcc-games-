// Benchmark controller. Hold one job handle until stdin closes; never reopen jobs.
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Management;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

public static class BrowserCpuQuota {
  [StructLayout(LayoutKind.Sequential)] struct CpuLimit { public uint Flags; public uint Rate; }
  [StructLayout(LayoutKind.Sequential)] struct Accounting {
    public long TotalUserTime,TotalKernelTime,ThisPeriodTotalUserTime,ThisPeriodTotalKernelTime;
    public uint TotalPageFaultCount,TotalProcesses,ActiveProcesses,TotalTerminatedProcesses;
  }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref CpuLimit data,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int kind,IntPtr data,uint size,out uint returned);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int id);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint GetActiveProcessorCount(ushort group);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static void Check(bool ok,string operation) { if(!ok)throw new Win32Exception(Marshal.GetLastWin32Error(),operation); }
  static void SetRate(IntPtr job,uint rate) {
    if(rate<1 || rate>10000)throw new Exception("CPU rate must be 1..10000");
    CpuLimit limit=new CpuLimit{Flags=5u,Rate=rate};
    Check(SetInformationJobObject(job,15,ref limit,8),"SetInformationJobObject CPU quota");
  }
  static T Query<T>(IntPtr job,int kind) where T:struct {
    uint size=(uint)Marshal.SizeOf(typeof(T));IntPtr buffer=Marshal.AllocHGlobal((int)size);
    try {
      uint returned;Check(QueryInformationJobObject(job,kind,buffer,size,out returned),"QueryInformationJobObject class "+kind);
      if(returned!=size)throw new Exception("Unexpected job information size for class "+kind);
      return (T)Marshal.PtrToStructure(buffer,typeof(T));
    } finally {Marshal.FreeHGlobal(buffer);}
  }
  static bool ProcessInJob(IntPtr job,int processId) {
    if(processId<=0)throw new Exception("Invalid process identity");
    IntPtr process=OpenProcess(0x1000,false,processId);
    try {
      if(process==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error(),"Open traced Worker host for query only");
      bool inside;Check(IsProcessInJob(process,job,out inside),"Verify traced Worker host job membership");return inside;
    } finally {if(process!=IntPtr.Zero)CloseHandle(process);}
  }
  static string ProcessIds(IntPtr job) {
    IntPtr buffer=Marshal.AllocHGlobal(65536);
    try {
      uint returned;Check(QueryInformationJobObject(job,3,buffer,65536,out returned),"QueryInformationJobObject process list");
      int count=Marshal.ReadInt32(buffer,4);
      string[] ids=new string[count];
      for(int i=0;i<count;i++)ids[i]=Marshal.ReadIntPtr(buffer,8+i*IntPtr.Size).ToInt64().ToString();
      return "["+String.Join(",",ids)+"]";
    } finally {Marshal.FreeHGlobal(buffer);}
  }
  static void Ack(IntPtr job,string action,int root,string name,uint requestedRate,int verifiedProcessId=0) {
    long queryBefore=Stopwatch.GetTimestamp();
    Accounting accounting=Query<Accounting>(job,1);
    CpuLimit limit=Query<CpuLimit>(job,15);
    string ids=ProcessIds(job);
    bool verified=verifiedProcessId>0 && ProcessInJob(job,verifiedProcessId);
    uint logicalCount=GetActiveProcessorCount(0xffff);
    if(logicalCount==0)throw new Win32Exception(Marshal.GetLastWin32Error(),"GetActiveProcessorCount");
    long queryAfter=Stopwatch.GetTimestamp();
    string membership=verifiedProcessId>0?",\"verifiedProcessId\":"+verifiedProcessId+",\"verifiedInJob\":"+(verified?"true":"false"):"";
    Console.WriteLine("{\"action\":\""+action+"\",\"rootProcessId\":"+root+",\"controllerProcessId\":"+Process.GetCurrentProcess().Id+",\"jobName\":\""+name+"\",\"requestedCpuRatePer10000\":"+requestedRate+",\"cpuRatePer10000\":"+limit.Rate+",\"cpuControlFlags\":"+limit.Flags+",\"logicalCpuCount\":"+logicalCount+",\"controllerLogicalCpuCount\":"+Environment.ProcessorCount+",\"nominalLogicalProcessorEquivalents\":"+((double)logicalCount*limit.Rate/10000).ToString("R",CultureInfo.InvariantCulture)+",\"processIds\":"+ids+membership+",\"accounting\":{\"totalUserTime100ns\":\""+accounting.TotalUserTime+"\",\"totalKernelTime100ns\":\""+accounting.TotalKernelTime+"\",\"totalProcesses\":"+accounting.TotalProcesses+",\"activeProcesses\":"+accounting.ActiveProcesses+",\"totalPageFaultCount\":"+accounting.TotalPageFaultCount+",\"totalTerminatedProcesses\":"+accounting.TotalTerminatedProcesses+"},\"monotonic\":{\"beforeQueryTicks\":\""+queryBefore+"\",\"afterQueryTicks\":\""+queryAfter+"\",\"frequency\":\""+Stopwatch.Frequency+"\"}}");
    Console.Out.Flush();
  }
  public static int Main(string[] args) {
    IntPtr job=IntPtr.Zero;
    try {
      if(args.Length!=2)throw new Exception("Expected owned browser PID and unique job name");
      int root=Int32.Parse(args[0]);string name=args[1];
      if(!Regex.IsMatch(name,"^qcc-chess-[a-z0-9-]+$"))throw new Exception("Invalid benchmark job name");
      string executable=Process.GetProcessById(root).ProcessName;
      if(executable!="chrome" && executable!="msedge")throw new Exception("Target is not a browser");
      string command;
      using(var target=new ManagementObject("Win32_Process.Handle='"+root+"'")){target.Get();command=(string)target["CommandLine"];}
      if(command==null || !Regex.IsMatch(command,"playwright.*profile") || !command.Contains("remote-debugging-pipe"))throw new Exception("Target is not the owned Playwright browser");
      job=CreateJobObject(IntPtr.Zero,name);
      if(job==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error());
      if(Marshal.GetLastWin32Error()==183) {
        // An existing job belongs to another controller. Do not change its cap.
        CloseHandle(job);job=IntPtr.Zero;
        throw new Exception("Job already exists; refuse to reuse another controller");
      }
      SetRate(job,10000);
      IntPtr process=OpenProcess(0x1101,false,root);
      try {
        if(process==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error());
        Check(AssignProcessToJobObject(job,process),"Assign owned browser to new job");
      } finally {if(process!=IntPtr.Zero)CloseHandle(process);}
      uint rate=10000;Ack(job,"ready",root,name,rate);
      string line;
      while((line=Console.ReadLine())!=null) {
        if(line=="close") {SetRate(job,10000);Ack(job,"close",root,name,10000);return 0;}
        if(line=="status") {Ack(job,"status",root,name,rate);continue;}
        if(line.StartsWith("verify ")) {Ack(job,"verify",root,name,rate,Int32.Parse(line.Substring(7)));continue;}
        if(!line.StartsWith("set "))throw new Exception("Unknown quota command");
        rate=UInt32.Parse(line.Substring(4));SetRate(job,rate);Ack(job,"set",root,name,rate);
      }
      return 0;
    } catch(Exception error) {Console.Error.WriteLine(error.ToString());return 1;}
    finally {
      if(job!=IntPtr.Zero) {
        try {SetRate(job,10000);}catch(Exception error){Console.Error.WriteLine("Restore failed: "+error);}
        CloseHandle(job);
      }
    }
  }
}
