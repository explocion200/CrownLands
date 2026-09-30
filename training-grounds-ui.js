(function (global) {
  "use strict";
  function mount(host, tower, options = {}) {
    global.CrownlandsClanTowerBuildingsUi.mountPendingMechanics(host, tower, "training", options);
  }
  global.CrownlandsTrainingGroundsUi = Object.freeze({ mount });
})(window);
