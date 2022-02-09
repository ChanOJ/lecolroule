'use strict';
const path = require('path');

exports.handler = async (event, context) => {

    //Get contents of response
    const request = event.Records[0].cf.request;
    const response = event.Records[0].cf.response;
    const headers = response.headers;
/*
    // Debug
    console.log('DebugEvent ' + event.Records[0].cf.config.eventType 
        + ' -- ' + JSON.stringify(event)
        + ' -- context -- ' + JSON.stringify(context)
        );
*/
    //Set new headers
    headers['strict-transport-security'] = [{key: 'Strict-Transport-Security', value: 'max-age= 63072000; includeSubdomains; preload'}];
    headers['content-security-policy'] = [{key: 'Content-Security-Policy', value: "default-src 'self' https://www.google.com https://www.google-analytics.com; img-src 'self' data: https://www.google-analytics.com; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; object-src 'none'"}];
    headers['x-content-type-options'] = [{key: 'X-Content-Type-Options', value: 'nosniff'}];
    headers['x-frame-options'] = [{key: 'X-Frame-Options', value: 'DENY'}];
    headers['x-xss-protection'] = [{key: 'X-XSS-Protection', value: '1; mode=block'}];
    headers['referrer-policy'] = [{key: 'Referrer-Policy', value: 'same-origin'}];

    // Enforce some Content Types that S3 doesn't handle automatically
    var uri = request.uri;
    //console.info("uri=*" + uri + '*');
    var ext = path.extname(uri);
    //console.info("ext=*" + ext + '*');
    if (ext)
    {
        var contentType;
        switch(ext)
        {
            case '.html', '.htm':
                contentType = 'text/html';
                break;
            case '.xml':
                contentType = 'application/xml';
                break;
            case '.js':
                contentType = 'application/javascript';
                break;
            case '.css':
                contentType = 'text/css';
                break;
            case '.ttf':
                contentType = 'font/ttf';
                break;
            case '.woff':
                contentType = 'font/woff';
                break;
            case '.woff2':
                contentType = 'font/woff2';
                break;
            case '.eot':
                contentType = 'application/vnd.ms-fontobject';
                break;
            case '.svg':
                contentType = 'image/svg+xml';
                break;
            case '.webmanifest':
                contentType = 'application/manifest+json';
                break;
        }
        
        if (contentType)
        {
            headers['content-type'] = [{key: 'Content-Type', value: contentType}];
        }
    }
    
    // Tells the browser to cache the file for 7 days
    if(!headers['cache-control'])
    {
        headers['cache-control'] = [{ 
            key:   'Cache-Control', 
            value: 'public, max-age=604800' 
        }];
    }

    // Debug
    //console.log('Header ' + JSON.stringify(headers));

    //Return modified response
    return response;
};
