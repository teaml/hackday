var colors = require("colors");
var dom = require('xmldom').DOMParser
var fs = require("fs");
var http = require("http");
var httpProxy = require("http-proxy");
var log4js = require("log4js");
var os = require("os");
var path = require("path");
var xmlserializer = require('xmldom').XMLSerializer;
var xpath = require('xpath');

var serverPort = 8080;
var serverAddress;

var ifaces=os.networkInterfaces();
for (var dev in ifaces) {
	ifaces[dev].forEach(function(details){
		if (details.family=='IPv4' && details.internal == false) {
			serverAddress = details.address;
		}
	});
}

// setup logging
log4js.configure("log4js.json");
var logger = log4js.getLogger();

// extension fuction
if (typeof String.prototype.startsWith != "function") {
	String.prototype.startsWith = function (str){
		return this.slice(0, str.length) == str;
	};
}

function loadConfig() {
	configFile = path.resolve(path.dirname(process.argv[1]), process.argv[2]);	
	configPath = path.dirname(configFile);
	config = require(configFile);
	logger.info("Config set to " + configFile);
}

function sendResponse(res, code, contentType, message) {
	logger.trace("Sending [" + code + "][" + contentType + "]: " + message);
	res.statusCode = code;
	res.setHeader("Content-Type", contentType);
	res.end(message);
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
		sendResponse(res, 200, "text/html", "h1>Avaiable configs:</h1>" + httpout);
	});
}

function switchConfig(newConfigName, req, res) {
	configFileName = newConfigName;
	config = require(configPath + "/" + configFileName);
	logger.warn("New config selected: " + configFileName);
	return renderConfigList(req, res);
}

function doXPathReplacer(replacer, requestDoc, savedRequestDoc, responseDoc) {
	logger.debug("XPathReplacer: " + replacer.source + " -> " + replacer.destination);
	var requestSelect = xpath.useNamespaces(replacer.sourceNamespaces);
	var responseSelect = xpath.useNamespaces(replacer.destinationNamespaces);
	var requestNodes = requestSelect(replacer.source, requestDoc);
	var savedRequestNodes = requestSelect(replacer.source, savedRequestDoc);
	var responseNodes = responseSelect(replacer.destination, responseDoc);

	if (requestNodes.length > 0 && responseNodes.length > 0) {
		responseNodes.forEach(function(responseNode, i) {
			responseNode.value = requestNodes[0].value;
		});
	}
	return responseDoc;
}

function doCoordinateXPathReplacer(replacer, requestDoc, savedRequestDoc, responseDoc) {
	logger.debug("CoordinateXPathReplacer: " + replacer.source + " -> " + replacer.destination);
	var requestSelect = xpath.useNamespaces(replacer.sourceNamespaces);
	var responseSelect = xpath.useNamespaces(replacer.destinationNamespaces);
	var requestNodes = requestSelect(replacer.source, requestDoc);
	var savedRequestNodes = requestSelect(replacer.source, savedRequestDoc);
	var responseNodes = responseSelect(replacer.destination, responseDoc);

	if (requestNodes.length > 0 && responseNodes.length > 0) {
		responseNodes.forEach(function(responseNode, i) {
			responseNode.value = "" + (parseFloat(responseNode.value) + parseFloat(requestNodes[0].value) - parseFloat(savedRequestNodes[0].value));
		});
	}
	return responseDoc;
}

function doReplacer(replacer, requestDoc, savedRequestDoc, responseDoc) {
	switch(replacer.type) {
		case "XPathReplacer":
			return doXPathReplacer(replacer, requestDoc, savedRequestDoc, responseDoc);
		break;
		case  "CoordinateXPathReplacer":
			return  doCoordinateXPathReplacer(replacer, requestDoc, savedRequestDoc, responseDoc);
		break;
	}
	logger.error("Unknown replacer: " + replacer.type);
	return targetDoc;
}

function handleLocalResponse(currentConfig, requestDoc) {
				// request from data
	logger.debug("Saved request: " + currentConfig.requestFile);
	var savedRequestData = fs.readFileSync(path.join(configPath, currentConfig.requestFile));
	logger.trace("Saved request content: " + savedRequestData);
	var savedRequestDoc = new dom().parseFromString(savedRequestData.toString());

	// response from data
	logger.debug("Saved response: " + currentConfig.responseFile);
	var responseData = fs.readFileSync(path.join(configPath, currentConfig.responseFile));
	logger.trace("Saved response content: " + responseData);
	var responseDoc = new dom().parseFromString(responseData.toString());

	// do the replacements
	currentConfig.replacers.forEach(function(replacer) {
		responseDoc = doReplacer(replacer, requestDoc, savedRequestDoc, responseDoc);
	});

	return responseDoc;
}

// replace image URIs to point to this server
function replaceImageUri(responseStr) {
	//logger.debug("Input: " + responseStr);
	// HACK need to evaluate the external name
	var serverName = "ec2-54-187-179-165.us-west-2.compute.amazonaws.com";
	var imgPrefix = "http://" + serverName + ":" + serverPort + "/img/";
	responseStr = responseStr.replace(/>([a-zA-Z0-9_\-]*\.jpg)</g, ">" + imgPrefix + "$1<");
	//logger.debug("Output: " + responseStr);
	return responseStr;
}

function sendImage(imageName, req, res) {
	logger.info("Sending image: " + imageName);
	var fullPath = path.join(configPath, imageName);
	logger.debug("Full path: " + fullPath);

	fs.stat(fullPath, function(error, stat) {
		var rs;
		res.writeHead(200, {
			'Content-Type' : 'image/gif',
			'Content-Length' : stat.size
		});
		rs = fs.createReadStream(fullPath);
		rs.pipe(res);
	});
}

// try to load config
if (process.argv.length < 3) {
	logger.fatal("No config passed as command line parameter");
	process.exit(1);
}

var configFile;
var configPath;
var config;

try {
	 loadConfig();
} catch(err) {
	logger.fatal("Unable to load config: " + process.argv[2] + " - " + err);
	process.exit(1);
}


//
// Create a proxy server with custom application logic
//
var proxy = httpProxy.createProxyServer({});

proxy.on('error', function (err, req, res) {
	var errString = "Proxy error: " + (err ? err.toString() : "");
	logger.error(errString);
	sendResponse(res, 500, "text/plain", errString);
});

//
// Create your custom server and just call `proxy.web()` to proxy
// a web request to the target passed in the options
// also you can use `proxy.ws()` to proxy a websockets request
//
var server = require('http').createServer(function(req, res) {
	// You can define here your custom logic to handle the request
	// and then proxy the request.
	
	var urlString = req.url.toString();
	logger.info("Handling request: " +  urlString + " from " + req.connection.remoteAddress);
	if (urlString == "/") {
		return renderConfigList(req, res);
	} else if (urlString.startsWith('/config/')) {
		var newConfigName = urlString.substr(8);
		return switchConfig(newConfigName, req, res);
	} else if (urlString.startsWith('/img/')) {
		var imageName = urlString.substr(5);
		return sendImage(imageName, req, res);
	} else {
		var currentConfig = config[urlString];
		if (currentConfig == undefined) {
			var errString = "No configuration for: " +  urlString;
			logger.error(errString);
			sendResponse(res, 500, "text/plain", errString);
			return;
		}
		if (currentConfig.proxyTarget != undefined) { // pass the request to the remote serever
			logger.info("Passing request to: " + currentConfig.proxyTarget);
			proxy.web(req, res, {
				target: currentConfig.proxyTarget
			});
		} else { // handle locally
			if (req.method != "POST") {
				var errString = "Unsupported method: " +  req.method;
				logger.error(errString);
				sendResponse(res, 500, "text/plain", errString);
				return;
			}
		
			logger.info("Handling locally: " + currentConfig.name);
			var postBody = "";
			req.on('data', function (data) {
				postBody += data;
				if (postBody.length > 1000000) {
					req.connection.destroy();
				}
			});

			req.on('end', function () {
				// request from POST
				logger.trace("Request body: " + postBody);
				try {
					var requestBodyDoc = new dom().parseFromString(postBody);
					var responseDoc = handleLocalResponse(currentConfig, requestBodyDoc);
					var responseStr =  new xmlserializer().serializeToString(responseDoc);
					responseStr = replaceImageUri(responseStr);
					sendResponse(res, 200, "application/xml", responseStr);
				} catch(err) {
					var errString = "Processing failed: " + err;
					logger.error(errString);
					sendResponse(res, 500, "text/plain", errString);
				}
			});
		}
	}
});

logger.info("listening on " + serverAddress + " port " + serverPort);
server.listen(serverPort);
