'use strict';

angular.module('parserApp', [
  'parserApp.twitterService',
  'parserApp.wordcloudService',
  'parserApp.display3dService',
  'parserApp.authService',
  'parserApp.directives.dirPagination',
  'ngCookies',
  'ngResource',
  'ngSanitize',
  'ui.router',
  'ui.bootstrap'
])
  .config(function ($stateProvider, $urlRouterProvider, $locationProvider) {
    $stateProvider
      .state('main', {
        url: '/',
        templateUrl: 'app/main/main.html',
        controller: 'MainCtrl'
      })
      .state('3dstream', {
        url: '/3dstream',
        templateUrl: 'app/3dstream/3dstream.html',
        controller: '3dStreamCtrl'
      })
      .state('dbPanel', {
        url: '/dbPanel',
        templateUrl: 'app/dbPanel/dbPanel.html',
        controller: 'DBPanelCtrl'
      })
      .state('login', {
        url: '/login',
        templateUrl: 'app/login/login.html',
        controller: 'LoginCtrl'
      });

    $urlRouterProvider
      .otherwise('/');

    $locationProvider.html5Mode(true);
  });