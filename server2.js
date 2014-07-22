var express    = require('express');
var http       = require('http');
var https      = require('https');
var fs         = require('fs');
var key_file   = 'cert/file.pem';
var cert_file  = 'cert/file.crt';

function random (low, high) {
    return Math.random() * (high - low) + low;
};

var config     = {
  key: fs.readFileSync(key_file),
 cert: fs.readFileSync(cert_file),

   requestCert: true,
   rejectUnauthorized: false
};

var app = express();
var port = 3000;
var ports = 4000;

app.get('/concur/hotel/v1/:name', function(req, res) {
          var data = fs.readFileSync('public/' + req.params.name).toString();
          var data = data.replace("%LAT%", random(1,90));
          var data = data.replace("%LONG%", "-86.1");

          res.end(data);
});

app.get('/concur/hotel/:name/v1', function(req, res) {
          var data = fs.readFileSync('public/' + req.params.name).toString();
          var data = data.replace("%LAT%", random(1,90));
          var data = data.replace("%LONG%", "-86.1");

          res.end(data);
});

app.post('/concur/hotel/v1/:name', function(req, res) {
	  var data = fs.readFileSync('public/' + req.params.name).toString();
          var data = data.replace("%LAT%", "45.1317");
          var data = data.replace("%LONG%", "-86.1");

	  res.end(data);
});

app.post('/concur/hotel/:name/v1', function(req, res) {
          var data = fs.readFileSync('public/' + req.params.name).toString();
          var data = data.replace("%LAT%", "45.1317777");
          var data = data.replace("%LONG%", "-86.1");

          res.end(data);
});

app.get ('/', function (req, res) {
          res.end('Alive!');
});


http.createServer(app).listen(port);
https.createServer(config, app).listen(ports);


console.log('HTTP Server listening on port ' + port);
console.log('HTTPS Server listening on port ' + ports);

