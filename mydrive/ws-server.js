
const WebSocket = require('ws');
const http = require('http');
const setupWSConnection = require('y-websocket/bin/utils').setupWSConnection;

const port = process.env.PORT || 1234;

const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('y-websocket server running');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (conn, req) => {
    setupWSConnection(conn, req, { gc: true });
});

server.listen(port, () => {
    console.log(`Collab server running on port ${port}`);
});
