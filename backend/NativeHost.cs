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
                        if (read < 4) break;

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

                        // 1. サーバー起動確認
                        bool ready = EnsureServer();
                        if (!ready)
                        {
                            SendJson(stdout, "{\"status\":\"error\",\"detail\":\"1080pサーバーの起動に失敗しました。\"}");
                            continue;
                        }

                        // pingまたはensure_serverの場合
                        if (message.Contains("\"ping\"") || message.Contains("\"ensure_server\""))
                        {
                            SendJson(stdout, "{\"status\":\"ready\",\"port\":8000}");
                            continue;
                        }

                        // 2. 変換リクエストの転送処理 (C#から127.0.0.1:8000/api/convertへ直接リクエスト)
                        try
                        {
                            HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:8000/api/convert");
                            req.Method = "POST";
                            req.ContentType = "application/json";
                            req.Timeout = 60000;

                            byte[] postBytes = Encoding.UTF8.GetBytes(message);
                            req.ContentLength = postBytes.Length;
                            using (Stream reqStream = req.GetRequestStream())
                            {
                                reqStream.Write(postBytes, 0, postBytes.Length);
                            }

                            using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                            using (StreamReader sr = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
                            {
                                string resultJson = sr.ReadToEnd();
                                SendJson(stdout, resultJson);
                            }
                        }
                        catch (WebException wex)
                        {
                            string errDetail = wex.Message;
                            if (wex.Response != null)
                            {
                                using (StreamReader sr = new StreamReader(wex.Response.GetResponseStream(), Encoding.UTF8))
                                {
                                    errDetail = sr.ReadToEnd();
                                }
                            }
                            SendJson(stdout, "{\"status\":\"error\",\"detail\":" + EscapeJsonString(errDetail) + "}");
                        }
                        catch (Exception ex)
                        {
                            SendJson(stdout, "{\"status\":\"error\",\"detail\":" + EscapeJsonString(ex.Message) + "}");
                        }
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

        static void SendJson(Stream stdout, string json)
        {
            byte[] respBytes = Encoding.UTF8.GetBytes(json);
            byte[] respLen = BitConverter.GetBytes(respBytes.Length);
            stdout.Write(respLen, 0, 4);
            stdout.Write(respBytes, 0, respBytes.Length);
            stdout.Flush();
        }

        static string EscapeJsonString(string s)
        {
            if (s == null) return "\"\"";
            return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "\\n") + "\"";
        }

        static bool IsServerAlive()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:8000/health");
                req.Timeout = 800;
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

                for (int i = 0; i < 24; i++)
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
