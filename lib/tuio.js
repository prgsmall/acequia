/**
 *  tuio
 *
 *  Created by Peter R. G. Small on 2011-12-01.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*global exports require */

var msg = require("./msg");

exports.toAcequiaMessage = function (oscMsg) {
    var name = oscMsg.address + "/" + oscMsg.data.splice(0, 1)[0];
    return new msg.AcequiaMessage("", name, oscMsg.data);
};
