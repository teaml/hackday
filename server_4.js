var 	express    = require('express'),
	http       = require('http'),
	fs         = require('fs'),
	eyes	   = require('eyes'),
	bodyparser = require('body-parser'),
	xpath	   = require('xpath'),
	dom	   = require('xmldom').DOMParser,
	config 	   = require('./config/sample3a.json'),
        xmlserializer = require('xmldom').XMLSerializer;


var app = express();
var port = 8080;


//app.use(xmlbodyparser({ "normalizeTags": false } ));
app.use(bodyparser.text({ type: 'application/xml' }));


app.post('/:name', function(req, res) {
         // var data = fs.readFileSync('data/HotelService-THN-Canberra/' + req.params.name + 'RS.xml').toString();
         // res.end(data);

	var orgreqdata = fs.readFileSync(config['/'+req.params.name].requestFile);
        var orgreqdoc = new dom().parseFromString(orgreqdata.toString());

	var configdata = config['/'+req.params.name];
        var reqdoc = new dom().parseFromString(req.body);
	
        var resdata = fs.readFileSync(config['/'+req.params.name].responseFile);
	var resdoc = new dom().parseFromString(resdata.toString());


	configdata.replacers.forEach(function(replacer) {
		console.log(replacer);
		if (replacer.type == "XPathReplacer") {
			var reqselect = xpath.useNamespaces(replacer.sourceNamespaces);
			var resselect = xpath.useNamespaces(replacer.destinationNamespaces);
		        var reqnodes = reqselect(replacer.source, reqdoc);
                        var resnodes = resselect(replacer.destination, resdoc);
			if (reqnodes.length > 0 && resnodes.length > 0) {
					resnodes.forEach(function(resnode) {
					resnode.value = reqnodes[0].value;
				});
			}
		} else if (replacer.type == "CoordinateXPathReplacer") {
                        var reqselect = xpath.useNamespaces(replacer.sourceNamespaces);
                        var resselect = xpath.useNamespaces(replacer.destinationNamespaces);
                        var reqnodes = reqselect(replacer.source, reqdoc);
                        var resnodes = resselect(replacer.destination, resdoc);
                        var orgreqnodes = reqselect(replacer.source, orgreqdoc);
			console.log(orgreqnodes[0].value);
 
                        if (reqnodes.length > 0 && resnodes.length > 0) {
                                        resnodes.forEach(function(resnode) {
	
                                        resnode.value = "" + (parseFloat(resnode.value) + parseFloat(reqnodes[0].value) - parseFloat(orgreqnodes[0].value));
                                });
                        }
                }

	});


//        var resselect = xpath.useNamespaces({"ns1": "http://www.opentravel.org/OTA/2003/05"});
//	var resnodes = resselect("/ns1:OTA_HotelSearchRS/@Version", resdoc);
//	resnodes[0].value = '23445';
	
//	console.log(resnodes);
/*	
	var reqdoc = new dom().parseFromString(req.body);
	var reqselect = xpath.useNamespaces({"ns1": "http://www.opentravel.org/OTA/2003/05"});
	var nodes = reqselect("/ns1:OTA_HotelSearchRQ/@Version", reqdoc);

*/
//eyes.inspect(nodes[0].nodeValue);
//console.dir(doc);

	
	
	res.set('Content-Type', 'application/xml');
	var xmlout = new xmlserializer().serializeToString(resdoc);
	res.send(xmlout);

//        res.sendfile(config['/'+req.params.name].responseFile);
//        console.log(config['/'+req.params.name].responseFile);

//          console.log(data);
});





app.get ('/', function (req, res) {
	res.end('usage: /HotelSearch');
});



http.createServer(app).listen(port);


console.log('HTTP Server listening on port ' + port);

