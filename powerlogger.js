var net = require('net');
var xml2js = require('xml2js');

var HOST = 'rpi1';
var PORT = 12346;

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
	decode_msg(result);
    });
}

function decode_msg( msg ) {
    var sensor = msg.msg.sensor;
    var ch1, ch2, ch3;

    if( sensor ) {
	ch1 = parseInt(msg.msg.ch1.watts);
	if( msg.msg.ch2 )
	    ch2 = parseInt(msg.msg.ch2.watts);

	if( msg.msg.ch3 )
	    ch3 = parseInt(msg.msg.ch3.watts);
	
	if( sensor === "9" ) {
	    console.log( "Total: " + ch1 );
	}
	else if( sensor === "0" ) {
	    console.log( "Garage: " + (ch1+ch2+ch3) );
	}
	else {
	    console.log( "Unknown: ", msg );
	}
    }
}