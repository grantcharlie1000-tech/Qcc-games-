from pathlib import Path
import os,subprocess,json,time,urllib.request,socket
root=Path('/tmp/neon-coil-r4-astra-33m2evq4'); out=Path('/workspace/neon-coil-integration-audit-r4')
port=4179
with socket.socket() as sock:sock.bind(('127.0.0.1',port))
server_command=['node',str(root/'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',str(port),'--strictPort']
test_command=['node',str(root/'node_modules/@playwright/test/cli.js'),'test','--config',str(root/'audit.config.ts'),'--grep','pointer movement without click|resize synchronizes ranking']
env=os.environ.copy();env.update(ARCADE_URL=f'http://127.0.0.1:{port}',CHROMIUM_PATH='/usr/bin/chromium',NEON_COIL_EVIDENCE_DIR=str(out/'browser-evidence'))
record={'cwd':str(root),'server_command':server_command,'test_command':test_command,'explicit_environment':{k:env[k] for k in ['ARCADE_URL','CHROMIUM_PATH','NEON_COIL_EVIDENCE_DIR']},'start_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
server=None
try:
 with (out/'server.log').open('w') as slog:
  server=subprocess.Popen(server_command,cwd=root,env=env,stdout=slog,stderr=subprocess.STDOUT)
  record['server_pid']=server.pid
  for _ in range(150):
   if server.poll() is not None:raise RuntimeError('Owned server exited before ready')
   try:
    with urllib.request.urlopen(env['ARCADE_URL'],timeout=1) as response:
     if response.status==200:break
   except Exception:time.sleep(.1)
  else:raise RuntimeError('Owned server did not become ready')
  with (out/'browser.log').open('w') as log:
   result=subprocess.run(test_command,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
  record['exit_code']=result.returncode
finally:
 if server:
  server.terminate()
  try:server.wait(timeout=10)
  except subprocess.TimeoutExpired:server.kill();server.wait(timeout=5)
  record['owned_server_stopped']=server.poll() is not None
 record['end_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
 (out/'BROWSER_COMMAND.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2),flush=True)
raise SystemExit(record.get('exit_code',1))
