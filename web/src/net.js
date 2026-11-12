export class MatchClient {
  constructor(handlers) { this.handlers = handlers; this.socket = null; this.timer = 0; this.generation = 0; }
  connect(endpoint, name) {
    this.close();
    const generation = this.generation;
    let url;
    try {
      url = endpoint ? new URL(endpoint) : new URL('/match', location.href);
      if (!endpoint) url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      else if (url.protocol === 'https:') url.protocol = 'wss:';
      else if (url.protocol === 'http:') url.protocol = 'ws:';
      if (url.protocol !== 'wss:' && url.protocol !== 'ws:') throw new Error();
      if (url.protocol === 'ws:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname) && location.protocol !== 'http:') throw new Error();
      url.pathname = '/match'; url.search = ''; url.hash = '';
    } catch { this.handlers.error('Enter a valid https:// server address.'); return; }
    this.handlers.status('CONNECTING');
    let ws;
    try { ws = new WebSocket(url); } catch { this.handlers.error('Could not open a connection to that server.'); return; }
    this.socket = ws;
    this.timer = setTimeout(() => { if (ws.readyState !== WebSocket.OPEN) { ws.close(); this.handlers.error('Server did not respond. Check the address and try again.'); } }, 8000);
    ws.onopen = () => { clearTimeout(this.timer); ws.send(JSON.stringify({ type: 'join', name })); this.handlers.status('IN QUEUE'); };
    ws.onmessage = event => {
      if (generation !== this.generation) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'start') {
        this.side = message.side;
        this.handlers.start(message);
        this.send({ type: 'ready' });
      } else if (message.type === 'frame') {
        if (Number.isInteger(message.tick) && Array.isArray(message.inputs) && message.inputs.length === 2)
          this.handlers.frame(message);
      } else if (message.type === 'queued') this.handlers.status('IN QUEUE');
      else if (message.type === 'over') this.handlers.over();
      else if (message.type === 'opponent_left') this.handlers.left();
      else if (message.type === 'error') this.handlers.error(String(message.message || 'Match server error.'));
      else if (message.type === 'waiting_rematch') this.handlers.status('WAITING FOR REMATCH');
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      clearTimeout(this.timer);
      if (generation !== this.generation) return;
      this.socket = null;
      this.handlers.closed();
    };
  }
  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
  input(jump, dunk) { this.send({ type: 'input', jump: !!jump, dunk: !!dunk }); }
  close() {
    this.generation++;
    clearTimeout(this.timer);
    const ws = this.socket; this.socket = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; ws.close(); }
  }
}

export function normalizeEndpoint(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  if (!['https:', 'http:', 'wss:', 'ws:'].includes(url.protocol)) throw new Error('Unsupported server protocol.');
  if (url.username || url.password) throw new Error('Do not put credentials in the server address.');
  url.protocol = url.protocol === 'http:' || url.protocol === 'ws:' ? 'ws:' : 'wss:';
  url.pathname = ''; url.search = ''; url.hash = '';
  return url.href.replace(/\/$/, '');
}
