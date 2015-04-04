
/**
 * Module dependencies.
 */

var isostring = require('isostring');
var hash = require('string-hash');
var time = require('unix-time');
var dot = require('obj-case');
var is = require('is');
var formatTraits = require('./intercom/format_traits');

/**
 * Map identify `msg`.
 *
 * @param {Identify} msg
 * @param {Object} settings
 * @return {Object}
 */

exports.identify = function(msg){
  var traits = formatTraits(msg.traits());
  var active = msg.active();
  var ret = {};

  ret.user_id = msg.userId();
  ret.custom_attributes = traits;

  if (msg.userAgent()) ret.last_seen_user_agent = msg.userAgent();
  if (msg.created()) ret.remote_created_at = time(msg.created());
  if (active) ret.last_request_at = time(msg.timestamp());
  if (msg.ip()) ret.last_seen_ip = msg.ip();
  if (msg.email()) ret.email = msg.email();
  if (msg.name()) ret.name = msg.name();

  // Add company data
  var companies = dot(traits, 'companies');
  var company = dot(traits, 'company');

  if (company) companies = [company];
  if (is.array(companies)) ret.companies = companies.map(formatCompany);

  return ret;
};

/**
 * Map track `msg`.
 *
 * @param {Track} msg
 * @param {Object} settings
 * @return {Object}
 */

exports.track = function(msg){
  var ret = {};
  ret.created = time(msg.timestamp());
  ret.event_name = msg.event();
  ret.user_id = msg.userId();
  if (msg.email()) ret.email = msg.email();
  ret.metadata = msg.properties();
  return ret;
};

/**
 * Map group `msg`.
 *
 * @param {Group} msg
 * @return {Object}
 */

exports.group = function(msg){
  var ret = {};
  ret.remote_created_at = time(msg.created());
  ret.company_id = msg.groupId();
  ret.name = msg.name();
  ret.monthly_spend = msg.proxy('traits.monthlySpend');
  ret.plan = msg.proxy('traits.plan');
  ret.custom_attributes = formatTraits(msg.traits());
  return ret;
};

/**
 * Formats a company for use with intercom
 *
 * http://docs.intercom.io/#Companies
 *
 * TODO: add .companies()
 *
 * @param {Object} company
 * @return {Object}
 * @api private
 */

function formatCompany(company){
  if (is.string(company)) company = { name: company };

  var ret = {};
  ret.name = company.name;
  ret.custom_attributes = company;

  if (company.id) {
    ret.company_id = company.id;
  } else if (company.name) {
    ret.company_id = hash(company.name);
  }

  var created = dot(company, 'created') || dot(company, 'created_at');
  if (created) ret.remote_created_at = created;
  return ret;
}
