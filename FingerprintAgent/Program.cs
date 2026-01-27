// Program.cs — FingerprintAgent (Pico + FPM10A) – versão 2.4.2
// - Captura template em Base64 (comando "TEMPLATE") para salvar no banco
// - Alias /pico/enroll -> /pico/template (compatibilidade)
// - /pico/ping nunca retorna 500; sempre 200 com ok:false em erro

#nullable enable
using System.Text;
using System.IO.Ports;
using System.Management;            // Windows-only (WMI)
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Mvc;     // para [FromQuery] (opcional, mas útil)
using Microsoft.Extensions.Logging;

namespace FingerprintAgent;

public class Program
{
    private const string Version = "2.4.2";

    public static async Task Main(string[] args)
    {
    // Ajusta diretório de trabalho quando rodar como Serviço (padrão é system32)
    try { Directory.SetCurrentDirectory(AppContext.BaseDirectory); } catch { }

    var builder = WebApplication.CreateBuilder(args);

    // Permite rodar como Serviço do Windows (sem janela)
    builder.Host.UseWindowsService();
    builder.Logging.AddEventLog(settings => { settings.SourceName = "FingerprintAgent"; });

        builder.Services.AddCors(o =>
            o.AddDefaultPolicy(p => p
                .AllowAnyOrigin()
                .AllowAnyHeader()
                .AllowAnyMethod()
            )
        );

    var app = builder.Build();
        app.Urls.Add("http://127.0.0.1:17890");
        app.UseCors();

        app.Lifetime.ApplicationStopping.Register(() => PicoSession.Close());

        // ---------- Health ----------
        app.MapGet("/health", () =>
            Results.Ok(new { ok = true, version = Version, backend = "pico-serial" })
        );

        // ---------- Listar portas ----------
        app.MapGet("/pico/devices", () =>
        {
            var ports = new List<object>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // SerialPort
            try
            {
                foreach (var p in SerialPort.GetPortNames().OrderBy(s => s))
                {
                    if (seen.Add(p))
                        ports.Add(new { port = p });
                }
            }
            catch { /* ignore */ }

            // WMI (melhora a cobertura em alguns PCs)
            try
            {
                using var s = new ManagementObjectSearcher("SELECT DeviceID FROM Win32_SerialPort");
                foreach (var mo in s.Get())
                {
                    var id = mo["DeviceID"]?.ToString();
                    if (!string.IsNullOrWhiteSpace(id) && seen.Add(id))
                        ports.Add(new { port = id });
                }
            }
            catch { /* ignore */ }

            return Results.Ok(new { ports });
        });

        // ---------- Abrir / Fechar ----------
        app.MapPost("/pico/open", async (OpenReq req) =>
        {
            if (req is null || string.IsNullOrWhiteSpace(req.port))
                return Results.Ok(new { ok = false, error = "missing_port" });

            try
            {
                await PicoSession.OpenAsync(req.port.Trim(), req.baud > 0 ? req.baud : 115200);
                return Results.Ok(new { ok = true, port = PicoSession.PortName, ready = true });
            }
            catch (Exception ex)
            {
                PicoSession.Close();
                return Results.Ok(new { ok = false, error = "open_failed", message = ex.Message });
            }
        });

        app.MapPost("/pico/close", () =>
        {
            PicoSession.Close();
            return Results.Ok(new { ok = true });
        });

        // ---------- Ping (nunca 500) ----------
        app.MapGet("/pico/ping", async () =>
        {
            if (!PicoSession.IsOpen) return Results.Ok(new { ok = false, pong = (string?)null });

            var (ok, raw) = await PicoSession.PingAsync();
            return Results.Ok(new { ok, pong = raw });
        });

        // ---------- Search ----------
        app.MapGet("/pico/search", async ([FromQuery] int? timeoutMs) =>
        {
            if (!PicoSession.IsOpen) return Results.Ok(new { ok = false, error = "not_open" });

            var r = await PicoSession.SearchVerboseAsync(timeoutMs ?? 15000);
            return Results.Ok(new { ok = r.ok, raw = r.raw, msg = r.msg, error = r.error });
        });

        // ---------- Template (captura Base64) ----------
        // Aceita POST (body JSON) e GET (?timeoutMs=)
        app.MapPost("/pico/template", (TemplateReq? req) =>
            HandleTemplateAsync(req?.timeoutMs));

        app.MapGet("/pico/template", ([FromQuery] int? timeoutMs) =>
            HandleTemplateAsync(timeoutMs));

        // ---------- Alias: /pico/enroll -> /pico/template ----------
        // Também aceita POST e GET para compatibilidade
        app.MapPost("/pico/enroll", (TemplateReq? req) =>
            HandleTemplateAsync(req?.timeoutMs));

        app.MapGet("/pico/enroll", ([FromQuery] int? timeoutMs) =>
            HandleTemplateAsync(timeoutMs));

        await app.RunAsync();

        // ===== função local usada pelos 4 endpoints acima =====
        static async Task<IResult> HandleTemplateAsync(int? timeoutMs)
        {
            if (!PicoSession.IsOpen)
                return Results.Ok(new { ok = false, error = "not_open" });

            int tmo = (timeoutMs.HasValue && timeoutMs.Value > 0) ? timeoutMs.Value : 30000;
            var r = await PicoSession.TemplateVerboseAsync(tmo);

            return Results.Ok(new { ok = r.ok, raw = r.raw, msg = r.msg, b64 = r.b64, error = r.error });
        }
    }

    // ============================================================
    //                       PicoSession
    // ============================================================
    static class PicoSession
    {
        private static readonly object _gate = new();
        private static SerialPort? _port;
        private static CancellationTokenSource? _cts;
        private static Task? _reader;
        private static readonly Queue<string> _lines = new();
        private static readonly ManualResetEventSlim _ready = new(false);
        private static string _portName = "";

        public static bool IsOpen => _port?.IsOpen == true;
        public static string PortName => _portName;

        public static void Close()
        {
            lock (_gate)
            {
                try { _cts?.Cancel(); } catch { }
                try { _reader?.Wait(200); } catch { }
                try { _port?.Close(); } catch { }
                try { _port?.Dispose(); } catch { }
                _port = null; _cts = null; _reader = null; _portName = "";
                _lines.Clear(); _ready.Reset();
            }
        }

        public static async Task OpenAsync(string port, int baud = 115200, int timeoutMs = 5000)
        {
            lock (_gate)
            {
                if (_port?.IsOpen == true && string.Equals(_port.PortName, port, StringComparison.OrdinalIgnoreCase))
                    return;

                Close();

                var sp = new SerialPort(port, baud)
                {
                    NewLine = "\n",
                    ReadTimeout = 500,
                    WriteTimeout = 500,
                    DtrEnable = true,
                    RtsEnable = true
                };
                sp.Open();
                _port = sp;
                _portName = port;

                _cts = new CancellationTokenSource();
                _reader = Task.Run(() => ReaderLoop(_cts.Token));
            }

            _ready.Reset();
            var ok = await WaitReadyOrPongAsync(timeoutMs);
            if (!ok) throw new InvalidOperationException("Pico não respondeu READY/PONG no tempo esperado.");
        }

        private static async Task ReaderLoop(CancellationToken ct)
        {
            var sb = new StringBuilder();

            while (!ct.IsCancellationRequested && _port?.IsOpen == true)
            {
                try
                {
                    int b = _port.BaseStream.ReadByte();
                    if (b < 0) { await Task.Delay(10, ct); continue; }

                    if (b == '\n')
                    {
                        var line = sb.ToString().Trim();
                        sb.Clear();
                        if (line.Length > 0)
                        {
                            lock (_gate) _lines.Enqueue(line);

                            if ((line.Contains("\"type\":\"READY\"") && line.Contains("\"ok\":true")) ||
                                line.Contains("\"type\":\"PONG\""))
                                _ready.Set();
                        }
                    }
                    else if (b != '\r') sb.Append((char)b);
                }
                catch
                {
                    await Task.Delay(10, ct);
                }
            }
        }

        private static string? DequeueLine(Func<string, bool>? match = null)
        {
            lock (_gate)
            {
                if (_lines.Count == 0) return null;
                if (match is null) return _lines.Dequeue();

                int n = _lines.Count;
                for (int i = 0; i < n; i++)
                {
                    var ln = _lines.Dequeue();
                    if (match(ln)) return ln;
                    _lines.Enqueue(ln);
                }
                return null;
            }
        }

        private static async Task<bool> WaitReadyOrPongAsync(int timeoutMs)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            while (sw.ElapsedMilliseconds < timeoutMs)
            {
                if (_ready.IsSet) return true;
                try { _port?.WriteLine("PING"); } catch { }
                await Task.Delay(300);
                var got = DequeueLine(s => s.Contains("\"type\":\"READY\"") || s.Contains("\"type\":\"PONG\""));
                if (got != null) return true;
            }
            return false;
        }

        private static async Task<string?> WaitForAsync(Func<string, bool> match, int timeoutMs)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            while (sw.ElapsedMilliseconds < timeoutMs)
            {
                var ln = DequeueLine(match);
                if (ln != null) return ln;
                await Task.Delay(20);
            }
            return null;
        }

        // --------- Comandos de alto nível ----------
        public static async Task<(bool ok, string? raw)> PingAsync(int timeoutMs = 1200)
        {
            if (!IsOpen) return (false, null);
            try { _port!.WriteLine("PING"); } catch { return (false, null); }

            var ln = await WaitForAsync(s => s.Contains("\"type\":\"PONG\""), timeoutMs);
            return (ln != null, ln);
        }

        public static async Task<(bool ok, string? raw, object? msg, string? error)>
        SearchVerboseAsync(int timeoutMs = 15000)
        {
            if (!IsOpen) return (false, null, null, "not_open");

            try { _port!.WriteLine("SEARCH"); }
            catch (Exception ex) { return (false, null, null, "write_failed: " + ex.Message); }

            var ln = await WaitForAsync(s => s.Contains("\"type\":\"SEARCH\""), timeoutMs);
            if (ln == null) return (false, null, null, null);

            try
            {
                var msg = JsonSerializer.Deserialize<JsonElement>(ln);
                return (true, ln, msg, null);
            }
            catch { return (true, ln, null, null); }
        }

        public static async Task<(bool ok, string? raw, object? msg, string? b64, string? error)>
        TemplateVerboseAsync(int timeoutMs = 30000)
        {
            if (!IsOpen) return (false, null, null, null, "not_open");

            try { _port!.WriteLine("TEMPLATE"); }
            catch (Exception ex) { return (false, null, null, null, "write_failed: " + ex.Message); }

            var ln = await WaitForAsync(s => s.Contains("\"type\":\"TEMPLATE\""), timeoutMs);
            if (ln == null) return (false, null, null, null, null);

            try
            {
                var obj = JsonSerializer.Deserialize<JsonElement>(ln);
                string b64 = obj.TryGetProperty("b64", out var v) ? (v.GetString() ?? "") : "";
                return (true, ln, obj, b64, null);
            }
            catch { return (true, ln, null, null, null); }
        }
    }

    // ================== DTOs ==================
    public record OpenReq(string port, int baud);
    public record TemplateReq(int? timeoutMs);
}