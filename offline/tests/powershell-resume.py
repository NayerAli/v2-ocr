import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import socket
import shutil
import ssl
import subprocess
import tempfile
import threading

root = Path(__file__).resolve().parents[2]
pwsh = shutil.which("pwsh")
curl = shutil.which("curl")
if not pwsh or not curl:
    raise SystemExit("This integration test requires pwsh and curl on Linux.")
data = b'v2ocr' * (1024 * 256)
parts = [data[:1000000], data[1000000:]]
payloads = {hashlib.sha256(p).hexdigest(): p for p in parts}
requests = []
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        name = self.path.rsplit('/',1)[-1]
        content = payloads.get(name)
        header = self.headers.get('Range')
        requests.append((name, header))
        if content is None:
            self.send_error(404)
            return
        offset = int(header[6:-1]) if header else 0
        self.send_response(206 if header else 200)
        self.send_header('Content-Length', str(len(content)-offset))
        if header:
            self.send_header('Content-Range', f'bytes {offset}-{len(content)-1}/{len(content)}')
        self.end_headers()
        if len(requests) == 1:
            self.wfile.write(content[:400000])
            self.wfile.flush()
            self.connection.shutdown(socket.SHUT_RDWR)
        else:
            self.wfile.write(content[offset:])
    def log_message(self, *args):
        pass

with tempfile.TemporaryDirectory() as temp:
    path = Path(temp)
    cert, key = path/'cert.pem', path/'key.pem'
    subprocess.run(['openssl','req','-x509','-nodes','-newkey','rsa:2048','-keyout',key,'-out',cert,
                    '-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],
                   check=True,capture_output=True)
    (path/'curl.exe').symlink_to(curl)
    server = ThreadingHTTPServer(('127.0.0.1',0), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert,key)
    server.socket = context.wrap_socket(server.socket,server_side=True)
    thread=threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    ps = path/'test.ps1'
    rows = [f"@{{key='objects/{h}';sha256='{h}';size={len(d)}}}" for h,d in payloads.items()]
    ps.write_text('''
$ErrorActionPreference='Stop'
$tokens=$null
$errors=$null
$tree=[Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'offline/install.ps1').Path,[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$definitions=$tree.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]},$true)
foreach ($name in 'Test-Hash','Get-Segment','Get-Archive') {
  . ([scriptblock]::Create(($definitions | Where-Object Name -eq $name).Extent.Text))
}
$ReleaseUrl=$env:V2OCR_TEST_URL
$Cache=$env:V2OCR_TEST_CACHE
$Suffix=@{images='tar.gz'}
''' + f"$entry=@{{sha256='{hashlib.sha256(data).hexdigest()}';size={len(data)};parts=@({','.join(rows)})}}\n" + '''
$result=Get-Archive 'images' $entry
if (-not (Test-Hash $result $entry)) { throw 'archive corrompue' }
Remove-Item $result
$result=Get-Archive 'images' $entry
if (-not (Test-Hash $result $entry)) { throw 'cache invalide' }
''')
    env=os.environ|{'PATH':temp+':'+os.environ['PATH'],'CURL_CA_BUNDLE':str(cert),
                    'V2OCR_TEST_CACHE':temp,'V2OCR_TEST_URL':f'https://localhost:{server.server_port}/manifest.json'}
    try:
        subprocess.run([pwsh, '-NoProfile', '-File', ps], cwd=root, env=env, check=True, timeout=30)
        assert requests==[(list(payloads)[0],None),(list(payloads)[0],'bytes=400000-'),(list(payloads)[1],None)],requests
        print('Reprise effective à 400 000 octets et reconstruction depuis le cache sans requête supplémentaire.')
    finally:
        server.shutdown()
