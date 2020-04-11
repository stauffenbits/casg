var casgApp = angular.module('casgApp', ['ngRoute', 'ngSanitize', 'ui.bootstrap']);

var Graphs = {
  name: 'graphs',
  builder: function(privateClient, publicClient){

    privateClient.declareType('casg', {
      'type': 'object',
      'properties': {
        'title': {
          'type': 'string',
          'default': 'Title'
        },
        'vertices': {
          'type': 'array',
          'default': []
        },
        'edges': {
          'type': 'array',
          'default': []
        },
        'time': { // command history
          'type': 'array',
          'default': []
        }
      },
      'required': ['title']
    })

    return {
      exports: {

        storeFile: function(mimeType, name, data) {    
          return privateClient.storeFile(mimeType, name, data)
            .then(function() {
              return this.getFileURL(name);
            }.bind(this));
        },    

        list: function(){
          var self = this;

          return privateClient.getListing('')
            .then((listing) => {
              if(listing){
                self._removeDirectoryKeysFromListing(listing);
                return listing;
              }else{
                return {};
              }
            })
        },

        getFileURL(name){
          return privateClient.getItemURL(name);
        },

        _removeDirectoryKeysFromListing: function(listing) {
          Object.keys(listing).forEach(function(key){
            if (key.match(/\/$/)) {
              delete listing[key];
            }
          });
          return listing;
        }
      }
    }
  }
};

var KeyPairs = {
  name: 'keypairs',
  builder: function(privateClient, publicClient){
    privateClient.declareType('keypair', {
      'type': 'object',
      'properties': {
        'title': {
          'type': 'string',
          'default': 'Untitled Key Pair'
        },
        'privateKeyArmored': {
          'type': 'string'
        },
        'publicKeyArmored': {
          'type': 'string'
        },
        'revocationCertificate': {
          'type': 'string'
        }
      },
      'required': ['title']
    });

    return {
      exports: {

        store: function(key){
          return privateClient
            .storeObject('keypair', `/keypairs/${key.title}`, key)
            .then(() => {
              return key;
            })
        },

        list: function(){
          var self = this;

          return privateClient.getListing('/keypairs/')
            .then((listing) => {
              if(listing){
                self._removeDirectoryKeysFromListing(listing);
                return listing;
              }else{
                return {};
              }
            })
        },

        clear(){
          this.list().then(listing => {
            if(listing){
              Object.keys(listing).forEach(li => {
                privateClient.remove('/keypairs/' + li);
              })
            }
          })
        },

        get: function(title){
          return privateClient.getObject(`/keypairs/${title}`);
        },

        remove: function(title){
          console.log('removing', title)
          return privateClient.remove(`/keypairs/${title}`);
        },

        getFileURL(name){
          return privateClient.getItemURL(name);
        },

        getFile(path){
          return privateClient.getFile(path);
        },

        _removeDirectoryKeysFromListing: function(listing) {
          Object.keys(listing).forEach(function(key){
            if (key.match(/\/$/)) {
              delete listing[key];
            }
          });

          return listing;
        }
      }
    }
  }
}

class PGPLoader {
  constructor(){
    this.privateKey = null;
  }

  async setKey(privateKeyArmored, passphrase){
    this.privateKeyArmored = privateKeyArmored;
    this.passphrase = passphrase;

    if(!privateKeyArmored === this.privateKeyArmored){
      return;
    }

    this.privateKey = null;
    const { keys: [privateKey] } = await openpgp.key.readArmored(this.privateKeyArmored);
    if(privateKey){
      this.privateKey = privateKey;
    }

    this.privateKey.decrypt(this.passphrase);
  }

  /*
    Precondition:
    - setKey(...) has been called

    Postcondition: 
    - None

    Arguments: 
    - text: string
    - to: array of armored key strings, or single armored key

    Return value:
    - encrypted string
  */
  async encrypt(text, to){
    if(!this.privateKey){
      console.error("Please call setKey(...) first")
      return;
    }

    if(to instanceof Array){
      var publicKeys = await Promise.all(to.map(async key => {
        return (await openpgp.key.readArmored(key)).keys[0];
      }));
    }else{
      var publicKeys = (await openpgp.key.readArmored(to)).keys[0];
    }

    var { data: encrypted } = await openpgp.encrypt({
      message: openpgp.message.fromText(text),
      publicKeys,
      privateKeys: [this.privateKey]
    })

    return encrypted;
  }

  /*
    Precondition:
    - setKey(...) has been called

    Postcondition: 
    - None

    Arguments:
    - encrypted: string of encrypted text
    - senderPublicKey: the public key of the sender

    Return value:
    - decrypted text string
  */
  async decrypt(encrypted, senderPublicKey){
    var {data: decrypted} = await openpgp.decrypt({
      message: await openpgp.message.readArmored(encrypted),
      publicKeys: (await openpgp.key.readArmored(senderPublicKey)).keys[0],
      privateKeys: [this.privateKey]
    })

    return decrypted;
  }
}

var MainCtrl = casgApp.controller('MainCtrl', ['$scope', async function($scope){
  // RemoteStorage Variables and Functions

  $scope.clearAllKeys = function(){
    $scope.remoteStorage.keypairs.clear();    
  }

  $scope.pgp = new PGPLoader();

  $scope.currentKeyPair = null;
  $scope.privateKeys = {};
  $scope.storeKeyPair = function(privateKey){
    $scope.remoteStorage.keypairs.store(privateKey);
    $scope.privateKeys[privateKey.title] = privateKey;
    $scope.$apply();
  }

  $scope.userAddress = null;
  $scope.remoteStorage = new RemoteStorage({
    modules: [ Graphs, KeyPairs ],
    cache: true,
    changeEvents: {
      local:    true,
      window:   true,
      remote:   true,
      conflict: true
    }
  });

  $scope.remoteStorage.on('ready', function(){
    $scope.userAddress = $scope.remoteStorage.remote.userAddress;
    $scope.$apply();

    $scope.remoteStorage.access.claim('keypairs', 'rw');
    $scope.remoteStorage.access.claim('keys', 'rw');
    $scope.remoteStorage.access.claim('graphs', 'rw');
    
    $scope.remoteStorage.caching.enable('/keypairs/');
    $scope.remoteStorage.caching.enable('/graphs/');
    $scope.remoteStorage.caching.enable('/keys/');

    $scope.loadKeyPairs();
  })
  
  $scope.remoteStorage.on('network-offline', () => {
    console.debug(`We're offline now.`);
  });
  
  $scope.remoteStorage.on('network-online', () => {
    console.debug(`Hooray, we're back online.`);
  });

  $scope.storageWidget = new Widget($scope.remoteStorage);
  $scope.configureStorage = function(){
    $scope.storageWidget.attach('remote-storage-configuration');
    $scope.remoteStorage.caching.enable('/sc-casg/')
  }

  // OpenPGP.js Variables and Functions

  $scope.generateKeyPair = async function(){
    var confirmation = confirm("Creating a new Key Pair means you will re-encrypt all files and shares. Would you like to continue?")
    if(!confirmation){
      console.error('aborted');
      return;
    }
    
    var name = prompt("Please enter your name for the key pair: ");
    if(!name){
      console.error('aborted');
      return;
    }

    var email = prompt("Please enter your email for the key pair: ");
    if(!email){
      console.error('aborted');
      return;
    }

    var pass = prompt("Please enter a passphrase for the key pair: ")
    if(!pass){
      console.error('aborted');
      return;
    }

    // { privateKeyArmored, publicKeyArmored, revocationCertificate }
    var privateKey = await openpgp.generateKey({ 
      curve: 'curve25519',  
      userIds: [{ 
        name: name,
        email: email
      }],
      passphrase: pass
    });

    privateKey.title = `${name} <${email}>`;

    $scope.storeKeyPair(privateKey);

    if(!$scope.currentKeyPair){
      $scope.currentKeyPair = privateKey;
      $scope.pgp.setKey(privateKeyPair.privateKeyArmored, pass);
    }
  }

  $scope.activateKeyPair = function(title){
    var pass = prompt("Please enter the key pair's passpharse: ");
    if(!pass){
      console.error("aborted");
      return;
    }

    $scope.currentKeyPair = $scope.privateKeys[title];
    $scope.pgp.setKey($scope.currentKeyPair.privateKeyArmored, pass)
  }

  $scope.deactivateKeyPair = function(title){
    $scope.currentKeyPair = null;
  }

  $scope.exportKeyPair = function(privateKey){
    var link = document.createElement('a');
    
    link.download = `${privateKey.title}.privateKey`;

    var keyData = JSON.stringify(privateKey);
    var data = `data:text/json;charset=utf-8,${encodeURIComponent(keyData)}`;
    link.href = data;

    link.click();
  }


  $scope.loadKeyPairs = async function(){
    console.log("loading key pairs")

    var listing = await $scope.remoteStorage.keypairs.list();
    console.log('listing: ', listing);
    for(var keyPath in listing){
      $scope.remoteStorage.keypairs.get(keyPath)
        .then(privateKey => {
          console.log('fetching', keyPath);
          $scope.privateKeys[privateKey.title] = privateKey;
          $scope.$apply();
        });
    }
  }

  $scope.removeKeyPair = function(title){
    $scope.remoteStorage.keypairs.remove(title)
    delete $scope.privateKeys[title];
  }

  $scope.processKeyPairUpload = function(){
    var f = document.querySelector('#key-pair-upload').files[0]
    var r = new FileReader();

    r.onload = function(e){
      var data = e.target.result;
      var privateKey = JSON.parse(data);

      $scope.storeKeyPair(privateKey);

      $scope.privateKeys[privateKey.title] = privateKey;
      $scope.$apply();
    }

    r.readAsText(f);
  }
}]);

