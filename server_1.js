var 	express    = require('express'),
	http       = require('http'),
	fs         = require('fs'),
	eyes	   = require('eyes'),
	config 	   = require('./config/sample.json');


var app = express();
var port = 8080;


app.post('/:name', function(req, res) {
         // var data = fs.readFileSync('data/HotelService-THN-Canberra/' + req.params.name + 'RS.xml').toString();
         // res.end(data);
	res.set('Content-Type', 'application/xml');
        res.sendfile(config['/'+req.params.name].responseFile);
        console.log(config['/'+req.params.name].responseFile);
//          console.log(data);
});





app.get ('/', function (req, res) {
	res.end('usage: /HotelSearch');
});



http.createServer(app).listen(port);


console.log('HTTP Server listening on port ' + port);

