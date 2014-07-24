var fs = require('fs'),
    eyes = require('eyes'),
    xml2js = require('xml2js');
var parser = new xml2js.Parser(xml2js.defaults["0.2"]);

fs.readFile('public/HotelSearch', function(err, data) {
    parser.parseString(data, function (err, result) {
        eyes.inspect(result);
    	var builder = new xml2js.Builder();
    	var xml = builder.buildObject(result);
    	console.log(xml);	
    });
});
