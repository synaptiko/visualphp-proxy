var util = require('util');
var cheerio = require('cheerio');
var Transform = require('stream').Transform;
var assert = require('assert');
var Minimize = require('minimize');

function HtmlFilterApplier(options) {
  Transform.call(this);

  assert(options.charset, 'charset is required');
  this.charset = options.charset;
  this.data = [];
  this.filters = [];

  var originalEmit = this.emit;
  var minimize = (options.minimize ? new Minimize({}) : false);
  this.emit = function(event) {
    if (event === 'end') {
      if (minimize) {
        minimize.parse(this.applyFilters(), function (error, data) {
          if (error) {
            originalEmit.call(this, 'error', error);
          }
          else {
            originalEmit.call(this, 'data', data, this.charset);
          }
        }.bind(this));
      }
      else {
        originalEmit.call(this, 'data', this.applyFilters(), this.charset);
      }
    }
    originalEmit.apply(this, arguments);
  };
}
util.inherits(HtmlFilterApplier, Transform);

HtmlFilterApplier.prototype.applyFilters = function () {
  var data = this.data.join('');
  var $ = cheerio.load(data);
  var filters, i, filter;

  filters = this.filters;
  for (i = 0; i < filters.length; i++) {
    filter = filters[i];
    filter.call(null, $);
  }

  return $.html();
};

HtmlFilterApplier.prototype.addFilter = function (filter) {
  assert(filter, 'filter is required');
  assert(typeof filter === 'function', 'filter has to be function');
  this.filters.push(filter);
};

HtmlFilterApplier.prototype._transform = function (chunk, encoding, done) {
  if (encoding === 'buffer') {
    chunk = chunk.toString(this.charset);
  }
  this.data.push(chunk);
  done();
};

module.exports = HtmlFilterApplier;
