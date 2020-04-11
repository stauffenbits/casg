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
            .storeObject('keypair', `/keypairs/${key.title}.keypair`, key)
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

        get: function(title){
          return privateClient.getObject(title);
        },

        remove: function(path){
          return privateClient.remove('/keypairs/' + path);
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

var MainCtrl = casgApp.controller('MainCtrl', ['$scope', async function($scope){
  // RemoteStorage Variables and Functions

  $scope.keyPaths = [];
  $scope.keyPairs = new Map();


  $scope.privateKeys = {};
  $scope.storeKeyPair = function(privateKey){
    $scope.remoteStorage.keypairs.store(privateKey);
    $scope.privateKeys[privateKey.title] = privateKey;
    $scope.$apply();
  }

  $scope.userAddress = null;
  $scope.remoteStorage = new RemoteStorage({modules: [ Graphs, KeyPairs ] });
  
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

  $scope.openGraph = function(){
    if($scope.client !== null){
      $scope.client.getListing('').then(listing => {
        console.log('LISTING', listing);
      })
    }else{
      alert('Please specify a storage account first.')
    }
  }

  $scope.writeGraph = function(title, graph){
    var title = prompt("Title:", 'Untitled');
    
    $scope.remoteStorage.graphs.store(
      'text/casg', 
      title, 
      {
        "title": title,
        'time': [{tact: 'sequence'}, 
          [{tact: 1000}, '+0![3](3.png)', '0![2](2.png)', '0![1](1.png)', '0![0](0.png)'],
          [{tact: 'parallel'}, '-0', '+1![Joshua](Joshua.png)', '+2[37](black)', '+3![label](image)'], 
          [{tact: 'parallel'}, '+1_2[label](color)', '+2_3', '+1_3'], 
          [{tact: 500}, '-1_3', '-2_3', '-1_2', '-3', '-2', '-1'],
          [{tact: 1000}, '+4![0](0.png)', '4![1](1.png)', '4![2](2.png)', '4![3](3.png)']
        ]
      }
    )
    .then(() => console.log("data has been saved"));
  }

  // OpenPGP.js Variables and Functions

  $scope.generateKeyPair = async function(){
    var confirmation = confirm("Creating a new Key Pair means you will re-encrypt all files and shares. Would you like to continue?")
    if(!confirmation){
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
    var keyTriple = await openpgp.generateKey({ 
      curve: 'curve25519',  
      userIds: [{ 
        name: name,
        email: email
      }],
      passphrase: pass
    });

    keyTriple.title = `${name} <${email}>`;

    $scope.storeKeyPair(keyTriple);
  }

  $scope.exportKeyPair = function(privateKey){
    var link = document.createElement('a');
    
    link.download = `${privateKey.title}.keypair`;

    var keyData = JSON.stringify(privateKey);
    var data = `data:text/json;charset=utf-8,${encodeURIComponent(keyData)}`;
    link.href = data;

    link.click();
  }


  $scope.loadKeyPairs = async function(){

    $scope.keyPaths = [];
    $scope.keyPairs = new Map();

    console.log("loading key pairs")

    var listing = await $scope.remoteStorage.keypairs.list();
    console.log('listing: ', listing);
    for(var keyPath in listing){
      console.log('keypath', keyPath);
      $scope.keyPaths.push(keyPath.toString());
      
      $scope.remoteStorage.keypairs.get('/keypairs/' + keyPath)
        .then(keyPair => {
          console.log('fetching', keyPath);
          $scope.keyPairs.set(keyPath.toString(), keyPair);
          $scope.$apply();
        });
    }
  }

  $scope.removeKeyPair = function(path){
    $scope.remoteStorage.keypairs.remove(path)
    $scope.loadKeyPairs();
  }

  $scope.importKeyPair = function(){
    modalInstance.result
    .then(keyPair => {
      console.log(keyPair);
    }, reason => {
      console.error(reason);
    })
    // store key, 
    // load keys
  }

  $scope.remoteStorage.on('connected', () => {
    console.debug('connected RemoteStorage');

    $scope.userAddress = $scope.remoteStorage.remote.userAddress;
    $scope.$apply();

    $scope.remoteStorage.access.claim('keypairs', 'rw');
    $scope.remoteStorage.access.claim('keys', 'rw');
    $scope.remoteStorage.access.claim('graphs', 'rw');
    
    $scope.remoteStorage.caching.enable('/keypairs/');
    $scope.remoteStorage.caching.enable('/graphs/');
    $scope.remoteStorage.caching.enable('/keys/');

    $scope.loadKeyPairs();
  });
}]);

