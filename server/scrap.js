// const { response } = require('express');
// const http = require('http');

// const server = http.createServer((request, response) => {
//     response.end('Server Running');
// });

// server.listen(3000, () => {
//     console.log('Running at localhost 3000')
// });

// const express = require('express');
// const app = express();

// app.get('/', (request, response) => {
//     response.send('Running Working');
// });

// app.use(express.json());
// app.post('/users', (request, response) => {
//     const roomName = request.body.roomName;
//     response.json({
//         message : 'Room Created',
//         roomName : roomName
//     });
// });
// app.listen(3000, () => {
//     console.log('It Running at localhost 3000')
// });