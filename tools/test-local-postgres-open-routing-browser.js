"use strict";
require("./test-local-postgres-live-browser").main({openWorld:true}).catch(e=>{console.error(e);process.exitCode=1;});
