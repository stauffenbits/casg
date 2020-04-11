var casgApp = angular.module("casgApp");

casgApp.config(function($routeProvider, $locationProvider){
  $routeProvider
  .when('/', {
    templateUrl: 'casg/main.html'
  })
  .when('/uploadKeyPair', {
    templateUrl: 'casg/importKeyPair.html'
  })
  .when('/importPublicKey', {
    templateUrl: 'casg/importPublicKey.html'
  })
  .otherwise({
    redirectTo: '/'
  })

  $locationProvider.html5Mode(true);
})