
var Test = require('segmentio-integration-tester');
var helpers = require('./helpers');
var facade = require('segmentio-facade');
var hash = require('string-hash');
var mapper = require('../lib/mapper');
var time = require('unix-time');
var should = require('should');
var assert = require('assert');
var Intercom = require('..');
var redis = require('redis');

describe('Intercom', function(){
  var intercom;
  var settings;
  var payload;
  var test;
  var db;

  before(function(done){
    db = redis.createClient();
    db.on('ready', done);
    db.on('error', done);
  });

  beforeEach(function(){
    payload = {};
    settings = {
      appId: 'fcxywseo',
      apiKey: '9d068fa090d38be4c715b669b3f1370f76ac5306',
      oauth: {
        'access-token': 'dG9rOjM1YWYyNDQ4X2RmNDNfNDExMV85MTk4XzkwZDhlZmYxOGI5MToxOjA=' // Test-Han - Segment Friends
      },
      collectContext: false,
      blacklisted: {
        stringifyMe: 'stringify',
        dropMe: 'drop',
        flattenMe: 'flatten'
      },
      defaultMethod: 'flatten',
      richLinkProperties: []
    };
    intercom = new Intercom(settings);
    test = Test(intercom, __dirname);
    test.mapper(mapper);
    intercom.redis(db);
  });

  it('should have correct settings', function(){
    test
      .name('Intercom')
      .endpoint('https://api-segment.intercom.io')
      .channels(['server']);
  });

  describe('.validate()', function(){

    it('should be invalid if .appId and .oauth.access-token is missing', function(){
      delete settings.appId;
      delete settings.oauth;
      test.invalid({}, settings);
    });

    it('should be invalid if .apiKey and .oauth.access-token is missing', function(){
      delete settings.apiKey;
      delete settings.oauth;
      test.invalid({}, settings);
    });

    it('should be invalid if .userId and .email are missing', function(){
      test.invalid({}, settings);
    });

    it('should be valid when just .userId is given', function(){
      test.valid({ userId: '12345' }, settings);
    });

    it('should be valid when just .email is given', function(){
      test.valid({ properties: { email: 'foo@bar.com' } }, settings);
    });

    it('should be valid when .apiKey and .appId are given with no access-token', function(){
      delete settings.oauth;
      test.valid({ userId: '12345' }, settings);
    });

    it('should be valid when .oauth[\'access-token\'] is given with no .apiKey or .appId', function(){
      delete settings.appId;
      delete settings.apiKey;
      test.valid({ userId: '12345' }, settings);
    });

    it('should be valid when .apiKey, .appId, and .oauth[\'access-token\'] are given', function(){
      test.valid({ userId: '12345' }, settings);
    });
  });

  describe('mapper', function(){
    describe('identify', function(){
      it('should map basic identify', function(){
        test.maps('identify-basic');
      });

      it('should map basic context', function(){
        test.maps('identify-context');
      });

      it('should map additional context if collectContext', function () {
        settings.collectContext = true;
        test.maps('identify-collect-context')
      });

      it('should respect .active()', function(){
        test.maps('identify-active');
      });

      it('should map nested dates', function(){
        test.maps('identify-nested-dates');
      });

      it('should map companies', function(){
        test.maps('identify-companies');
      });

      it('should map a company', function(){
        test.maps('identify-company');
      });

      it('should map companies with remove', function(){
        test.maps('identify-companies-remove');
      });

      it('should map a company with remove', function(){
        test.maps('identify-company-remove');
      });

      it('should map phone', function(){
        test.maps('identify-phone');
      });

      it('should update last_request_at with lastRequestAt when supplied', function(){
        test.maps('identify-last-request-at');
      });

      it('should update last_seen_user_agent with userAgent when supplied', function(){
        test.maps('identify-last-seen-user-agent');
      });

      it('should update unsubscribed_from_emails with unsubscribedFromEmails when supplied', function(){
        test.maps('identify-unsubscribed-from-emails');
      });
    });

    describe('group', function(){
      it('should map basic group', function(){
        test.maps('group-basic');
      });
    });

    describe('track', function(){
      it('should map basic track', function(){
        test.maps('track-basic');
      });

      it('should send Rich Link as nested object in metadata', function() {
        settings.richLinkProperties = ['article'];
        test.maps('track-rich-link');
      });
    });
  });

  describe('.identify()', function(){
    it('should be able to identify correctly', function(done){
      var msg = helpers.identify();

      var traits = intercom.formatTraits(msg.traits());
      delete traits.company;
      delete traits.phone;

      payload.user_id = msg.userId();
      payload.remote_created_at = time(msg.created());
      payload.last_request_at = time(msg.timestamp());
      payload.last_seen_ip = msg.ip();
      payload.last_seen_user_agent = msg.userAgent();
      payload.email = msg.email();
      payload.name = msg.name();
      payload.phone = msg.phone();
      payload.custom_attributes = traits;
      payload.companies = [{
        company_id: hash('Segment.io'),
        custom_attributes: {},
        name: 'Segment.io'
      }];

      test
        .set(settings)
        .identify(msg)
        .sends(payload)
        .expects(200)
        .end(done);
    });

    it('should send phone properly', function(done){
      var json = test.fixture('identify-phone');

      test
        .set(settings)
        .identify(json.input)
        .sends(json.output)
        .expects(200)
        .end(done);
    });

    it('should not error on invalid companies', function(done){
      var identify = helpers.identify({ traits: { companies: 'foo' }});
      intercom.identify(identify, function(err){
        should.not.exist(err);
        done();
      });
    });

    it('should send the ip address', function(done){
      var timestamp = new Date();
      test
        .set(settings)
        .identify({
          context: { ip: '70.211.71.236' },
          timestamp: timestamp,
          userId: 'userId'
        })
        .sends({
          custom_attributes: { id: 'userId' },
          last_request_at: time(timestamp),
          last_seen_ip: '70.211.71.236',
          user_id: 'userId',
        })
        .expects(200, done);
    });

    it('should error on invalid creds', function(done){
      test
        .set({ oauth: {'access-token': 'x' }})
        .identify({})
        .error('Unauthorized', done);
    });

    it('should selectively stringify, flatten, or drop traits', function(done){
      intercom.settings.blacklisted = {
        stringifyMe: 'stringify',
        dropMe: 'drop',
        flattenMe: 'flatten'
      }

      var json = test.fixture('identify-blacklist');

      test
        .set(settings)
        .identify(json.input)
        .sends(json.output)
        .expects(200)
        .end(done);
    });

    it('should let you set stringify as the default method for handling nested objects', function(done){
      settings.defaultMethod = 'stringify';
      var json = test.fixture('identify-default-method');
      json.output.custom_attributes = {
        foo: '["yo","hello",{"yolo":"hi"}]',
        id: 'nesty1820'
      };

      test
        .set(settings)
        .identify(json.input)
        .sends(json.output)
        .expects(200)
        .end(done);

    });

    it('should let you set drop as the default method for handling nested objects', function(done) {
      var json = test.fixture('identify-default-method');
      intercom.settings.defaultMethod = 'drop';
      json.output.custom_attributes = {
        id: 'nesty1820'
      };

      test
        .set(settings)
        .identify(json.input)
        .sends(json.output)
        .expects(200)
        .end(done);
    });

    it('should let you set flatten as the default method for handling nested objects', function(done) {
      var json = test.fixture('identify-default-method');
      intercom.settings.defaultMethod = 'flatten';
      json.output.custom_attributes = {
        'foo.0': 'yo',
        'foo.1': 'hello',
        'foo.2.yolo': 'hi',
        id: 'nesty1820'
      };

      test
        .set(settings)
        .identify(json.input)
        .sends(json.output)
        .expects(200)
        .end(done);
    });

    it('should only handle objects with the default method', function(done) {
      var json = test.fixture('identify-default-method');
      intercom.settings.defaultMethod = 'drop';
      json.input.traits = {
        test_number: 12345,
        test_string: 'test'
      };
      json.output.custom_attributes = {
        test_number: 12345,
        test_string: 'test',
        id: 'nesty1820'
      };

      test
        .set(settings)
        .identify(json.input)
        .sends(json.output)
        .expects(200)
        .end(done);
    });
  });

  describe('.group()', function(){
    it('should be able to group correctly', function(done){
      var group = test.fixture('group-basic');
      test.group(group.input);
      test.requests(2);
      test
        .set(settings)
        .request(0)
        .sends(group.output)
        .expects(200);

      var input = test.fixture('group-basic').input;
      input.traits.created_at = time(new Date(input.traits.created_at));

      var name = input.traits.name;
      delete input.traits.name;

      var payload = {};
      payload.user_id = input.userId;
      payload.last_request_at = time(input.timestamp);
      payload.companies = [{
        company_id: input.groupId,
        custom_attributes: input.traits,
        name: name,
        remote_created_at: input.traits.created_at
      }];

      payload.custom_attributes = {
        id: input.userId
      };

      test
        .request(1)
        .sends(payload)
        .expects(200);

      test.end(done);
    })

    it('should work with .created_at', function(done){
      var traits = { created_at: 'Jan 1, 2000 3:32:33 PM', name: 'old company' };
      var group = helpers.group({ traits: traits, groupId: 'a5322d6' });
      delete group.obj.traits.created;
      intercom.group(group, done);
    });

    it('should work with .created', function(done){
      var traits = { created: 'Jan 1, 2014 3:32:33 PM', name: 'new company' };
      var group = helpers.group({ traits: traits, groupId: 'e186e5de' });
      intercom.group(group, done);
    });

    it('should selectively stringify, flatten, or drop traits', function(done){
      var json = test.fixture('group-blacklist');

      test
        .set(settings)
        .group(json.input)
        .sends(json.output)
        .expects(200)
        .end(done);
    });
  });

  describe('.track()', function(){
    it('should track', function(done){
      var json = test.fixture('track-basic');
      test
        .set(settings)
        .track(json.input)
        .sends(json.output)
        .expects(202)
        .end(done);
    });

    it('should error on invalid creds', function(done){
      test
        .set({ oauth: {'access-token': 'x' }})
        .track({})
        .error('Unauthorized', done);
    });

    it('should selectively stringify, flatten, or drop traits', function(done){
      var json = test.fixture('track-blacklist');

      test
        .request(1) // second req after beforeEach
        .set(settings)
        .track(json.input)
        .sends(json.output)
        .expects(202)
        .end(done);
    });
  });
});
