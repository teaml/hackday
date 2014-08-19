var 	express		= require('express'),
	http		= require('http'),
	fs		= require('fs'),
	eyes		= require('eyes'),
	bodyparser	= require('body-parser'),
	xpath		= require('xpath'),
	dom		= require('xmldom').DOMParser,
	configdefault	= 'proxy.json';
	config 		= require('./config/' + configdefault),
	xmlserializer	= require('xmldom').XMLSerializer,
	syslog		= require('node-syslog'),
	httpProxy	= require('http-proxy'),
	request		= require('request');
// initialize syslog - https://www.npmjs.org/package/node-syslog
syslog.init("node-syslog", syslog.LOG_PID | syslog.LOG_ODELAY, syslog.LOG_LOCAL0);
syslog.log(syslog.LOG_INFO, "Node Syslog Module output " + new Date());
//syslog.close();

var app = express();
var port = 8080;
var proxy = httpProxy.createProxyServer({});

app.use(bodyparser.text({ type: 'application/xml' }));


app.post('/:name', function(req, res) {
	
	console.log('handling ' + req.params.name);
	var currentConfig = config['/'+req.params.name];

	if (currentConfig.proxyTarget != "") {
		console.log('proxying to ' + currentConfig.proxyTarget);
		//proxy.proxyRequest(req, res, { target: {host:"atrey.karlin.mff.cuni.cz", port:"8080"} });
		//req.pipe(request(currentConfig.proxyTarget)).pipe(res);
		return;
	}

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
	
	res.set('Content-Type', 'application/xml');
	var xmlout = new xmlserializer().serializeToString(resdoc);
	res.send(xmlout);

});





app.get ('/', function (req, res) {
	var httpout = "";
	res.set('Content-Type', 'text/html');
	fs.readdir('config/', function(err, files) {
		files.forEach(function(file) {
			if ( file == configdefault ) {
				httpout += '<b><a href=\"config/' + file + '\">' + file + '</a></b><br>';
				console.log(configdefault);
			} else {
				httpout += '<a href=\"config/' + file + '\">' + file + '</a><br>';
			}
		});
		res.end('<h1>Avaiable configs:</h1>'+httpout);
	});
});

app.get ('/config/:conffile', function (req, res) {
	config     = require('./config/'+ req.params.conffile);
	configdefault = req.params.conffile;
	console.log(req.params.conffile);
	res.redirect('/');
});

http.createServer(app).listen(port);


console.log('HTTP Server listening on port ' + port);

