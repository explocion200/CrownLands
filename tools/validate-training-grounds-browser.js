"use strict";
require("./validate-clan-pending-mechanics-browser").main(["training"])
  .catch(error => {console.error(error); process.exitCode = 1;});
