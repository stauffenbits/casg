var casgApp = angular.module('casgApp', ['ngRoute', 'ngSanitize', 'ui.bootstrap']);

// https://stackoverflow.com/a/2117523/11169288
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

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
    });

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
          console.log('storing ', key.title)
          return privateClient.storeObject('keypair', `/casg/keypairs/${key.title}`, key);
        },

        list: function(){
          var self = this;

          return privateClient.getListing('/casg/keypairs/')
            .then((listing) => {
              console.log('keypair listing')
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
                privateClient.remove(li);
              })
            }
          })
        },

        get: function(title){
          return privateClient.getObject(`/casg/keypairs/${title}`);
        },

        remove: function(title){
          return privateClient.remove(`/casg/keypairs/${title}`);
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

var OwnPublicKeys = {
  name: 'ownpublickeys',
  builder: function(privateClient, publicClient){
    publicClient.declareType('ownpublickey', {
      'type': 'object',
      'properties': {
        'title': {
          'type': 'string'
        },
        'publicKeyArmored': {
          'type': 'string'
        }
      }, 
      'required': ['title', 'publicKeyArmored']
    });

    return {
      exports: {
        share: function(key){
          return new Promise((resolve, reject) => {
            publicClient
            .storeObject('ownpublickey', `/casg/ownpublickeys/${uuidv4()}`, {
              title: key.title,
              publicKeyArmored: key.publicKeyArmored
            })
            .then(() => {
              resolve(publicClient.getItemURL(`${key.title}`));
            }, reject)
          })
        },

        list: function(){
          var self = this;

          return publicClient.getListing('/casg/ownpublickeys/')
            .then(async (listing) => {
              if(listing){
                self._removeDirectoryKeysFromListing(listing);

                var titleUrls = {};
                await Promise.all(
                  Object.keys(listing).map(li => new Promise((resolve, reject) => {
                    publicClient.getFileURL(li).then(url => {
                      titleUrls[li] = url;
                      resolve(url);
                    }, reject);
                  }))
                );

                return titleUrls;
              }else{
                return {};
              }
            })
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

var OthersPublicKeys = {
  name: 'otherspublickeys',
  builder: function(privateClient, publicClient){
    privateClient.declareType('otherspublickey', {
      'type': 'object',
      'properties': {
        'title': {
          'type': 'string'
        },
        'publicKeyArmored': {
          'type': 'string'
        }
      }, 
      'required': ['title', 'publicKeyArmored']
    });

    return {
      exports: {
        store: function(key, $scope){
          return new Promise(async (resolve, reject) => {
            var encryptedTitle = await $scope.pgp.encrypt(key.title, [$scope.currentKeyPair.publicKeyArmored]);
            var encryptedKey = await $scope.pgp.encrypt(JSON.stringify(key.publicKeyArmored), [$scope.currentKeyPair.publicKeyArmored]);

            privateClient
            .storeObject('otherspublickey', `/casg/otherspublickeys/${key.title}`, {
              title: encryptedTitle,
              publicKeyArmored: encryptedKey
            })
            .then(resolve, reject)
          })
        },

        getAll: function($scope){
          var self = this;

          return privateClient.getListing('/casg/otherspublickeys/')
            .then(async (listing) => {
              if(listing){
                self._removeDirectoryKeysFromListing(listing);

                var publicKeys = {};
                await Promise.all(
                  Object.keys(listing).map(li => new Promise((resolve, reject) => {
                    privateClient.getObject(li).then(publicKey => {
                      publicKeys[li] = publicKey;

                      var decryptedTitle = $scope.pgp.decrypt(publicKey.title, $scope.currentKeyPair.publicKeyArmored);
                      var decryptedKey = $scope.pgp.decrypt(publicKey.publicKeyArmored, $scope.currentKeyPair.publicKeyArmored);

                      resolve({
                        title: decryptedTitle,
                        publicKeyArmored: decryptedKey                        
                      });
                    }, reject);
                  }))
                );

                return publicKeys;
              }else{
                return {};
              }
            });
        },

        list: function(){
          var self = this;

          return privateClient.getListing('/casg/otherspublickeys/')
            .then(async (listing) => {
              if(listing){
                self._removeDirectoryKeysFromListing(listing);

                var titleUrls = {};
                await Promise.all(
                  Object.keys(listing).map(li => new Promise((resolve, reject) => {
                    privateClient.getObject(li).then(publicKey => {
                      titleUrls[li] = publicKey;
                      resolve(url);
                    }, reject);
                  }))
                );

                return titleUrls;
              }else{
                return {};
              }
            })
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
  $('[data-toggle="tooltip"]').tooltip();

  $scope.clearAllKeys = function(){
    $scope.remoteStorage.keypairs.clear();    
  }

  $scope.pgp = new PGPLoader();

  $scope.currentKeyPair = null;
  $scope.privateKeys = {};
  $scope.publicKeys = {};

  $scope.storeKeyPair = function(privateKey){
    $scope.remoteStorage.keypairs.store(privateKey);
    $scope.privateKeys[privateKey.title] = privateKey;
    $scope.$apply();
  }

  $scope.userAddress = null;
  $scope.remoteStorage = new RemoteStorage({
    modules: [ Graphs, KeyPairs, OwnPublicKeys, OthersPublicKeys ],
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

    $scope.remoteStorage.access.claim('casg', 'rw');

    $scope.remoteStorage.caching.enable('/casg/');
    $scope.remoteStorage.caching.enable('/casg/ownpublickeys/');
    $scope.remoteStorage.caching.enable('/casg/otherspublickeys/');
    $scope.remoteStorage.caching.enable('/public/casg/');

    $scope.loadKeyPairs();

    $scope.remoteStorage.otherspublickeys.getAll($scope)
    .then(keys => {
      $scope.publicKeys = keys;
      $scope.$apply();
    })
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
      $scope.pgp.setKey($scope.currentKeyPair.privateKeyArmored, pass);
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
    
    link.download = `${privateKey.title}.keypair.json`;

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

      // i still can't get over the fact that 
    }
  }

  $scope.removeKeyPair = function(title){
    $scope.remoteStorage.keypairs.remove(title)
    delete $scope.privateKeys[title];
  }

  $scope.importKeyPair = function(){
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

  $scope.sharePublicKey = function(key){
    var confirmation = confirm("Sharing your public key will share your name and email address, making it discoverable on the web. Please confirm you want to do that...");
    if(!confirmation){
      console.error('aborted');
      return;
    }
    
    $scope.remoteStorage.ownpublickeys.share(key).then(url => {
      key.url = url;
      $scope.$apply();
    })
  };

  $scope.importPublicKey = function(url){
    $http.get(url).then((response) => {
      $scope.remoteStorage.otherspublickeys.store(response.data, $scope);
    })
  }
}]);

