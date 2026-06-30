const port = Number(process.argv[2]);
const expression = Buffer.from(process.argv[3], 'base64').toString('utf8');
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
if (!targets.length) throw new Error(`No WebView target on port ${port}`);
const socket = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const id = 1;
socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
const result = await new Promise((resolve, reject) => {
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== id) return;
    if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
    else resolve(message.result.result.value);
  });
});
socket.close();
process.stdout.write(JSON.stringify(result));
