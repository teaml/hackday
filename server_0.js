var 	express    = require('express'),
	http       = require('http'),
	fs         = require('fs');

var app = express();
var port = 8080;

app.get('/:name', function(req, res) {
	  var data = fs.readFileSync('data/HotelService-THN-Canberra/' + req.params.name + 'RS.xml').toString();
	  res.end(data);
	  console.log('data/HotelService-THN-Canberra/' + req.params.name + 'RS.xml');
//	  console.log(data);
});

app.post('/:name', function(req, res) {
         // var data = fs.readFileSync('data/HotelService-THN-Canberra/' + req.params.name + 'RS.xml').toString();
         // res.end(data);
	res.set('Content-Type', 'application/xml');
        res.sendfile('data/HotelService-THN-Canberra/' + req.params.name + 'RS.xml');
          console.log('data/HotelService-THN-Canberra/' + req.params.name + 'RS.xml');
//          console.log(data);
});





app.get ('/', function (req, res) {
	res.end('usage: /HotelSearch');
});



http.createServer(app).listen(port);


console.log('HTTP Server listening on port ' + port);

