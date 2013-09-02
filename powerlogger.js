var net = require('net');
var xml2js = require('xml2js');
var rrd = require('../node_rrd/lib/rrd');
var spawn = require('child_process').spawn;

var app = require('express')()
    , server = require('http').createServer(app)
    , io = require('socket.io').listen(server);

var datasets = {
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

app.get("/data/:data", function(req, res){
	var p = datasets[req.params.data];
	var child = spawn("rrdtool", 
			  ['xport', '-s', 'now-'+p[0], '--step', p[1],
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
});

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
    