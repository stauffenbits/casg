
  $scope.remoteStorage.on('connected', () => {
    console.debug('connected RemoteStorage');

    $scope.userAddress = $scope.remoteStorage.remote.userAddress;
    $scope.$apply();



    $scope.loadKeyPairs();
  });


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

        store: function(name, key) {    
          return privateClient
            .storeObject('keypair', name, key)
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

        get: function(path){
          return privateClient.getObject(path);
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

  $scope.remoteStorage = new RemoteStorage({modules: [ Graphs, KeyPairs ] });

  $scope.remoteStorage.on('connected', () => {
    console.debug('connected RemoteStorage');

    $scope.userAddress = $scope.remoteStorage.remote.userAddress;
    $scope.$apply();

    $scope.loadKeyPairs();
  });
  
  $scope.remoteStorage.on('network-offline', () => {
    console.debug(`We're offline now.`);
  });
  
  $scope.remoteStorage.on('network-online', () => {
    console.debug(`Hooray, we're back online.`);
  });

  $scope.remoteStorage.access.claim('keypairs', 'rw');
  $scope.remoteStorage.access.claim('keys', 'rw');
  $scope.remoteStorage.access.claim('graphs', 'rw');

  $scope.userAddress = null;

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

  $scope.keyPairs = [];
  $scope.publicKeys = [];

  $scope.generateKeyPair = async function(){
    var pass = prompt("Please enter a passphrase");
    if($scope.userAddress !== null){
      // { privateKeyArmored, publicKeyArmored, revocationCertificate }
      var keyTriple = await openpgp.generateKey({ 
        curve: 'curve25519',  
        userIds: [{ 
          name: $scope.userAddress, 
          email: $scope.userAddress,
        }],
        passphrase: pass
      });

      console.log('Key pair generated');

      keyTriple.title = `${$scope.userAddress}`;

      $scope.remoteStorage.access.claim('keypairs', 'rw');
      $scope.remoteStorage.caching.enable('/keypairs/');

      $scope.remoteStorage.keypairs.store(
        `/keypairs/${$scope.userAddress}.keypair`,
        keyTriple
      );

      $scope.loadKeyPairs();
    }
  }

  $scope.exportKeyPair = function(path){
    console.log($scope.keyPairs);
    var link = document.createElement('a');
    
    var keyPair = $scope.keyPairs.get(path);
    link.download = keyPair.title;

    console.log('keyPair found', keyPair.title);

    var keyData = JSON.stringify($scope.keyPairs.get(path));
    console.log("keyData", keyData);
    var data = `data:text/json;charset=utf-8,${encodeURIComponent(keyData)}`;
    link.href = data;

    link.click();
  }

  $scope.keyPaths = [];
  $scope.keyPairs = new Map();

  $scope.loadKeyPairs = async function(){

    $scope.keyPaths = [];
    $scope.keyPairs = new Map();

    console.log("loading key pairs")

    $scope.remoteStorage.access.claim('keypairs', 'rw');
    $scope.remoteStorage.caching.enable('/keypairs/');

    var listing = await $scope.remoteStorage.keypairs.list();
    console.log(listing);
    for(var keyPath in listing){
      console.log('keypath', keyPath);
      $scope.keyPaths.push(keyPath.toString());
      
      $scope.remoteStorage.keypairs.get('/keypairs/' + keyPath)
        .then(keyPair => {
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
}]);