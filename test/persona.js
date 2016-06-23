var assert = require('chai').assert;
var Persona = require('../lib/persona.js');
var ecpair = require('bitcoinjs-lib').ECPair;
var bigi = require('bigi');
var ipfs = require('ipfs-js');
var ipfsApi = require('ipfs-api');
var Web3 = require('web3');
var web3 = new Web3();
var pudding = require('ether-pudding');
pudding.setWeb3(web3);

var web3Prov = new web3.providers.HttpProvider('http://localhost:8545');
var ipfsProv = ipfsApi('localhost', 5001);
web3.setProvider(web3Prov);
ipfs.setProvider(ipfsProv);

// Setup for deployment of a new uport registry
var UportRegistry = require("uport-registry/environments/development/contracts/UportRegistry.sol.js").load(pudding);
UportRegistry = pudding.whisk({binary: UportRegistry.binary, abi: UportRegistry.abi})

var testData = require('./testData.json');

describe("Persona", function () {
  this.timeout(10000);

  var persona;
  var claim;
  var registryAddress;
  var accounts = web3.eth.accounts;

  it("Correctly verifies tokens", (done) => {
    assert.isTrue(Persona.isTokenValid(testData.validToken));
    testData.invalidTokens.forEach((token) => {
      assert.isFalse(Persona.isTokenValid(token));
    });
    done();
  });

  it("Correctly converts private keys to public keys", (done) => {
    var pubSignKey = Persona.privateKeyToPublicKey(testData.privSignKey1);
    assert.equal(pubSignKey, testData.pubSignKey1_valid);
    assert.notEqual(pubSignKey, testData.pubSignKey1_invalid);
    done();
  });

  it("Creates a persona object", (done) => {
    UportRegistry.new(accounts[0], {from: accounts[0]}).then((uportReg) => {
      registryAddress = uportReg.address;
      persona = new Persona(accounts[0], registryAddress);
      persona.setProviders(ipfsProv, web3Prov);
      assert.equal(persona.address, accounts[0]);
      done();
    }).catch(done);
  });

  it("Adds profile as self signed claims", (done) => {
    persona.setProfile(testData.profile, testData.privSignKey1).then(() => {
      persona.getAllClaims().forEach((token) => {
        assert.isTrue(Persona.isTokenValid(token), "Should not generate invalid tokens.");
      });
      var pubSignKey = persona.getPublicSigningKey();
      assert.equal(Persona.privateKeyToPublicKey(testData.privSignKey1), pubSignKey);
      done();
    }).catch(done);
  });

  it("Correctly loads tokenRecords from uport registry", (done) => {
    var tmpRecords = persona.getAllClaims();
    persona = null;
    persona = new Persona(accounts[0], registryAddress);
    persona.setProviders(ipfsProv, web3Prov);
    persona.load().then(() => {
      assert.deepEqual(tmpRecords, persona.getAllClaims());
      done();
    }).catch(done);
  });

  it("Returns correct profile", (done) => {
    var p = persona.getProfile();
    delete p.pubSignKey;
    delete p.pubEncKey;
    assert.deepEqual(p, testData.profile);
    done();
  });

  it("Correctly returns requested claim", (done) => {
    var token = persona.getClaims("name")[0];
    assert.equal(token.decodedToken.payload.claim.name, testData.profile.name);
    token = persona.getClaims("dontExist")[0];
    assert.isUndefined(token);
    done();
  });

  it("Signs attribute correctly", (done) => {
    // Create a claim that is signed by a third party
    claim = persona.signAttribute(testData.additionalAttribute, testData.privSignKey2);
    assert.isTrue(Persona.isTokenValid(claim));
    done();
  });

  it("Adds attribute correctly and updates registry", (done) => {
    // Add a new self signed attribute
    var key = Object.keys(testData.additionalAttribute)[0];
    persona.addAttribute(testData.additionalAttribute, testData.privSignKey1).then(() => {
      var tokens = persona.getClaims(key);
      assert.equal(tokens.length, 1, "Only one token should have been added.");
      assert.isTrue(Persona.isTokenValid(tokens[0]));
      // Check that registry is updated
      return persona.load();
    }).then(() => {
      var p = persona.getProfile();
      delete p.pubSignKey;
      delete p.pubEncKey;
      assert(p[key], testData.additionalAttribute[key], "New attribute should be present");
      delete p[key];
      assert.deepEqual(p, testData.profile);
      done();
    }).catch(done);
  });

  it("Adds claim correctly", (done) => {
    // Add standalone claim
    var key = Object.keys(testData.additionalAttribute)[0];
    persona.addClaim(claim).then(() => {
      var tokens = persona.getClaims(key);
      assert.equal(tokens.length, 2, "There should be 2 tokens added.");
      assert.isTrue(Persona.isTokenValid(tokens[0]));
      assert.isTrue(Persona.isTokenValid(tokens[1]));
      done();
    }).catch(done);
  });

  it("Reject invalid claim", (done) => {
    var claimAdded;
    persona.addClaim(testData.invalidTokens[0]).then(() => {
      claimAdded = true;
    }).catch((err) => {
      claimAdded = false;
    }).then(() => {
      assert.isFalse(claimAdded, "Should not add invalid Claim.");
      done();
    }).catch(done);
  });

  it("Replaces attribute correctly", (done) => {
    // replacing an attribute that has two attestations should remove
    // the two old attestations.
    // In this test we raplace the additionalAttribute.
    var key = Object.keys(testData.additionalAttribute)[0];
    persona.replaceAttribute(testData.replacementAttribute, testData.privSignKey1).then(() => {
      var tokens = persona.getClaims(key);
      assert.equal(tokens.length, 1, "Only one token should be present.");
      assert.isTrue(Persona.isTokenValid(tokens[0]));
      // Check that registry is updated
      return persona.load();
    }).then(() => {
      var p = persona.getProfile();
      delete p.pubSignKey;
      delete p.pubEncKey;
      assert(p[key], testData.replacementAttribute[key], "New attribute should be present");
      delete p[key];
      assert.deepEqual(p, testData.profile);
      done();
    }).catch(done);
  });

  it("Removes attribute correctly", (done) => {
    var attrName = Object.keys(testData.additionalAttribute)[0];
    persona.deleteAttribute(attrName, testData.privSignKey1).then(() => {
      var tokens = persona.getClaims(attrName);
      assert.equal(tokens.length, 0, "No token should be present.");
      // Check that registry is updated
      return persona.load();
    }).then(() => {
      var p = persona.getProfile();
      delete p.pubSignKey;
      delete p.pubEncKey;
      assert.deepEqual(p, testData.profile);
      done();
    }).catch(done);
  });
});
