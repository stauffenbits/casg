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

        list: async function(){
          return await new Promise((resolve, reject) => {  
            client.getAll('', false).then(objects => resolve(Object.keys(objects).map((key) => {
              this._augment(objects[key], key);
              return objects[key];
            })))
          });
        },

        store: function(keyPair){
          var file = uuidv4();
          var path = `${file}`;
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
            name: li
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
          privateKey.title = `${name} <${email}>`;

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
        list: async function(){
          return await new Promise((resolve, reject) => {  
            client.getAll('', false).then(objects => resolve(Object.keys(objects).map((key) => {
              this._augment(objects[key], key);
              return objects[key];
            })))
          });
        },

        isShared: function(keyPair){
          var path = keyPair.name;
          var url = client.getItemUrl(path);
          console.log(url);

          keyPair.publicUrl = url;
          return url;
        },

        share: function(keyPair){
          var path = `${keyPair.name}`;
          var publicKey = {
            title: keyPair.title,
            publicKeyArmored: keyPair.publicKeyArmored
          };

          client.storeObject('casg-ownpublickey', path, publicKey)
        
          var url = client.getItemURL(path);
          keyPair.publicUrl = url;

          this._augment(publicKey, path);

          return publicKey;
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
          this._augmentIO(lio, li);
          Object.assign(lio, {
            name: li
          });

          return lio;
        }
      }
    }
  }
};

var OthersPublicKeys = {
  name: 'othersPublicKeys',
  builder: function(privateClient, publicClient){
    var client = privateClient;

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
        list: async function(){
          return await new Promise((resolve, reject) => {  
            client.getAll('', false).then(objects => {
              var arr = [];

              for(var key in objects){
                objects[key].name = key;
                this._augment(objects[key], key.toString());
                arr.push(objects[key]);
              }

              resolve(arr);
            })
          });
        },

        import: async function(url){
          var path = `${uuidv4()}`;
          
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
            return client.remove(li);
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
        list: async function(){
          return await new Promise((resolve, reject) => {  
            client.getAll('', false).then(objects => {
              var arr = [];

              for(var key in objects){
                objects[key].name = key;
                this._augment(objects[key], key.toString());
                arr.push(objects[key]);
              }

              resolve(arr);
            })
          });
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

            var path = `${uuidv4}`;
            
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
    },
    logging: false
  });

  $scope.keyPairs = [];
  $scope.ownPublicKeys = [];
  $scope.othersPublicKeys = [];

  $scope.RS.on('ready', async function(){
    $scope.RS.access.claim('keyPairs', 'rw');
    $scope.RS.access.claim('ownPublicKeys', 'rw');
    $scope.RS.access.claim('othersPublicKeys', 'rw');
    $scope.RS.access.claim('public', 'rw');

    $scope.RS.caching.enable('/keyPairs/');
    $scope.RS.caching.enable('/ownPublicKeys/');
    $scope.RS.caching.enable('/othersPublicKeys/');
    $scope.RS.caching.enable('/public/');

    $scope.RS.caching.set('/keyPairs/', 'ALL');
    $scope.RS.caching.set('/ownPublicKeys/', 'ALL');
    $scope.RS.caching.set('/othersPublicKeys/', 'ALL');
    $scope.RS.caching.set('/public/', 'ALL');

    $scope.keyPairs = await $scope.RS.keyPairs.list();
    $scope.ownPublicKeys = await $scope.RS.ownPublicKeys.list();
    $scope.othersPublicKeys = await $scope.RS.othersPublicKeys.list();
    $scope.ownPublicKeys = await $scope.RS.ownPublicKeys.list();
    $scope.$apply();

  });

  $scope.RS.on('connected', async function(){
    $scope.RS.startSync();
    $scope.keyPairs = await $scope.RS.keyPairs.list();
    console.log('fresh keyPairs', $scope.keyPairs);

    $scope.ownPublicKeys = await $scope.RS.ownPublicKeys.list();
    $scope.othersPublicKeys = await $scope.RS.othersPublicKeys.list();
    $scope.ownPublicKeys = await $scope.RS.ownPublicKeys.list();

    $scope.$apply();
  })

  $scope.clearStorage = function(){
    var ok = confirm("This will delete all storage!!! All Storage!!! Continue?");
    if(!ok){
      return;
    }

    var c = $scope.RS.scope('/');
    c.getListing('/', false).then(listing => {
      if(!listing){
        return;
      }

      Object.keys(listing).forEach(li => {
        c.remove(li);
      });
    });
    
    $scope.RS.caching.reset();
  }
  
  $scope.RS.on('network-offline', () => {
    console.debug(`We're offline now.`);
  });
  
  $scope.RS.on('network-online', () => {
    console.debug(`Hooray, we're back online.`);
  });

  $scope.RS.on('disconnected', () => {
    console.debug('disconnected');
  });

  $scope.storageWidget = new Widget($scope.RS, {leaveOpen: true, skipInitial: true});
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
    
    $scope.RS.keyPairs.create(name, email, phrase);
    $scope.keyPairs = $scope.RS.keyPairs.list();
    $scope.$apply();
  }

  $scope.exportToDevice = function(privateKey){
    var link = document.createElement('a');
    
    link.download = `${privateKey.title}.keypair.json`;

    var keyData = JSON.stringify(privateKey);
    var data = `data:text/json;charset=utf-8,${encodeURIComponent(keyData)}`;
    link.href = data;

    link.click();
  }

  $scope.exportToWeb = async function(keyPair){
    await $scope.RS.ownPublicKeys.share(keyPair);
    $scope.ownPublicKeys = $scope.RS.ownPublicKeys.list();
    $scope.$apply();
  }

  $scope.importKeyPair = function(){
    var f = document.querySelector('#key-pair-upload').files[0]
    var r = new FileReader();

    r.onload = async function(e){
      var data = e.target.result;
      var privateKey = JSON.parse(data);

      $scope.RS.keyPairs.store(privateKey);
      $scope.keyPairs = await $scope.RS.keyPairs.list();
      $scope.$apply();
    }

    r.readAsText(f);
  }

  $scope.removeKeyPair = async function(keyPair){
    keyPair.remove();
    $scope.keyPairs = await $scope.RS.keyPairs.list();
    delete keyPair;

    $scope.$apply();
  }

  $scope.removePublicKeyListing = async function(key){
    key.remove();
    $scope.ownPublicKeys = await $scope.RS.ownPublicKeys.list();
    delete key;

    $scope.$apply();
  }

  $scope.sharePublicKey = async function(key){
    var confirmation = confirm("Sharing your public key will share your name and email address, making it discoverable on the web. Please confirm you want to do that...");
    if(!confirmation){
      console.error('aborted');
      return;
    }

    var publicKey = await $scope.RS.ownPublicKeys.share(key);
    $scope.ownPublicKeys.push(publicKey);
    $scope.$apply();
    return url;
  };

  $scope.importPublicKey = function(url){
    $http.get(url).then((response) => {
      console.log(response.data);
      $scope.remoteStorage.otherspublickeys.store(response.data, $scope);
    })
  }

  $scope.clearKeyPairs = function(){
    $scope.keyPairs.forEach(keyPair => {
      keyPair.remove();
    });

    $scope.$apply();
  }

  $scope.clearAll = function(){
    $scope.remoteStorage.disconnect();
  }
}]);

