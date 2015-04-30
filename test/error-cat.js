'use strict';

require('loadenv')('error-cat:test:env');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.test;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var expect = require('code').expect;
var sinon = require('sinon');
var Boom = require('boom');
var rollbar = require('rollbar');
var ErrorCat = require('../index.js');

describe('ErrorCat', function() {
  describe('interface', function () {
    it('should expose the ErrorCat class', function(done) {
      expect(ErrorCat).to.be.a.function();
      done();
    });

    it('should expose an immutable instance', function(done) {
      expect(ErrorCat._instance).to.be.an.instanceof(ErrorCat);
      expect(function () {
        ErrorCat._instance = 10;
      }).to.throw();
      done();
    });

    it('should expose an immutable static responder method', function(done) {
      expect(ErrorCat.responder).to.be.a.function();
      expect(function () {
        ErrorCat.responder = 'hello';
      }).to.throw();
      done();
    });
  }); // end 'interface'

  describe('constructor', function() {
    beforeEach(function (done) {
      sinon.stub(rollbar, 'init');
      sinon.stub(ErrorCat.prototype, 'canUseRollbar');
      done();
    });

    afterEach(function (done) {
      rollbar.init.restore();
      ErrorCat.prototype.canUseRollbar.restore();
      done();
    });

    it('should not initialize rollbar when not available', function(done) {
      ErrorCat.prototype.canUseRollbar.returns(false);
      var error = new ErrorCat();
      expect(rollbar.init.calledOnce).to.be.false();
      done();
    });

    it('should initialize rollbar when available', function(done) {
      ErrorCat.prototype.canUseRollbar.returns(true);
      var error = new ErrorCat();
      expect(rollbar.init.calledOnce).to.be.true();
      done();
    });
  }); // end 'constructor'

  describe('canUseRollbar', function () {
    var nodeEnv = process.env.NODE_ENV;
    var rollbarKey = process.env.ROLLBAR_KEY;
    var error = new ErrorCat();

    afterEach(function (done) {
      process.env.NODE_ENV = nodeEnv;
      process.env.ROLLBAR_KEY = rollbarKey;
      done();
    });

    it('should be false in test environment', function(done) {
      process.env.NODE_ENV = 'test';
      process.env.ROLLBAR_KEY = 'somekey';
      expect(error.canUseRollbar()).to.be.false();
      done();
    });

    it('should be false without a rollbar key', function(done) {
      process.env.NODE_ENV = 'production';
      delete process.env.ROLLBAR_KEY;
      expect(error.canUseRollbar()).to.be.false();
      done();
    });

    it('should be true with correct environment and rollbar key ', function(done) {
      process.env.NODE_ENV = 'production';
      process.env.ROLLBAR_KEY = 'somekey';
      expect(error.canUseRollbar()).to.be.true();
      done();
    });
  }); // end 'canUseRollbar'

  describe('create', function() {
    var error = new ErrorCat();

    beforeEach(function (done) {
      sinon.stub(error, 'log');
      sinon.stub(Boom, 'create');
      done();
    });

    afterEach(function (done) {
      error.log.restore();
      Boom.create.restore();
      done();
    });

    it('should create a new boom error', function(done) {
      var code = 400;
      var message = 'Error Message';
      var data = { key: 'value' };
      var expected = new Error('Errorz');
      Boom.create.returns(expected);
      expect(error.create(code, message, data)).to.equal(expected);
      expect(Boom.create.calledOnce).to.be.true();
      expect(Boom.create.calledWith(code, message, data)).to.be.true();
      done();
    });

    it('should log the error', function(done) {
      var err = error.create(400, 'Message', {});
      expect(error.log.calledOnce).to.be.true();
      expect(error.log.calledWith(err)).to.be.true();
      done();
    });
  }); // end 'create'

  describe('respond', function() {
    var error = new ErrorCat();

    it('should report normal errors as 500s', function(done) {
      error.respond(new Error(), null, {
        writeHead: function (code) {
          expect(code).to.equal(500);
        },
        end: function (message) {
          expect(message).to.equal('"Internal Server Error"');
          done();
        }
      });
    });

    it('should correctly report boom errors', function(done) {
      var errMessage = 'Errorz!';
      var err = Boom.create(404, errMessage);
      error.respond(err, null, {
        writeHead: function (code) {
          expect(code).to.equal(404);
        },
        end: function (message) {
          message = JSON.parse(message);
          expect(message.message).to.equal(errMessage);
          done();
        }
      });
    });
  }); // end 'respond'

  describe('log', function() {
    var error = new ErrorCat();

    beforeEach(function (done) {
      sinon.stub(error, 'debug');
      sinon.stub(error, 'report');
      done();
    });

    afterEach(function (done) {
      error.debug.restore();
      error.report.restore();
      done();
    });

    it('should log errors with auto-debug', function(done) {
      var err = new Error('Example');
      error.log(err);
      expect(error.debug.calledOnce).to.be.true();
      expect(error.debug.calledWith(err)).to.be.true();
      done();
    });

    it('should report errors', function(done) {
      var err = new Error('Example');
      error.log(err);
      expect(error.report.calledOnce).to.be.true();
      expect(error.report.calledWith(err)).to.be.true();
      done();
    });
  }); // end 'log'

  describe('report', function() {
    var error = new ErrorCat();

    beforeEach(function (done) {
      sinon.stub(rollbar, 'handleErrorWithPayloadData');
      sinon.stub(error, 'canUseRollbar').returns(true);
      done();
    });

    afterEach(function (done) {
      rollbar.handleErrorWithPayloadData.restore();
      error.canUseRollbar.restore();
      done();
    });

    it('should do nothing when rollbar is unavailable', function(done) {
      error.canUseRollbar.returns(false);
      error.report(new Error());
      expect(rollbar.handleErrorWithPayloadData.callCount).to.equal(0);
      done();
    });

    it('should use rollbar when available', function(done) {
      error.report(new Error());
      expect(rollbar.handleErrorWithPayloadData.calledOnce).to.be.true();
      done();
    });

    it('should provide error data when available', function(done) {
      var err = new Error();
      err.data = { some: 'data' };
      error.report(err);
      var expected = { custom: err.data };
      expect(rollbar.handleErrorWithPayloadData.firstCall.args[1])
        .to.deep.equal(expected);
      done();
    });

    it('should give empty data when none was provided', function(done) {
      error.report({});
      expect(rollbar.handleErrorWithPayloadData.firstCall.args[1])
        .to.deep.equal({ custom: {} });
      done();
    });
  }); // end 'report'
}); // end 'ErrorCat'
