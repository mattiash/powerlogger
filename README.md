powerlogger
===========


Log data from 1-wire sensors and CurrentCost powermeters. The data is
logged in an rrd-file. The data can then be shown in a web-browser with a pretty 
graph.

This project is not useable as is. You need to edit create-powertemp as well as
powerlogger.js to adapt it to your sensor setup.


Getting Started
===============

1. Install node.js
2. Run

    npm install

from inside the powerlogger directory.

3. Edit and run create-powertemp.
4. Run node powertemp.js
5. Run lighttpd to server static files. See example in "run".

(C) 2013 Mattias Holmlund
 
