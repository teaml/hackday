var chroot = require("chroot");
var dom = require("xmldom").DOMParser;
var fs = require("fs");
var http = require("http");
var httpProxy = require("http-proxy");
var log4js = require("log4js");
var mime = require("mime");
var os = require("os");
var path = require("path");
var xmlserializer = require("xmldom").XMLSerializer;
var xpath = require("xpath");

var serverPort = 8080;
var dataRootDir = path.resolve(path.dirname(process.argv[1]), "data");
var configFileName = "config.json";

// setup logging
log4js.configure("log4js.json");
var logger = log4js.getLogger();

function sendResponse(res, code, contentType, message) {
	logger.trace("Sending [" + code + "][" + contentType + "]: " + message);
	res.statusCode = code;
	res.setHeader("Content-Type", contentType);
	res.end(message);
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

function handleLocalResponse(dataDir, config, requestDoc) {
				// request from data
	logger.debug("Saved request: " + config.requestFile);
	var savedRequestData = fs.readFileSync(path.resolve(dataDir, config.requestFile));
	logger.trace("Saved request content: " + savedRequestData);
	var savedRequestDoc = new dom().parseFromString(savedRequestData.toString());

	// response from data
	logger.debug("Saved response: " + config.responseFile);
	var responseData = fs.readFileSync(path.resolve(dataDir, config.responseFile));
	logger.trace("Saved response content: " + responseData);
	var responseDoc = new dom().parseFromString(responseData.toString());

	// do the replacements
	config.replacers.forEach(function(replacer) {
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

function sendFile(filePath, req, res) {
	var mimeType = mime.lookup(filePath);
	logger.info("Sending file " + filePath + " as " + mimeType);

	fs.stat(filePath, function(error, stat) {
		var rs;
		res.writeHead(200, {
			"Content-Type" : mimeType,
			"Content-Length" : stat.size
		});
		rs = fs.createReadStream(filePath);
		rs.pipe(res);
	});
}

// handle request if there is a config file with appropriate config
function handleRequestConfig(req, res, dataDir, config) {

	if (config.proxyTarget != undefined) { // pass the request to the remote serever
		logger.info("Passing request to: " + config.proxyTarget);
		proxy.web(req, res, {
			target: config.proxyTarget
		});
	} else { // handle locally
		if (req.method != "POST") {
			var errString = "Unsupported method: " +  req.method;
			logger.error(errString);
			return sendResponse(res, 500, "text/plain", errString);
		}
	
		logger.info("Handling locally: " + config.name);
		var postBody = "";
		req.on("data", function (data) {
			postBody += data;
			if (postBody.length > 1000000) {
				req.connection.destroy();
			}
		});

		req.on("end", function () {
			// request from POST
			logger.trace("Request body: " + postBody);
			try {
				var requestBodyDoc = new dom().parseFromString(postBody);
				var responseDoc = handleLocalResponse(dataDir, config, requestBodyDoc);
				var responseStr =  new xmlserializer().serializeToString(responseDoc);
				responseStr = replaceImageUri(responseStr);
				return sendResponse(res, 200, "application/xml", responseStr);
			} catch(err) {
				var errString = "Processing failed: " + err;
				logger.error(errString);
				return sendResponse(res, 500, "text/plain", errString);
			}
		});
	}
}

// handle request if there is no config file
function handleRequestRaw(req, res, dataDir, baseName) {
	var filePath = path.resolve(dataDir, baseName);
	if (fs.existsSync(filePath)) {
		return sendFile(filePath, req, res);
	} else {
		var errString = "File not found: " + baseName;
		logger.error(errString);
		return sendResponse(res, 404, "text/plain", errString);
	}
}

// evaluate data root
if (process.argv.length < 3) {
	logger.warn("No data root dir specified, using default");
} else {
	dataRootDir = path.resolve(path.dirname(process.argv[1]), process.argv[2]);
}
logger.info("Data root dir is: " + dataRootDir);

// check if it exists
if (!fs.existsSync(dataRootDir)) {
	logger.fatal("Data root dir doesn't exist: " + dataRootDir);
	process.exit(1);
}

//
// Create a proxy server with custom application logic
//
var proxy = httpProxy.createProxyServer({});

proxy.on("error", function (err, req, res) {
	var errString = "Proxy error: " + (err ? err.toString() : "");
	logger.error(errString);
	sendResponse(res, 500, "text/plain", errString);
});

//
// Create your custom server and just call `proxy.web()` to proxy
// a web request to the target passed in the options
// also you can use `proxy.ws()` to proxy a websockets request
//
var server = require("http").createServer(function(req, res) {
	// You can define here your custom logic to handle the request
	// and then proxy the request.
	
	var urlString = req.url.toString();
	logger.info("Handling request: " +  urlString + " from " + req.connection.remoteAddress);

	// evaluate the data dir and check if it exists
	var dataDir = path.resolve(dataRootDir, path.dirname("." + urlString));
	logger.debug("Data dir for the request is: " + dataDir);
	var baseName = path.basename(urlString);
	logger.debug("Base name for the request is: " + baseName);
	if (!fs.existsSync(dataDir)) {
		var errString = "Data dir not found: " + path.dirname(urlString);
		logger.error(errString);
		return sendResponse(res, 404, "text/plain", errString);
	}

	// now check if the config file exists in the dir and if so, load it
	var configFilePath = path.resolve(dataDir, configFileName);
	logger.debug("Looking up config: " + configFilePath);
	if (fs.existsSync(configFilePath)) {
		logger.debug("Config file exists, trying to load");
		var configFile, config;
		try {
			configFile = require(configFilePath);
			logger.debug("Config file loaded, trying to find appropriate config:" + baseName);
			config = configFile[baseName];
			if (config != undefined) {
				logger.debug("config found for " + baseName);
				return handleRequestConfig(req, res, dataDir, config);
			} else {
				logger.debug("No config for base name " + baseName + ", fallback to raw");
				return handleRequestRaw(req, res, dataDir, baseName);
			}
		} catch(err) {
			var errString = "Unable to load config file: " + err;
			logger.error(errString);
			return sendResponse(res, 500, "text/plain", errString);
		}
	} else {
		return handleRequestRaw(req, res, dataDir, baseName); 
	}
});

logger.info("listening on port " + serverPort);
server.listen(serverPort, function(err) {
	if (err) { 
		throw err;
	}
	
	try {
		chroot("/var/empty", "nobody");
		console.log("changed root to /var/empty and user to nobody");
	} catch(e) {
		console.error("changing root or user failed", e);
		process.exit(1);
	}
});
