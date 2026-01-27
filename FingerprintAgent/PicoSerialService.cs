using System.IO.Ports;
using System.Text;
using System.Threading;

public class PicoSerialService : IAsyncDisposable
{
    private readonly object _gate = new();
    private SerialPort? _port;
    private CancellationTokenSource? _cts;
    private Task? _readerTask;

    private readonly Queue<string> _lines = new();
    private readonly ManualResetEventSlim _readyEvt = new(false);

    public string? PortName => _port?.PortName;
    public bool IsOpen => _port?.IsOpen == true;

    /// <summary>Abre a porta (fecha sessão anterior se existir) e inicia o leitor de linhas.</summary>
    public async Task OpenAsync(string port, int baud = 115200)
    {
        if (string.IsNullOrWhiteSpace(port)) throw new ArgumentException("port vazio");

        lock (_gate)
        {
            if (_port?.IsOpen == true && string.Equals(_port.PortName, port, StringComparison.OrdinalIgnoreCase))
                return; // já aberta na mesma porta

            // fecha anterior
            InternalClose_NoLock();

            var sp = new SerialPort(port, baud, Parity.None, 8, StopBits.One)
            {
                NewLine = "\n",
                ReadTimeout = 500,
                WriteTimeout = 500,
                DtrEnable = true,
                RtsEnable = true,
                Encoding = Encoding.ASCII
            };

            sp.Open();
            _port = sp;

            _cts = new CancellationTokenSource();
            _readerTask = Task.Run(() => ReaderLoop(_cts.Token));
            _readyEvt.Reset();
            _lines.Clear();
        }

        // dá um pequeno tempo para o firmware resetar e começar a falar
        await Task.Delay(50);
    }

    /// <summary>Fecha a porta atual e encerra o leitor.</summary>
    public async Task CloseAsync()
    {
        Task? t;
        lock (_gate)
        {
            if (_cts != null) { try { _cts.Cancel(); } catch { } }
            t = _readerTask;
            InternalClose_NoLock();
        }
        if (t != null)
        {
            try { await Task.WhenAny(t, Task.Delay(250)); } catch { }
        }
    }

    /// <summary>Espera até ver uma linha READY ou PONG.</summary>
    public async Task<bool> WaitReadyOrPongAsync(TimeSpan timeout)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        while (sw.Elapsed < timeout)
        {
            if (_readyEvt.IsSet) return true;

            // tenta forçar um PONG
            try { WriteLine_NoThrow("PING"); } catch { }

            var got = DequeueLineMatch(s => s.Contains("\"type\":\"READY\"") || s.Contains("\"type\":\"PONG\""));
            if (got != null) return true;

            await Task.Delay(300);
        }
        return false;
    }

    /// <summary>Envia PING e espera PONG.</summary>
    public async Task<(bool ok, string? raw)> PingAsync(TimeSpan? timeout = null)
    {
        if (!IsOpen) return (false, null);
        var to = timeout ?? TimeSpan.FromMilliseconds(1000);
        try { WriteLine_NoThrow("PING"); } catch { return (false, null); }
        var line = await WaitForAsync(s => s.Contains("\"type\":\"PONG\""), to);
        return (line != null, line);
    }

    /// <summary>Envia SEARCH e espera a resposta SEARCH (aguarda dedo).</summary>
    public async Task<string?> SearchAsync(TimeSpan timeout)
    {
        if (!IsOpen) return null;
        _readyEvt.Reset(); // evita falso READY
        try { WriteLine_NoThrow("SEARCH"); } catch { return null; }
        return await WaitForAsync(s => s.Contains("\"type\":\"SEARCH\""), timeout);
    }

    /// <summary>Envia ENROLL [id] e espera a resposta ENROLL final.</summary>
    public async Task<string?> EnrollAsync(int id, TimeSpan timeout)
    {
        if (!IsOpen) return null;
        if (id <= 0) throw new ArgumentOutOfRangeException(nameof(id));
        try { WriteLine_NoThrow($"ENROLL {id}"); } catch { return null; }
        return await WaitForAsync(s => s.Contains("\"type\":\"ENROLL\""), timeout);
    }

    // ====================== Internals ======================

    private void ReaderLoop(CancellationToken ct)
    {
        var sb = new StringBuilder(256);

        while (!ct.IsCancellationRequested)
        {
            SerialPort? sp;
            lock (_gate) sp = _port;
            if (sp == null || !sp.IsOpen)
            {
                Thread.Sleep(20);
                continue;
            }

            try
            {
                int b = sp.BaseStream.ReadByte();
                if (b < 0) { Thread.Sleep(5); continue; }

                if (b == '\n')
                {
                    var line = sb.ToString().Trim();
                    sb.Clear();

                    if (line.Length > 0)
                    {
                        EnqueueLine(line);

                        // marca pronto se detectar READY/PONG
                        if ((line.Contains("\"type\":\"READY\"") && line.Contains("\"ok\":true")) ||
                            line.Contains("\"type\":\"PONG\""))
                            _readyEvt.Set();
                    }
                }
                else if (b != '\r')
                {
                    sb.Append((char)b);
                }
            }
            catch
            {
                // tempo de leitura ou erro transitório — pequena pausa
                Thread.Sleep(10);
            }
        }
    }

    private void EnqueueLine(string line)
    {
        lock (_gate)
        {
            _lines.Enqueue(line);
            // evita crescer infinito — mantém últimas N (ex.: 200)
            if (_lines.Count > 200)
                _lines.Dequeue();
        }
    }

    private string? DequeueLineMatch(Func<string, bool> match)
    {
        lock (_gate)
        {
            if (_lines.Count == 0) return null;

            // procura a primeira que casa, preservando as demais
            int n = _lines.Count;
            for (int i = 0; i < n; i++)
            {
                var ln = _lines.Dequeue();
                if (match(ln)) return ln;
                _lines.Enqueue(ln); // recoloca no fim
            }
            return null;
        }
    }

    private async Task<string?> WaitForAsync(Func<string, bool> match, TimeSpan timeout)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        while (sw.Elapsed < timeout)
        {
            var ln = DequeueLineMatch(match);
            if (ln != null) return ln;
            await Task.Delay(20);
        }
        return null;
    }

    private void WriteLine_NoThrow(string s)
    {
        SerialPort? sp;
        lock (_gate) sp = _port;
        if (sp == null || !sp.IsOpen) throw new InvalidOperationException("porta fechada");

        try
        {
            sp.Write(s);
            sp.Write("\n");
        }
        catch
        {
            // propaga para quem chamou (Ping/Search/Enroll) via try/catch deles
            throw;
        }
    }

    private void InternalClose_NoLock()
    {
        try { _cts?.Cancel(); } catch { }
        try { _readerTask?.Wait(100); } catch { }
        try { _port?.Close(); } catch { }
        try { _port?.Dispose(); } catch { }

        _port = null;
        _cts = null;
        _readerTask = null;
        _readyEvt.Reset();
        _lines.Clear();
    }

    public async ValueTask DisposeAsync() => await CloseAsync();
}
