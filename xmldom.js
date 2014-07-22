var express = require('express');
var http       = require('http');
var https      = require('https');
var fs         = require('fs');
var o2x        = require('object-to-xml');
var parser = require('libxml-to-js');

//var parser = require('xmldom').DOMParser;


var app = express();
var port = 3000;

app.get('/concur/hotel/v1/:name', function(req, res) {
          var data = fs.readFileSync('public/' + req.params.name).toString();
//	  var doc = new parser().parseFromString(data);
//	  console.info(doc);

parser(data, '//Criteria/Criterion/Position', function (error, result) {
    if (error) {
        console.error(error);
    } else {
        console.log(result);
    }
});
          var data = data.replace("%LAT%", "45.1");
          var data = data.replace("%LONG%", "-86.1");

          res.end(data);
});

app.get('/concur/hotel/v1/HotelSearch', function(req, res) {
	
	res.set('Content-Type', 'text/xml');
        res.sendfile('HotelSearch2');
});

app.get ('/', function (req, res) {
	res.end('Works!');
});


http.createServer(app).listen(port);


console.log('Server listening on port ' + port);

