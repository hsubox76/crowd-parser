'use strict';

angular.module('parserApp')
  .controller('DashboardCtrl', function ($scope, $http, Auth, Social) {

    // Initializes social sharing buttons in user dashboard
    Social.sbg();

    // Continually checks if user is logged in and if user has purchased keywords
    // Used to show different views depending on user status
    setInterval(function() {
      $scope.$apply(function() {

        $scope.loggedIn = Auth.loggedIn;
        $scope.purchasingUser = Auth.purchasingUser;
      });
    }, 500);

    // Check if user is a purchasing user at page load. If so, display the user dashboard instead of the checkout view.
    setTimeout(function() {

      FB.getLoginStatus(function(response) {
        if (response.status === 'connected') {

          var fb_id = response.authResponse.userID.toString();

          saveToken(response.authResponse.accessToken);
          localStorage.setItem('fb_id', fb_id);

          checkIfPurchased(fb_id);
        }
      });
    }, 700);

    // Save user's FB token for authentication
    function saveToken(token) {
      $http.post('/checkout/saveToken', {fbToken: token})
        .success(function(data) {

          console.log('FB access token saved!');
        });

      localStorage.setItem('fbToken', token);
    }

    // Checks if user is a purchasing user. If so, display user dashboard instead of the checkout view.
    function checkIfPurchased(fb_id) {

      $http.post('/checkout/checkIfPurchased', {fb_id: fb_id})
        .success(function(response) {
          if (response) {
            Auth.purchasingUser = true;
            $scope.purchasingUser = Auth.purchasingUser;

            $scope.purchasingUserDetails = response;

            $http.get('/checkout/getUserKeywords/' + $scope.purchasingUserDetails.id)
              .success(function(response) {

                $scope.purchasingUserKeywords = response;
              });
          }
        });
    }

    // User logs in with Facebook. If not purchasing user, display Stripe checkout view.
    // If user is a purchasing user, replace entire view with user dashboard
    $scope.fbLogin = function() {
      FB.login(function(response) {
        if (response.status === 'connected') {
          Auth.loggedIn = true;
          $scope.loggedIn = Auth.loggedIn;

          if (response.status === 'connected') {

            var fb_id = response.authResponse.userID.toString();

            saveToken(response.authResponse.accessToken);
            localStorage.setItem('fb_id', fb_id);

            checkIfPurchased(fb_id);
          }
        }
      });
    };

    // Stripe checkout form. Displayed when user is logged in, but not a purchasing user
    $scope.stripeCallback = function (code, result) {
      
      // Make sure the Stripe purchase form is correctly completed
      if ($scope.purchasingEmail !== $scope.repeatPurchasingEmail) {

        $('.stripe-error').html('');

        $('.stripe-error').show().append('<div>Error: Emails do not match</div>');
      } else if (!$scope.selectedOption) {

        $('.stripe-error').html('');

        $('.stripe-error').show().append('<div>Error: Number of keywords not selected</div>');
      } else if (result.error) {

        $('.stripe-error').html('');

        if (result.error.message) {

          $('.stripe-error').show().append('<div>Error: ' + result.error.message + '</div>');
          console.log('Error: ' + result.error.message);
        } else {
          $('.stripe-error').show().append('<div>Error: ' + result.error + '</div>');
        }

      } else {
        $('.stripe-error').hide();
        console.log('success! token: ' + result.id);

        FB.getLoginStatus(function(response) {
          var fb_id = response.authResponse.userID.toString();
          var name;
          var email;

          // If the user has already purchased keywords, name and email are not included in the form and will be retrieved from the database
          if ($scope.purchasingUserDetails) {

            name = $scope.purchasingUserDetails.name || $scope.purchasingUsername;
            email = $scope.purchasingUserDetails.email || $scope.purchasingEmail;
          } else {

            // Get name and email inputs if user has not purchased before
            name = $scope.purchasingUsername;
            email = $scope.purchasingEmail;
          }

          // Create the Stripe purchase
          var purchaseDetails = {
            fb_id: fb_id,
            name: name,
            email: email,
            number_of_keywords: $scope.selectedOption
          };

          var fbToken = response.authResponse.accessToken;

          $http.post('/checkout/purchase', {
            stripeToken: result.id, 
            purchaseDetails: purchaseDetails, 
            fbToken: fbToken
          })
            .success(function(data) {
              console.log('SERVER SUCCESS', data);

              checkIfPurchased(fb_id);
            })
            .error(function(data) {

              checkIfPurchased(fb_id);
            });
        });
      }
    };

    // Used for selecting how many keywords a user wants to purchase
    $scope.selectOption = function(number) {

      $scope.selectedOption = number;
    };

    // Used for when a user enters a keyword to add to the database
    $scope.userKeywordSubmit = function() {

      if ($scope.userKeywordInput === undefined) {
        return;
      }

      var fbToken = localStorage.getItem('fbToken');

      var userKeyword = $scope.userKeywordInput;
      $scope.userKeywordInput = '';

      var params = {
        id: $scope.purchasingUserDetails.id,
        keyword: userKeyword,
        fbToken: fbToken
      };

      $http.post('/checkout/userAddKeyword', params)
        .success(function(response) {
          
          console.log(response);

          var fb_id = localStorage.getItem('fb_id');

          checkIfPurchased(fb_id);
        });
    };
  })

  .directive('checkoutInfo', function() {
    return {
      restrict: 'E',
      templateUrl: 'app/dashboard/directive-checkout-info.html'
    };
  })

  .directive('stripeCheckoutForm', function() {
    return {
      restrict: 'E',
      templateUrl: 'app/dashboard/directive-stripe-checkout-form.html'
    };
  })

  .directive('userDashboard', function() {
    return {
      restrict: 'E',
      templateUrl: 'app/dashboard/directive-user-dashboard.html'
    };
  })

  .directive('stripeCheckoutExistingUsers', function() {
    return {
      restrict: 'E',
      templateUrl: 'app/dashboard/directive-stripe-checkout-existing-users.html'
    };
  });