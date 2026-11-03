using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

namespace VrcNativeHost
{
    class Program
    {
        static Process serverProc = null;

        static void Main(string[] args)
        {
            AppDomain.CurrentDomain.ProcessExit += (s, e) => StopServer();

            try
            {
                using (Stream stdin = Console.OpenStandardInput())
                using (Stream stdout = Console.OpenStandardOutput())
                {
                    while (true)
                    {
                        byte[] lenBytes = new byte[4];
                        int read = stdin.Read(lenBytes, 0, 4);
                        if (read < 4)
                        {
                            // Chromeが切断した（終了）
                            break;
                        }

                        int length = BitConverter.ToInt32(lenBytes, 0);
                        if (length <= 0 || length > 1024 * 1024) break;

                        byte[] buffer = new byte[length];
                        int totalRead = 0;
                        while (totalRead < length)
                        {
                            int r = stdin.Read(buffer, totalRead, length - totalRead);
                            if (r <= 0) break;
                            totalRead += r;
                        }

                        string message = Encoding.UTF8.GetString(buffer, 0, totalRead);

                        // メッセージ処理
                        bool ready = EnsureServer();
                        string response = ready ? "{\"status\":\"ready\",\"port\":8000}" : "{\"status\":\"error\"}";

                        byte[] respBytes = Encoding.UTF8.GetBytes(response);
                        byte[] respLen = BitConverter.GetBytes(respBytes.Length);

                        stdout.Write(respLen, 0, 4);
                        stdout.Write(respBytes, 0, respBytes.Length);
                        stdout.Flush();
                    }
                }
            }
            catch (Exception)
            {
            }
            finally
            {
                StopServer();
            }
        }

        static bool IsServerAlive()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:8000/health");
                req.Timeout = 1000;
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        static bool EnsureServer()
        {
            if (IsServerAlive()) return true;

            string backendDir = AppDomain.CurrentDomain.BaseDirectory;
            string mainPy = Path.Combine(backendDir, "main.py");
            string pythonExe = @"C:\Users\TAIKA\AppData\Local\Programs\Python\Python310\python.exe";

            if (!File.Exists(pythonExe))
            {
                pythonExe = "python.exe";
            }

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = pythonExe;
                psi.Arguments = "main.py";
                psi.WorkingDirectory = backendDir;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;

                serverProc = Process.Start(psi);

                for (int i = 0; i < 20; i++)
                {
                    Thread.Sleep(500);
                    if (IsServerAlive()) return true;
                }
            }
            catch
            {
            }

            return false;
        }

        static void StopServer()
        {
            try
            {
                if (serverProc != null && !serverProc.HasExited)
                {
                    serverProc.Kill();
                }
            }
            catch { }

            // 念のためport 8000を解放
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "cmd.exe";
                psi.Arguments = "/c for /f \"tokens=5\" %a in ('netstat -aon ^| findstr :8000') do taskkill /F /PID %a 2>nul & taskkill /F /IM cloudflared.exe 2>nul";
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
            catch { }
        }
    }
}
