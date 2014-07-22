var express    = require('express');
var http       = require('http');
var https      = require('https');
var fs         = require('fs');
var key_file   = 'cert/file.pem';
var cert_file  = 'cert/file.crt';
//var ca_file    = 'cert/ca.crt';

var config     = {
  key: fs.readFileSync(key_file),
 cert: fs.readFileSync(cert_file),
//   ca: fs.readFileSync(ca_file),

   requestCert: true,
   rejectUnauthorized: false
//   passphrase: "1111"
};

var app = express();
var port = 3000;
var ports = 4000;


app.get('/concur/hotel/v1/HotelSearch', function(req, res) {
//        res.sendfile('HotelSearch');
	  var data = fs.readFileSync('public/HotelSearch').toString();
	  res.end(data);
});


app.get('/concur/hotel/v1/HotelAvail', function(req, res) {
//        res.sendfile('HotelSearch');
	  var data = fs.readFileSync('public/HotelAvail').toString();
          res.end(data);
});

app.get ('/', function (req, res) {
          var data = fs.readFileSync('public/HotelSearchR').toString();
	  var data = data.replace("%LAT%", "45.1317777");
          var data = data.replace("%LONG%", "-86.1");

          res.end(data);
});


http.createServer(app).listen(port);
https.createServer(config, app).listen(ports);


console.log('HTTP Server listening on port ' + port);
console.log('HTTPS Server listening on port ' + ports);

