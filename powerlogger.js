var net = require('net');
var xml2js = require('xml2js');
var rrd = require('../node_rrd/lib/rrd');
var spawn = require('child_process').spawn;
var http=require('http');

var express=require('express')
    , app = express()
    , server = require('http').createServer(app)
    , io = require('socket.io').listen(server);

var powersets = {
    "3h": ["3h", 30],
    "24h": ["24h", 30],
    "48h": ["48h", 30],
    "1w":  ["8d", 86400],
    "1m": [ "1month", 86400],
    "3m": [ "3month", 86400],
    "1y": [ "1y", 86400]
};

var tempsets = {
    "3h": ["3h", 300],
    "24h": ["24h", 900],
    "48h": ["48h", 1800],
    "1w":  ["8d", 7200],
    "1m": [ "1month", 10800],
    "3m": [ "3month", 43200],
    "1y": [ "1y", 86400]
};

server.listen(8000);

app.get('/', function (req, res) {
	res.sendfile(__dirname + '/index.html');
    });

app.get("/power/:data", function(req, res){
	var p = powersets[req.params.data];
	var child = spawn("rrdtool", 
			  ['xport', '-m', '10000', '-s', 'now-'+p[0], '--step', p[1],
			   'DEF:g1=/srv/power/garage.rrd:ch1:AVERAGE',
			   'DEF:g2=/srv/power/garage.rrd:ch2:AVERAGE',
			   'DEF:g3=/srv/power/garage.rrd:ch3:AVERAGE',
			   'DEF:t=/srv/power/total.rrd:ch1:AVERAGE',
			   'CDEF:g=g1,g2,g3,+,+,0.75,*',
			   'XPORT:g:Garage',
			   'CDEF:h=t,g,-',
			   'XPORT:h:House'
			   ] );
	res.set("Content-Type", "application/xml" );
	child.stdout.on('data', function (data) { res.write(data); return 1 });
	child.stdout.on('end', function () { res.end() });
    }
    );

app.get("/temperature/:data", function(req, res){
	var p = tempsets[req.params.data];
	var child = spawn("rrdtool", 
			  ['xport', '-m', '10000', '-s', 'now-'+p[0], '--step', p[1],
			   'DEF:Anton=/srv/power/Anton.rrd:temp:AVERAGE',
			   'DEF:Ella=/srv/power/Ella.rrd:temp:AVERAGE',
			   'DEF:Matplats=/srv/power/Matplats.rrd:temp:AVERAGE',
			   'DEF:Utomhus=/srv/power/Utomhus.rrd:temp:AVERAGE',
			   'DEF:A=/srv/power/A.rrd:temp:AVERAGE',
			   'DEF:B=/srv/power/B.rrd:temp:AVERAGE',
			   'DEF:C=/srv/power/C.rrd:temp:AVERAGE',
			   'DEF:D=/srv/power/D.rrd:temp:AVERAGE',
			   'DEF:E=/srv/power/E.rrd:temp:AVERAGE',
			   'XPORT:Anton:Anton',
			   'XPORT:Ella:Ella',
			   'XPORT:Matplats:Matplats',
			   'XPORT:Utomhus:Utomhus',
			   'XPORT:A:A',
			   'XPORT:B:B',
			   'XPORT:C:C',
			   'XPORT:D:D',
			   'XPORT:E:E',
			   ] );
	res.set("Content-Type", "application/xml" );
	child.stdout.on('data', function (data) { res.write(data); return 1 });
	child.stdout.on('end', function () { res.end() });
    }
    );

app.enable( 'trust proxy' );


var HOST = 'rpi1';
var PORT = 12346;
var rrddir = "/srv/power";
var garage_factor = 0.75;

var total = 0;
var garage = 0;
var house = 0;

io.set('log level', 1);

function handler (req, res) {
  fs.readFile(__dirname + '/socket-io-client.html',
  function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading index.html');
    }

    res.writeHead(200);
    res.end(data);
  });
}

io.sockets.on('connection', function (socket) {
    socket.emit('power', { garage: garage, house: house });
    socket.emit('temperature', sensordata );
});

//
// Get data from CurrentCost
//
var client = new net.Socket();
client.connect(PORT, HOST, function() {
    console.log('CONNECTED TO: ' + HOST + ':' + PORT);
});

var parser = new xml2js.Parser( {explicitArray: false} );

var buf="";

// Add a 'data' event handler for the client socket
// data is what the server sent to this socket
client.on('data', function(data) {
    var line, lines;
    buf = buf + data;
    lines = buf.split( "\n" );
    while( lines.length > 1 ) {
	line = lines.shift();
	parse_msg( line );
    }
    buf = lines[0];
});

// Add a 'close' event handler for the client socket
client.on('close', function() {
    console.log('Connection closed');
});

function parse_msg( line ) {
    parser.parseString(line, function (err, result) {
	if( err ) {
	    console.log( err );
	}
	else {
	    decode_msg(result);
	}
    });
}

function decode_msg( msg ) {
    if( msg && msg.msg ) {
	var sensor = msg.msg.sensor;
	var ch1, ch2, ch3;
	
	if( sensor ) {
	    ch1 = parseInt(msg.msg.ch1.watts);
	    if( msg.msg.ch2 )
		ch2 = parseInt(msg.msg.ch2.watts);
	    
	    if( msg.msg.ch3 )
		ch3 = parseInt(msg.msg.ch3.watts);
	    
	    if( sensor === "9" ) {
//		console.log( "Total: " + ch1 );
		total = ch1;
		house = total - garage;

		rrd.update( rrddir + "/total.rrd", "ch1", [["N", ch1].join(":")], 
			    function (error) { 
				if (error) console.log("Error:", error);
			    });
	    }
	    else if( sensor === "0" ) {
//		console.log( "Garage: " + (ch1+ch2+ch3) );
		garage = Math.round((ch1+ch2+ch3) * garage_factor);
		house = total - garage;

		rrd.update( rrddir + "/garage.rrd", "ch1:ch2:ch3", [["N", ch1,ch2,ch3].join(":")], 
			    function (error) { 
				if (error) console.log("Error:", error);
			    });
	    }
	    else {
		console.log( "Unknown: ", msg );
	    }
	    io.sockets.emit('power', { garage: garage, house: house });
	}
    }
    else {
	console.log( "Unknown: ", msg );
    }
}

//
// Get data from 1-wire temperature sensors
//

var room_sensors = {
    Ella: [ "rpi3", "1F.806908000000/main/28.18333F040000" ],
    Anton: [ "rpi3", "1F.DB6908000000/main/28.FC2F3F040000" ],
    Matplats: [ "rpi3", "1F.B36908000000/main/28.8AEA3E040000" ],
    Utomhus: [ "rpi3", "1F.806908000000/aux/28.421B3F040000" ]
};

var utility_sensors = {
    A: [ "rpi4", "28.F55DEC040000" ], // From heater
    B: [ "rpi4", "28.F4F2EB040000" ], // After bypass and cirkulation pump
    C: [ "rpi4", "28.C28BEB040000" ], // return from building
    D: [ "rpi4", "28.8018EC040000" ], // return to heater
    E: [ "rpi4", "28.8E5599040000" ]  // on bypass
}

var sensordata = {
    Ella: 0,
    Anton: 0,
    Matplats: 0,
    Utomhus: 0,
    A: 0,
    B: 0,
    C: 0,
    D: 0
}

var sensor;

function read_cb( sensor ) {
  return function( data ) {
      console.log( sensor, data );
      rrd.update( rrddir + "/" + sensor + ".rrd", "temp", [["N", data].join(":")], 
		  function (error) { 
		      if (error) console.log("Error:", error);
		  });
      sensordata[sensor] = data;
      io.sockets.emit('temperature', sensordata );
  }
}

function read_room_temperatures() {    
    for( sensor in room_sensors ) {
	read_temp( room_sensors[sensor], read_cb( sensor ) );
    }
}

function read_utility_temperatures() {    
    for( sensor in utility_sensors ) {
	read_temp( utility_sensors[sensor], read_cb( sensor ) );
    }
}

// Read room temperatures every 5 minutes
setInterval( read_room_temperatures, 1000*60*5 );
read_room_temperatures();

// Read utility temperatures every 30 seconds
setInterval( read_utility_temperatures, 1000*30 );
read_utility_temperatures();

function read_temp( sensor, cb ) {
    // There is a bug in owhttpd that makes it return text if
    // you request json and something similar to json if you
    // request text. Deal with it...
    http.get( "http://" + sensor[0] + ":2121/text/" + sensor[1] + "/temperature", function( res ) {
	    res.on("data", function( data ) {
		    var m = (""+data).match( /^"\s*(.*)"/ );
		    cb(parseFloat(m[1]));
		} );
	} ).on('error', function(e) {
		console.log("read_temp error: " + e.message);
	    });
}
