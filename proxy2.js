var colors = require("colors");
var dom = require('xmldom').DOMParser
var fs = require("fs");
var http = require("http");
var httpProxy = require("http-proxy");
var xmlserializer = require('xmldom').XMLSerializer;
var xpath = require('xpath');

var configPath = "./config";
var configFileName   = "arctic.json";
var config = require(configPath + "/" + configFileName);

// extension fuction
if (typeof String.prototype.startsWith != "function") {
	String.prototype.startsWith = function (str){
		return this.slice(0, str.length) == str;
	};
}

// render the HTML to select config file
function renderConfigList(req, res) {
	var httpout = "";
	//res.set('Content-Type', 'text/html');
	fs.readdir("config/", function(err, files) {
		files.forEach(function(file) {
			httpout += ((file == configFileName) ? "<b>" : ("<a href=\"" + file + "\">"))
				+ file 
				+ ((file == configFileName) ? "</b>" : "</a>")
				+ "<br>";
		});
		res.statusCode = 200;
		res.setHeader('Content-Type', 'text/html');
		res.end("<h1>Avaiable configs:</h1>" + httpout);
	});
}

function switchConfig(newConfigName, req, res) {
	configFileName = newConfigName;
	config = require(configPath + "/" + configFileName);
	console.log("New config selected: " + configFileName.green);
	return renderConfigList(req, res);

}

//
// Create a proxy server with custom application logic
//
var proxy = httpProxy.createProxyServer({});

//
// Create your custom server and just call `proxy.web()` to proxy
// a web request to the target passed in the options
// also you can use `proxy.ws()` to proxy a websockets request
//
var server = require('http').createServer(function(req, res) {
	// You can define here your custom logic to handle the request
	// and then proxy the request.
	
	var urlString = req.url.toString();
	console.log("Handling URL: " +  urlString + " from " + req.connection.remoteAddress);
	if (urlString == "/")
		return renderConfigList(req, res);
	else if (urlString.startsWith('/config/')) {
		var newConfigName = urlString.substr(8);
		return switchConfig(newConfigName, req, res);
	} else {
		var currentConfig = config[urlString];
		if (currentConfig == undefined) {
			console.log(("\tNo configuration for: " +  urlString).red);
			res.statusCode = 404;
			res.end("<ConfigNotFound/>");
			return;
		}
		if (currentConfig.proxyTarget != undefined) { // pass the request to the remote serever
			console.log(("\tPassing request to: " + currentConfig.proxyTarget).yellow);
			proxy.web(req, res, {
				target: currentConfig.proxyTarget
			});
		} else {
			if (req.method != "POST") {
				 console.log(("\tUnsupported method: " +  req.method).red);
				res.statusCode = 404;
				res.end("<MethodNotSupported/>");
				return;
			}
		
			console.log(("\tHandling locally: " + currentConfig.name).yellow);
			var postBody = "";
			req.on('data', function (data) {
				postBody += data;
				if (postBody.length > 1000000) {
					req.connection.destroy();
				}
			});

			req.on('end', function () {

				// request from POST
				var reqdoc = new dom().parseFromString(postBody);
				
				// request from data
				var orgreqdata = fs.readFileSync(currentConfig.requestFile);
				console.log(("\t\tSaved request: " + currentConfig.requestFile).grey);
				var orgreqdoc = new dom().parseFromString(orgreqdata.toString());

				// response from data
				var resdata = fs.readFileSync(currentConfig.responseFile);
				console.log(("\t\tSaved response: " + currentConfig.responseFile).grey);
				var resdoc = new dom().parseFromString(resdata.toString());

				res.setHeader('Content-Type', 'application/xml');
				var xmlout = new xmlserializer().serializeToString(resdoc);
				res.end(xmlout);
			});
		}
	}
});

console.log("listening on port 8080")
server.listen(8080);
