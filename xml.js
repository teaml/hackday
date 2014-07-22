var express = require('express');
var http       = require('http');
var https      = require('https');
var fs         = require('fs');
var o2x        = require('object-to-xml');

var obj = {
  '?xml version="1.0" encoding="utf-8"?' : null,
  request : {
    '@' : {
      type : 'product',
      id : 12344556
    },
    '#' : {
      query : {
        vendor : 'redhat',
        name : 'linux'
      }
    }
  }

};

var key_file   = 'cert/file.pem';
var cert_file  = 'cert/file.crt';

var config     = {
  key: fs.readFileSync(key_file),
 cert: fs.readFileSync(cert_file),

   requestCert: true,
   rejectUnauthorized: false
};

var app = express();
var port = 3000;

app.get('/concur/hotel/v1/HotelSearch', function(req, res) {
	res.set('Content-Type', 'text/xml');
        res.sendfile('HotelSearch2');
});

app.get ('/', function (req, res) {
        res.set('Content-Type', 'text/xml');
	res.send(o2x(obj));
});


http.createServer(app).listen(3000);
https.createServer(config, app).listen(4000);


console.log('Server listening on port ' + port);

