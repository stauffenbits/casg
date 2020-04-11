var casgApp = angular.module("casgApp");

casgApp.config(function($routeProvider){
  $routeProvider
  .when('/', {
    templateUrl: 'casg/main.html'
  })
  .otherwise({
    redirectTo: '/'
  })
})