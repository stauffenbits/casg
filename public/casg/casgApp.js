var casgApp = angular.module('casgApp', ['ngRoute', 'ngSanitize', 'ui.bootstrap']);

// https://stackoverflow.com/a/2117523/11169288
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
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

var KeyPairs = {
  name: 'keyPairs',
  builder: function(privateClient, publicClient){    
    var client = privateClient;
    var folder = '/casg/KeyPairs/';
    var pgp = new PGPLoader();

    client.declareType('casg-keypair', {
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
      'required': ['title', 'privateKeyArmored', 'publicKeyArmored', 'revocationCertificate']
    });

    return {
      exports: {
        [Symbol.iterator]: function(){
          return this._generator();
        },

        _generator: async function*(){
          var listing = await client.getListing(folder);

          for(var li of Object.keys(listing)){
            var lio = await client.getObject(li.toString());
            this._augment(lio, li);

            yield lio;
          }
        },

        list: async function(){
          var listing = await client.getListing(folder);
          
          return Promise.all(
            Object.keys(listing).map(li =>
              new Promise((resolve, reject) => 
                client.getObject(li).then(lio => {
                  this._augment(lio, li);
                  resolve(lio);
                }, reject))
            )
          );
        },

        store: function(keyPair){
          var file = uuidv4();
          var path = `${folder}${file}`;
          client.storeObject('casg-keypair', path, keyPair);
          this._augment(keyPair, path);

          return keyPair;
        },

        _augmentPGP: function(lio){
          Object.assign(lio, {
            encrypt: async function(text, to, phrase){
              pgp.setKey(lio, phrase);
              return await pgp.encrypt(text, to);
            },
  
            decrypt: async function(ciphertext, from, phrase){
              pgp.setKey(lio, phrase);
              return await pgp.decrypt(ciphertext, from);
            }
          });
        },

        _augmentIO: function(lio, li){
          Object.assign(lio, {
            remove: function(){
              client.remove(li);
            }
          });

          return lio;
        },

        _augment: function(lio, li){
          this._augmentPGP(lio);
          this._augmentIO(lio, li);
          Object.assign(lio, {
            name: li.slice(li.lastIndexOf('/'))
          });

          return lio;
        },

        create: async function(name, email, phrase){
          var privateKey = await openpgp.generateKey({ 
            curve: 'curve25519',  
            userIds: [{ 
              'name': name,
              'email': email
            }],
            'passphrase': phrase
          });          
          privateKey.title = `${name} <${email}`;

          return await this.store(privateKey)
        }
      }
    }
  }
};

var OwnPublicKeys = {
  name: 'ownPublicKeys',
  builder: function(privateClient, publicClient){
    var client = publicClient;
    var folder = '/casg/OwnPublicKeys/';

    client.declareType('casg-ownpublickey', {
      'type': 'object',
      'properties': {
        'title': {
          'type': 'string',
          'default': 'Untitled Public Key'
        },
        'publicKeyArmored': {
          'type': 'string'
        }
      },
      'required': ['title', 'publicKeyArmored']
    });

    return {
      exports: {
        [Symbol.iterator]: function(){
          return this._generator();
        },

        _generator: async function*(){
          var listing = await client.getListing(folder);

          for(var li of Object.keys(listing)){
            var lio = await client.getObject(li);
            this._augment(lio, li);

            yield lio;
          }
        },

        list: async function(){
          var listing = await client.getListing(folder);
          
          return Promise.all(
            Object.keys(listing).map(li =>
              new Promise((resolve, reject) => 
                client.getObject(li).then(lio => {
                  this._augment(lio, li);
                  resolve(lio);
                }, reject))
            )
          );
        },

        share: function(keyPair){
          var path = `${folder}${keyPair.name}`;

          return new Promise((resolve, reject) => {
            client.storeObject('casg-ownpublickey', path, {
              title: keyPair.title,
              publicKeyArmored: keyPair.publicKeyArmored
            }).then(() => {
              var url = client.getItemURL(path);
              keyPair.publicUrl = url;

              resolve(url);
            }, reject);
          });
        },

        remove: function(keyPair){
          var path = `${folder}${keyPair.name}`;
          client.remove(path);
        }
      }
    }
  }
};

var OthersPublicKeys = {
  name: 'othersPublicKeys',
  builder: function(privateClient, publicClient){
    var client = privateClient;
    var folder = '/casg/OthersPublicKeys/';

    client.declareType('casg-otherspublickey', {
      'type': 'object',
      'properties': {
        'title': {
          'type': 'string',
          'default': 'Untitled Public Key'
        },
        'publicKeyArmored': {
          'type': 'string'
        }
      },
      'required': ['title', 'publicKeyArmored']
    });
    

    return {
      exports: {
        [Symbol.iterator]: function(){
          return this._generator();
        },

        _generator: async function*(){
          var listing = await client.getListing(folder);

          for(var li of Object.keys(listing)){
            var lio = await client.getObject(li);
            this._augment(lio, li);

            yield lio;
          }
        },

        list: async function(){
          var listing = await client.getListing(folder);
          
          return Promise.all(
            Object.keys(listing).map(li =>
              new Promise((resolve, reject) => 
                client.getObject(li).then(lio => {
                  this._augment(lio, li);
                  resolve(lio);
                }, reject))
            )
          );
        },
        import: async function(url){
          var path = `${folder}${uuidv4()}`;
          
          return new Promise((resolve, reject) => {
            $.get(url, {}, (data, status) => {
              var key = {
                title: data.title,
                publicKeyArmored: data.publicKeyArmored
              };

              client.storeObject('casg-ownpublickey', path, key);
              this._augment(key, path);

              resolve(key);
            });
          })
        },

        _augmentIO: function(lio, li){
          lio.remove = function(){
            client.remove(li);
          }

          return lio;
        },

        _augment: function(lio, li){
          this._augmentIO(lio, li);
          lio.name = li.slice(li.lastIndexOf('/'));

          return lio;
        }
      }
    }
  }
};

var Graphs = {
  name: 'graphs',
  builder: function(privateClient, publicClient){
    var client = privateClient;
    var folder = '/casg/graphs/';
    var pgp = new PGPLoader();
    
    privateClient.declareType('casg-graph', {
      'type': 'object',
      'properties': {
        'title': {
          'type': 'string',
          'default': 'Untitled Graph'
        },

        'description': {
          'type': 'string',
          'default': ''
        },

        'commands': {
          'type': 'array',
          'default': []
        }

      },
      'required': ['title', 'commands']
    });

    return {
      exports: {
        [Symbol.iterator]: function(){
          return this._generator();
        },

        _generator: async function*(){
          var listing = await client.getListing(folder);

          for(var li of Object.keys(listing)){
            var lio = await client.getObject(li);
            this._augment(lio, li);

            yield lio;
          }
        },

        list: async function(){
          var listing = await client.getListing(folder);
          
          return Promise.all(
            Object.keys(listing).map(li =>
              new Promise((resolve, reject) => 
                client.getObject(li).then(lio => {
                  this._augment(lio, li);
                  resolve(lio);
                }, reject))
            )
          );
        },

        store: function(graph){
          var file = uuidv4()
          var path = `${folder}${file}`;
          client.storeObject('casg-graph', path, graph);

          return path;
        },

        create: function(title, description, commands){
          var path = `${folder}${uuidv4()}`;
          var privateKey = this.store({
            title,
            description,
            commands
          });
          this._augment(privateKey, path);

          return privateKey;
        },

        _augmentIO: function(lio, li){
          lio.remove = function(){
            client.remove(li);
          };

          lio.clone = function(){
            return client.create(lio.title, lio.description, lio.commands);
          };

          lio.share = async function(privateKey, to, phrase){
            var encrypted = privateKey.encrypt(JSON.stringify({
              title: lio.title,
              description: lio.description, 
              commands: lio.commands           
            }), to, phrase);

            var path = `${folder}${uuidv4}`;
            
            await publicClient.storeFile('text', path, encrypted)
            var url = publicClient.getItemURL(path);

            return url;
          };
        },

        _augment: function(lio, li){
          this._augmentPGP(lio);
          this._augmentIO(lio, li);
          lio.name = li.slice(li.lastIndexOf('/'));
        }
      }
    }
  }
};

var MainCtrl = casgApp.controller('MainCtrl', ['$scope', '$http', async function($scope, $http){
  // RemoteStorage Variables and Functions
  $('[data-toggle="tooltip"]').tooltip();
  $scope.currentKeyPair = null;

  $scope.RS = new RemoteStorage({
    modules: [ KeyPairs, OwnPublicKeys, OthersPublicKeys ],
    cache: true,
    changeEvents: {
      local:    true,
      window:   true,
      remote:   true,
      conflict: true
    }
  });

  $scope.keyPairs = [];
  $scope.ownPublicKeys = [];
  $scope.othersPublicKeys = [];

  $scope.RS.on('ready', function(){
    $scope.RS.access.claim('*', 'rw');
    $scope.RS.access.claim('casg', 'rw');
    $scope.RS.access.claim('public', 'rw');

    $scope.RS.caching.enable('/casg/');
    $scope.RS.caching.enable('/public/')
    
    $scope.keyPairs = $scope.RS.keyPairs.list();
    $scope.ownPublicKeys = $scope.RS.ownPublicKeys.list();
    $scope.othersPublicKeys = $scope.RS.othersPublicKeys.list();
  })

  $scope.clearStorage = function(){
    var ok = confirm("This will delete all storage!!! All Storage!!! Continue?");
    if(!ok){
      return;
    }

    var c = $scope.RS.scope('/');
    ['/casg/', '/public/'].forEach(path => {
      c.getListing(path).then(listing => {
        Object.keys(listing).forEach(li => {
          c.remove(li);
        });
      });
    })
  }
  
  $scope.RS.on('network-offline', () => {
    console.debug(`We're offline now.`);
  });
  
  $scope.RS.on('network-online', () => {
    console.debug(`Hooray, we're back online.`);
  });

  $scope.RS.on('disconnected', () => {
    console.debug('disconnected');
  })

  $scope.storageWidget = new Widget($scope.RS);
  $scope.configureStorage = function(){
    if(document.querySelector('remote-storage-configuration>*') == undefined){
      $scope.storageWidget.attach('remote-storage-configuration');
    }
  }

  // OpenPGP.js Variables and Functions

  $scope.namePrompt = "Please enter your name for the key pair: ";
  $scope.emailPrompt = "Please enter your email for the key pair: ";
  $scope.phrasePrompt = "Please enter a passphrase for the key pair: ";

  $scope.generateKeyPair = async function(){
    /*
    var confirmation = confirm("Creating a new Key Pair means you will re-encrypt all files and shares. Would you like to continue?")
    if(!confirmation){
      console.error('aborted');
      return;
    }
    */

    var name = prompt($scope.namePrompt);
    if(!name){
      console.error('aborted');
      return;
    }

    var email = prompt($scope.emailPrompt);
    if(!email){
      console.error('aborted');
      return;
    }

    var phrase = prompt($scope.phrasePrompt)
    if(!phrase){
      console.error('aborted');
      return;
    }
    
    var keyPair = await $scope.RS.keyPairs.create(name, email, phrase);
    $scope.keyPairs.push(keyPair);
    $scope.$apply();
  }

  $scope.exportKeyPair = function(privateKey){
    var link = document.createElement('a');
    
    link.download = `${privateKey.title}.keypair.json`;

    var keyData = JSON.stringify(privateKey);
    var data = `data:text/json;charset=utf-8,${encodeURIComponent(keyData)}`;
    link.href = data;

    link.click();
  }

  $scope.importKeyPair = function(){
    var f = document.querySelector('#key-pair-upload').files[0]
    var r = new FileReader();

    r.onload = function(e){
      var data = e.target.result;
      var privateKey = JSON.parse(data);

      $scope.RS.keyPairs.store(privateKey);
      $scope.$apply();
    }

    r.readAsText(f);
  }

  $scope.removeKeyPair = function(keyPair){
    $scope.keyPairs = $scope.keyPairs.slice($scope.keyPairs.indexOf(keyPair));
    keyPair.remove();

    $scope.$apply();
  }

  $scope.sharePublicKey = async function(key){
    var confirmation = confirm("Sharing your public key will share your name and email address, making it discoverable on the web. Please confirm you want to do that...");
    if(!confirmation){
      console.error('aborted');
      return;
    }

    var url = await $scope.RS.ownpublickeys.share(key);
    $scope.remoteStorage.startSync();
    
    $scope.publicKeyUrls[key.title] = url;

    console.log(key.title, 'shared at', url)
    return url;
  };

  $scope.importPublicKey = function(url){
    $http.get(url).then((response) => {
      console.log(response.data);
      $scope.remoteStorage.otherspublickeys.store(response.data, $scope);
    })
  }

  $scope.clearAll = function(){
    $scope.remoteStorage.disconnect();
  }
}]);

