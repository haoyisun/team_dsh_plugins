using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class Program
{
    private const uint CreateNoWindow = 0x08000000;
    private const uint CreateSuspended = 0x00000004;
    private const uint StartfUseStdHandles = 0x00000100;
    private const uint JobObjectLimitKillOnJobClose = 0x00002000;
    private const uint WaitObject0 = 0x00000000;
    private const uint WaitTimeout = 0x00000102;
    private const int JobObjectExtendedLimitInformation = 9;

    public static int Main(string[] args)
    {
        int separator = Array.IndexOf(args, "--");
        int parentPid;
        if (
            args.Length < 4
            || args[0] != "--parent-pid"
            || !int.TryParse(args[1], out parentPid)
            || separator != 2
            || separator + 1 >= args.Length
        )
        {
            Console.Error.WriteLine(
                "usage: dsh-supervisor --parent-pid <pid> -- <executable> [args...]"
            );
            return 64;
        }

        string executable = args[separator + 1];
        var command = new List<string>();
        command.Add(executable);
        for (int index = separator + 2; index < args.Length; index++)
        {
            command.Add(args[index]);
        }

        try
        {
            return RunManaged(parentPid, executable, BuildCommandLine(command));
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("dsh-supervisor: " + error.Message);
            return 70;
        }
    }

    private static int RunManaged(
        int parentPid,
        string executable,
        string commandLine
    )
    {
        using (Process owner = Process.GetProcessById(parentPid))
        {
            IntPtr job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero)
            {
                throw LastWin32Error("CreateJobObject");
            }

            PROCESS_INFORMATION process = new PROCESS_INFORMATION();
            bool assignedToJob = false;
            try
            {
                ConfigureKillOnClose(job);
                STARTUPINFO startup = new STARTUPINFO();
                startup.cb = Marshal.SizeOf(typeof(STARTUPINFO));
                startup.dwFlags = StartfUseStdHandles;
                startup.hStdInput = GetStdHandle(-10);
                startup.hStdOutput = GetStdHandle(-11);
                startup.hStdError = GetStdHandle(-12);

                bool created = CreateProcess(
                    executable,
                    new StringBuilder(commandLine),
                    IntPtr.Zero,
                    IntPtr.Zero,
                    true,
                    CreateSuspended | CreateNoWindow,
                    IntPtr.Zero,
                    Environment.CurrentDirectory,
                    ref startup,
                    out process
                );
                if (!created)
                {
                    throw LastWin32Error("CreateProcess");
                }
                if (!AssignProcessToJobObject(job, process.hProcess))
                {
                    throw LastWin32Error("AssignProcessToJobObject");
                }
                assignedToJob = true;
                if (ResumeThread(process.hThread) == uint.MaxValue)
                {
                    throw LastWin32Error("ResumeThread");
                }

                while (true)
                {
                    uint result = WaitForSingleObject(process.hProcess, 250);
                    if (result == WaitObject0)
                    {
                        uint exitCode;
                        if (!GetExitCodeProcess(process.hProcess, out exitCode))
                        {
                            throw LastWin32Error("GetExitCodeProcess");
                        }
                        return unchecked((int)exitCode);
                    }
                    if (result != WaitTimeout)
                    {
                        throw LastWin32Error("WaitForSingleObject");
                    }

                    try
                    {
                        if (owner.HasExited) return 0;
                    }
                    catch (InvalidOperationException)
                    {
                        return 0;
                    }
                }
            }
            finally
            {
                if (process.hProcess != IntPtr.Zero && !assignedToJob)
                {
                    TerminateProcess(process.hProcess, 70);
                    WaitForSingleObject(process.hProcess, 2000);
                }
                if (process.hThread != IntPtr.Zero) CloseHandle(process.hThread);
                if (process.hProcess != IntPtr.Zero) CloseHandle(process.hProcess);
                CloseHandle(job);
            }
        }
    }

    private static void ConfigureKillOnClose(IntPtr job)
    {
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits =
            new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;

        int length = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
        IntPtr pointer = Marshal.AllocHGlobal(length);
        try
        {
            Marshal.StructureToPtr(limits, pointer, false);
            if (!SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                pointer,
                (uint)length
            ))
            {
                throw LastWin32Error("SetInformationJobObject");
            }
        }
        finally
        {
            Marshal.FreeHGlobal(pointer);
        }
    }

    private static string BuildCommandLine(IEnumerable<string> arguments)
    {
        var result = new StringBuilder();
        foreach (string argument in arguments)
        {
            if (result.Length > 0) result.Append(' ');
            result.Append(QuoteArgument(argument));
        }
        return result.ToString();
    }

    private static string QuoteArgument(string argument)
    {
        if (argument.Length > 0 && argument.IndexOfAny(new[] { ' ', '\t', '"' }) < 0)
        {
            return argument;
        }

        var result = new StringBuilder("\"");
        int backslashes = 0;
        foreach (char character in argument)
        {
            if (character == '\\')
            {
                backslashes++;
                continue;
            }
            if (character == '"')
            {
                result.Append('\\', backslashes * 2 + 1);
                result.Append('"');
                backslashes = 0;
                continue;
            }
            result.Append('\\', backslashes);
            backslashes = 0;
            result.Append(character);
        }
        result.Append('\\', backslashes * 2);
        result.Append('"');
        return result.ToString();
    }

    private static Exception LastWin32Error(string operation)
    {
        return new System.ComponentModel.Win32Exception(
            Marshal.GetLastWin32Error(),
            operation
        );
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct STARTUPINFO
    {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public int dwX;
        public int dwY;
        public int dwXSize;
        public int dwYSize;
        public int dwXCountChars;
        public int dwYCountChars;
        public int dwFillAttribute;
        public uint dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public int dwProcessId;
        public int dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(
        IntPtr jobAttributes,
        string name
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        IntPtr information,
        uint informationLength
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(
        IntPtr job,
        IntPtr process
    );

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref STARTUPINFO startupInfo,
        out PROCESS_INFORMATION processInformation
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(
        IntPtr handle,
        uint milliseconds
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(
        IntPtr process,
        out uint exitCode
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(
        IntPtr process,
        uint exitCode
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetStdHandle(int standardHandle);
}
