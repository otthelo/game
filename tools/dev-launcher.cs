using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;

class DevLauncher
{
    static bool IsPortOpen(string host, int port)
    {
        try
        {
            using (var client = new TcpClient())
            {
                var result = client.BeginConnect(host, port, null, null);
                bool success = result.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(250));
                if (!success) return false;
                client.EndConnect(result);
                return true;
            }
        }
        catch
        {
            return false;
        }
    }

    static void StartPowershellWindow(string title, string command)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-NoExit -NoProfile -Command \"" + command + "\"",
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Normal
        };
        Process.Start(psi);
    }

    static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        string serverDir = Path.Combine(root, "server");
        string clientDir = Path.Combine(root, "client");

        Console.WriteLine("=== Izud Pixel Realm - Developer Launcher ===");

        if (!IsPortOpen("127.0.0.1", 2567))
        {
            Console.WriteLine("Starting Server (DEV_MODE=true)...");
            StartPowershellWindow(
                "Server (DEV)",
                "$Host.UI.RawUI.WindowTitle = 'Izud Server (DEV)'; $env:DEV_MODE='true'; Set-Location '" + serverDir + "'; npm run dev"
            );
        }
        else
        {
            Console.WriteLine("Server already running on port 2567.");
        }

        if (!IsPortOpen("127.0.0.1", 5173))
        {
            Console.WriteLine("Starting Client (VITE_DEV_MODE=true)...");
            StartPowershellWindow(
                "Client (DEV)",
                "$Host.UI.RawUI.WindowTitle = 'Izud Client (DEV)'; $env:VITE_DEV_MODE='true'; Set-Location '" + clientDir + "'; npm run dev"
            );
        }
        else
        {
            Console.WriteLine("Client already running on port 5173.");
        }

        Console.WriteLine("Waiting for Server (2567) & Client (5173)...");
        for (int i = 0; i < 60; i++)
        {
            if (IsPortOpen("127.0.0.1", 2567) && IsPortOpen("127.0.0.1", 5173))
            {
                break;
            }
            Thread.Sleep(500);
        }

        string url = "http://localhost:5173/?dev=1";
        Console.WriteLine("Opening " + url);
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }
}
