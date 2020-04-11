const tls = require('tls');
tls.DEFAULT_MAX_VERSION = tls.DEFAULT_MAX_VERSION;

const fs = require('fs')
const https = require('https')
const path = require('path')
const express = require('express')
const app = express()

app.use('/', express.static(path.join(__dirname, 'public')));
app.all('/*', function(req, res, next){
  return res.sendFile(`${__dirname}/public/index.html`);
});

const credentials = {
  key: fs.readFileSync('./privkey.pem'),
  cert: fs.readFileSync('./certificate.pem')
}

const server = https.createServer(credentials, app)

const port = 443
server.listen(port)
console.log(`Visit https://localhost:${port}/`)