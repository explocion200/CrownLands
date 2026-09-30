"use strict";
require("./validate-clan-pending-mechanics-browser").main(["infirmary"])
  .catch(error => {console.error(error); process.exitCode = 1;});
