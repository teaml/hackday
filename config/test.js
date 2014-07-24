var config = require('./sample.json');
var eyes   = require('eyes');

eyes.inspect(config);

console.log(config.endpoints[0].urlPath);

