var http = require('http');
var zlib = require('zlib');
var assert = require('assert');
var PassThrough = require('stream').PassThrough;
var HtmlFilterApplier = require('./HtmlFilterApplier');

function VisualPhpProxy(options) {
  assert(options.hostname, 'hostname is required');
  this.hostname = options.hostname;

  this.server = http.createServer();
  this.server.on('request', this.onRequest.bind(this));
  this.htmlFilters = [];
}

VisualPhpProxy.prototype.HTML_CONTENT_TYPE_REGEX = /^text\/html/;
VisualPhpProxy.prototype.CHARSET_REGEX = /charset=(.*)$/;

VisualPhpProxy.prototype.listen = function () {
  this.server.listen.apply(this.server, arguments);
};

VisualPhpProxy.prototype.addHtmlFilter = function(filter) {
  this.htmlFilters.push(filter);
};

VisualPhpProxy.prototype.onRequest = function (request, response) {
  console.log('[' + request.method + '] ' + request.url);
  var options = {
    hostname: this.hostname,
    method: request.method,
    path: request.url,
    headers: this.modifyHeaders(request.headers)
  };
  var proxyRequest = http.request(options, this.onProxyResponse.bind(this, response));
  request.pipe(proxyRequest);
};

VisualPhpProxy.prototype.onProxyResponse = function (response, proxyResponse) {
  var contentType = proxyResponse.headers['content-type'];
  var contentEncoding = proxyResponse.headers['content-encoding'];
  var statusCode = proxyResponse.statusCode;

  if (statusCode === 302) {
    response.writeHead(statusCode, this.modifyRedirectLocation(proxyResponse.headers));
  }
  else {
    response.writeHead(statusCode, proxyResponse.headers);
  }

  if (statusCode === 200 && this.HTML_CONTENT_TYPE_REGEX.test(contentType)) {
    var charset = contentType.match(this.CHARSET_REGEX);
    var applier = new HtmlFilterApplier({ charset: (charset ? charset[1] : 'ascii') });

    this.htmlFilters.forEach(applier.addFilter.bind(applier));

    applier.resume();
    proxyResponse
        .pipe(this.getCompressStream(contentEncoding, 'decompress'))
        .pipe(applier)
        .pipe(this.getCompressStream(contentEncoding, 'compress'))
        .pipe(response);
  }
  else {
    proxyResponse.pipe(response);
  }
};

VisualPhpProxy.prototype.getCompressStream = function (encoding, type) {
  assert(encoding, 'encoding is required');
  assert(type, 'type is required');
  assert(type === 'decompress' || type === 'compress', 'type is wrong');
  switch (encoding) {
    case 'gzip':
      return zlib[type === 'decompress' ? 'createGunzip' : 'createGzip']();
    case 'deflate':
      return zlib[type === 'decompress' ? 'createInflate' : 'createDeflate']();
    default:
      return new PassThrough();
  }
};

VisualPhpProxy.prototype.modifyHeaders = function (headers) {
  headers.host = this.hostname;
  return headers;
};

VisualPhpProxy.prototype.modifyRedirectLocation = function (headers) {
  headers.location = headers.location.replace('http://' + this.hostname, '');
  return headers;
};

module.exports = VisualPhpProxy;
