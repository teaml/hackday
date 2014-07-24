var config = require('./sample2.json');
var eyes   = require('eyes');

eyes.inspect(config);

console.log(config["/OTA_HotelSearch"].responseFile);

