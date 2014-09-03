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

// load the master config
var mockServerConfigFile = "mockserver.json";

// evaluate data root
if (process.argv.length < 3) {
	console.log("No config file specified, using default");
} else {
	mockServerConfigFile = process.argv[2];
}
mockServerConfigFile = path.resolve(path.dirname(process.argv[1]), mockServerConfigFile);
console.log("Config file is: " + mockServerConfigFile);

// check if it exists
if (!fs.existsSync(mockServerConfigFile)) {
	console.error("Config file doesn't exist: " + mockServerConfigFile);
	process.exit(1);
}

var mockServerConfig = require(mockServerConfigFile);

// setup logging
console.log("Configuring log4js with " + mockServerConfig.log4jsConfigFile);
log4js.configure(mockServerConfig.log4jsConfigFile);
var logger = log4js.getLogger();

////////////////////////////////////////////
// !! no console output beyond this point //
// !! use logger instead                  //
////////////////////////////////////////////

// send response wit appropriate code and type
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
	var imgPrefix = "http://" + serverName + ":" + mockServerConfig.serverPort + "/img/";
	responseStr = responseStr.replace(/>([a-zA-Z0-9_\-]*\.jpg)</g, ">" + imgPrefix + "$1<");
	//logger.debug("Output: " + responseStr);
	return responseStr;
}

// send file from filesystem
function sendFile(req, res, filePath) {
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
		return sendFile(req, res, filePath);
	} else {
		var errString = "File not found: " + baseName;
		logger.error(errString);
		return sendResponse(res, 404, "text/plain", errString);
	}
}

function handleDirectoryValidation(req, res, dataDir) {
	logger.debug("Validating: " + dataDir);
	var outputHtml = "<!DOCTYPE HTML PUBLIC \"-//W3C//DTD HTML 4.01//EN\" \"http://www.w3.org/TR/html4/strict.dtd\">";
	outputHtml += "<html><head><title>Data Directory Validation</title></head><body><h1>Data Directory Validation: " + dataDir + "</h1>";
	var configFilePath = path.resolve(dataDir, mockServerConfig.dataConfigFileName);
	outputHtml += "<h2>Config file: " + configFilePath + "</h2>"
	
	if (fs.existsSync(configFilePath)) {
		try {
			var config = JSON.parse(fs.readFileSync(configFilePath));
			for (var configKey in config) {
				var allOk = true;
				logger.debug("Validating: " + configKey);
				var configItem = config[configKey];
				outputHtml += "<h3>" + configItem.name + " - " + configKey + "</h3>";
				outputHtml += "<ul>";
				if (!configItem.name) {
					outputHtml += "<li style='color:purple'><b>name</b> missing</li>";
					allOk = false;
				}
				if (!configItem.proxyTarget && !configItem.responseFile) {
					outputHtml += "<li style='color:red'>neither proxyTarget nor responseFile</li>";
					allOk = false;
				}
				if (configItem.proxyTarget && configItem.responseFile) {
					outputHtml += "<li style='color:purple'>both proxyTarget and responseFile</li>";
					allOk = false;
				}
				if (!configItem.proxyTarget) { // these are ignored for proxy
					if (!configItem.responseFile) {
						outputHtml += "<li style='color:red'>responseFile missing</li>";
						allOk = false;
					} else {
						if (!fs.existsSync(path.resolve(dataDir, configItem.responseFile))) {
							outputHtml += "<li style='color:red'>responseFile " + configItem.responseFile + " not on filesystem</li>";
							allOk = false;
						}
					}
					if (!configItem.requestFile) {
						outputHtml += "<li style='color:purple'>requestFile missing</li>";
						allOk = false;
					} else {
						if (!fs.existsSync(path.resolve(dataDir, configItem.requestFile))) {
							outputHtml += "<li style='color:red'>requestFile " + configItem.requestFile + " not on filesystem</li>";
							allOk = false;
						}
					}
				}

				if (allOk) {
					outputHtml += "<li style='color:green'>O.K.</li>";
				}
				outputHtml += "</ul>";
			}
		} catch(err) {
			logger.error("Validating failed: " + err);
			outputHtml += "<h2>Error</h2><div style='color:red'>" + err + "</div>";	
		}
		
		outputHtml += "<h2>Config dump</h2><pre>" + fs.readFileSync(configFilePath).toString() + "</pre>";
	} else {
		outputHtml += "<div style='color:purple'>config file not found on filesystem</div>";
	}

	outputHtml += "<h2>Directory dump</h2><ul>";
	var files = fs.readdirSync(dataDir);
	for (var i in files) {
		logger.debug("File: " + files[i]);
		outputHtml += "<li><a href='" + files[i] + "'>"+ files[i] +"</a></li>";
	}

	logger.debug(outputHtml);
	outputHtml += "</ul>";

	outputHtml += "</body></html>"
	return sendResponse(res, 200, "text/html", outputHtml);
}

////////////////////////////////////////////////////////
// end of helper functions, start of the code itselff //
////////////////////////////////////////////////////////

logger.info("Data root dir is: " + mockServerConfig.dataRootDir);

// check if it exists
if (!fs.existsSync(mockServerConfig.dataRootDir)) {
	logger.fatal("Data root dir doesn't exist: " + mockServerConfig.dataRootDir);
	process.exit(1);
}

//
// Create a proxy server with custom application logic
//
var proxy = httpProxy.createProxyServer({});

proxy.on("error", function (err, req, res) {
	var errString = "Proxy error: " + (err ? err.toString() : "");
	logger.error(errString);
	return sendResponse(res, 500, "text/plain", errString);
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
	var dataDir = path.resolve(mockServerConfig.dataRootDir, path.dirname("." + urlString));
	logger.debug("Data dir for the request is: " + dataDir);
	var baseName = path.basename(urlString);
	logger.debug("Base name for the request is: " + baseName);
	if (!fs.existsSync(dataDir)) {
		var errString = "Data dir not found: " + path.dirname(urlString);
		logger.error(errString);
		return sendResponse(res, 404, "text/plain", errString);
	}

	// now check if the config file exists in the dir and if so, load it
	var configFilePath = path.resolve(dataDir, mockServerConfig.dataConfigFileName);
	logger.debug("Looking up config: " + configFilePath);
	if (baseName == mockServerConfig.dataConfigFileName) {
		// url pointing to config file, validate it
		return handleDirectoryValidation(req, res, dataDir);
	} else if (fs.existsSync(configFilePath)) {
		logger.debug("Config file exists, trying to load");
		var configFile, config;
		try {
			configFile = JSON.parse(fs.readFileSync(configFilePath));
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

logger.info("listening on port " + mockServerConfig.serverPort);
server.listen(mockServerConfig.serverPort, function(err) {
	if (err) { 
		throw err;
	}
	
	if (mockServerConfig.chroot) {
		var chroot = require("chroot");
		try {
			chroot(mockServerConfig.chroot.dir, mockServerConfig.chroot.user);
			logger.warn("changed root to " + mockServerConfig.chroot.dir + " and user to " + mockServerConfig.chroot.user);
		} catch(e) {
			logger.fatal("changing root or user failed", e);
			process.exit(1);
		}
	}
});
