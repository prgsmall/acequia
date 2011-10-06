/**
 *  acutil
 *
 *  Created by Peter R. G. Small on 2011-10-06.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*global $ window document */

/**
 * Singleton acutil
 */
var acutil = {
    /**
     * Given a Date object, return an xsd representation of the date
     * @param {Date} inDate The date object to generate the xsd date from.
     * @returns {String} The xsd date
     */
    xsdDateTime: function (inDate) {
        var pad = function (n) {
            var s = n.toString();
            return s.length < 2 ? '0' + s : s;
        };

        return  inDate.getFullYear() + 
            '-' + pad(inDate.getMonth() + 1) + 
            '-' + pad(inDate.getDate()) + 
            'T' + pad(inDate.getHours()) + 
            ':' + pad(inDate.getMinutes()) + 
            ':' + pad(inDate.getSeconds()) +
            "." + inDate.getMilliseconds().toString();
    }
};
