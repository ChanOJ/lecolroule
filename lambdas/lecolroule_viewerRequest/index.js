'use strict';

const path = require('path');
const subdir = '/valloire/';

exports.handler = async (event, context) => {
    const {request} = event.Records[0].cf;
    var redir = false;
/*
    console.log('DebugEvent ' + event.Records[0].cf.config.eventType 
        + ' -- ' + JSON.stringify(event)
        + ' -- context -- ' + JSON.stringify(context)
        );
*/
    // redirect to /valloire/... if not present and not serving a resource (css, js, image, ...)
    var uri = request.uri;
    //console.info("uri=*" + uri + '*');
    if (!path.extname(uri)) {
        if (!uri.startsWith(subdir)) {
            uri = subdir.slice(0, subdir.length-1) + uri;
            //console.info("uri=*" + uri + '*');
            redir = true;
        }
    }

    // permanent redirect to www if coming from an apex domain (example.org -> www.example.org)
    var hostname = request.headers.host[0].value;
    //console.info("hostname=*" + hostname + '*');
    var splittedHost = hostname.split('.');
    if (splittedHost.length == 2) {
        hostname = 'www.' + hostname;
        //console.info("hostname=*" + hostname + '*');
        redir = true;
    }

    if (redir) {
        const origin = request.origin;
        //console.info("origin=*" + origin + '*');

        var protocol;
        if (origin)
            protocol = origin.custom.protocol;
        else
            protocol = 'https';

        var qs = request.querystring;
        
        const newUrl = protocol + '://' + hostname + uri + (qs ? qs : '');
        //console.info("redirect to *" + newUrl + '*');

        const response = {
                status: '301',
                statusDescription: 'Permanent redirect',
                headers: {
                    location: [{
                        key: 'Location',
                        value: newUrl,
                    }],
                },
            };
        
        return response;
    }
    else if (!path.extname(uri)) {

        // default language
        var lang = 'fr';

        // starting with at least the subdir has been enforced above with a redirection
        if (uri.length > subdir.length) {
            var subpart = uri.slice(subdir.length);
            if (subpart.length >= 3 && subpart[2] == '/') {
                // extract the language
                lang = subpart.slice(0, 2).toLowerCase();
                //console.info("lang=*" + lang + '*');
            }
        }

        //console.info("lang=*" + lang + '*');
        
        request.uri = subdir + 'index' + lang + '.html';

        //console.info("request.uri=*" + request.uri + '*');
    }

    return request;
}
