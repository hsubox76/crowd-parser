'use strict';

angular.module('parserApp')
  .controller('3dStreamCtrl', function ($scope, $state, $location, $timeout, $http, Twitter, Display3d, Modal) {
    var socket = Twitter.socket;
    $scope.tweetData = []; // stores data of all tweets in display
    $scope.tweetCount = 0;
    $scope.autoScroll = 'ON'; // scrolls right automatically if tweets are offscreen right
    $scope.numTweetsToGet = 100; // Applies to REST request button
    $scope.receivingTweets = 'OFF'; // Toggles receiving tweets from live stream
    $scope.clientID = undefined; // For getting a private "room" for socket communication with server
    $scope.showKeywordMenu = false; // Toggle keyword menu dropdown
    $scope.showLayerMenu = false; // Toggle layer menu dropdown
    $scope.layers = []; // Stores layer data from factory
    $scope.layersVisible = {}; // Tracks layer visibility toggled in menu
    $scope.gettingKeywordTweets = false; // Tracks when finished getting keyword tweets from server
    $scope.flattenText = 'Flatten'; // Flatten/Separate button text toggle
    $scope.allKeywords = []; // Stores keyword data from DB
    $scope.wordLookup = {}; // Prevents duplicate keywords
    $scope.keywordStreamCount = { // For displaying how many keywords we have received
      received: 0,
      expected: 0,
    };
    var liveStreamStarted = false;
    var expectedKeywordTweets = 0;
    var runFakeTweets = false; // For testing
    var intervalID;
    var timeoutPromise;

    // Get keywords from DB to populate menu
    // Our keywords
    $http.get('/auth/adminlogin/showAllKeywords')
      .success(function(response) {

        var ourKeywords = response;
        
        ourKeywords.forEach(function(item) {

          $http.get('/statistics/getKeywordCount/' + item.keyword)
            .success(function(data) {

              if (data.length > 0) {
                if (!(item.keyword in $scope.wordLookup)) {
                  $scope.allKeywords.push({keyword: item.keyword, count: data[0].id});
                  $scope.wordLookup[item.keyword] = item.keyword;
                }
              }
              
            });
        });

      });

    // User keywords
    $http.get('/checkout/getAllUserKeywordsWithNames')
      .success(function(response) {

        var userKeywords = response;
                
        userKeywords.forEach(function(item) {

          $http.get('/statistics/getKeywordCount/' + item.purchased_keyword)
            .success(function(data) {

              if (data.length > 0) {

                if (!(item.purchased_keyword in $scope.wordLookup)) {
                  $scope.allKeywords.push({keyword: item.purchased_keyword, name: item.name, count: data[0].id});
                  $scope.wordLookup[item.purchased_keyword] = item.purchased_keyword;
                }

                for (var i = 0; i < $scope.allKeywords.length; i++) {
                  if ($scope.allKeywords[i].keyword === item.purchased_keyword) {
                    $scope.allKeywords[i].name = item.name;
                  }
                }

              }
              
            });
        });
      });


    // Gray out button when waiting for keyword tweets to come in from DB
    $scope.grayedOut = function () {
      return $scope.gettingKeywordTweets;
    };

    $scope.toggleFlatten = function () {
      if ($scope.flattenText === 'Flatten') {
        $scope.flattenText = 'Separate';
      } else {
        $scope.flattenText = 'Flatten';
      }
    };

    // Popup modal for editing tweet (currently just a display)
    $scope.editTweet = Modal.confirm.editTweet(function(x) { console.log(x); });

    // Sets display mode for 3d display (only using macro - fullscreen - right now)
    if ($state.current.name === 'main.components') {
      Display3d.init('mini');
    } else {
      Display3d.init('macro', $scope);
    }

    Display3d.animate();

    // check all boxes on
    $scope.layers.forEach(function (layer) {
      $scope.layersVisible[layer.title] = { viz: true };
    });

    // empty solo column if a layer is checked on or off manually
    $scope.clearSolo = function () {
      // clear solo
      for (var layer in $scope.layersVisible) {
        $scope.layersVisible[layer].solo = false;
      }
      Display3d.updateLayers($scope.layersVisible);
    };

    // turn off other layers if solo is checked for a layer
    $scope.soloLayer = function (layerToSolo) {
      for (var layer in $scope.layersVisible) {
        if (layer !== layerToSolo) {
          $scope.layersVisible[layer].viz = false;
          $scope.layersVisible[layer].solo = false;
        } else {
          $scope.layersVisible[layer].viz = true;
        }
      }
      Display3d.updateLayers($scope.layersVisible);
    };

    // This was for stopping a live stream from the Twitter API if the user leaves the page.
    // That live stream functionality is inactive right now.
    // Can be used to stop any process when user leaves the page.

    // two options, option 1: user navigates away traditionally (close browser,
    // type in new url, use back button, refresh)
    window.onbeforeunload = function () {
      Display3d.clear();
      socket.removeAllListeners();
      //socket.emit('twitter stop continuous stream');
    };

    // option 2: user uses angular routes
    $scope.$on('$locationChangeStart', function () {
      Display3d.clear();
      socket.removeAllListeners();
      //socket.emit('twitter stop continuous stream');
    });

    // toggle autoscroll on or off
    $scope.autoScrollToggle = function () {
      Display3d.autoScrollToggle();
      if ($scope.autoScroll === 'ON') {
        $scope.autoScroll = 'OFF';
      } else {
        $scope.autoScroll = 'ON';
      }
    };

    // toggle layer menu dropdown
    $scope.toggleLayerMenu = function () {
      $scope.showLayerMenu = !$scope.showLayerMenu;
    };

    // toggle layer menu dropdown
    $scope.toggleKeywordMenu = function () {
      $scope.showKeywordMenu = !$scope.showKeywordMenu;
    };

    // helper function to get clientID if we don't have one
    // and then run whatever code in cb
    var socketWithRoom = function(cb) {
      if ($scope.clientID === undefined) {
        console.log('getting ID');
        socket.emit('getID', $scope.clientID);
        socket.on('clientID', function(ID) {
          console.log('gotID: ' + ID);
          $scope.clientID = ID;
          cb();
        });
      } else {
        cb();
      }
    };

    // request REST tweets from server
    $scope.getRestTweets = function () {

      if (!$scope.keywordStream) {
        return;
      }

      $scope.tweetData = [];
      $scope.tweetCount = 0;
      liveStreamStarted = false;
      Display3d.clear();
      Display3d.reinit(25);

      socketWithRoom(function () {
        socket.emit('twitter rest search', $scope.keywordStream, 'recent', 100, null, $scope.clientID);
      });
    };
      
    // listen for requested REST tweets from server
    socket.on('all layers', function (data) {
      var tweets = data.tweetsWithAnalyses;
      var oldestID = tweets[tweets.length-1].id;
      $scope.tweetData = $scope.tweetData.concat(tweets);
      tweets.forEach(function (tweet) {
        Display3d.addTweet(tweet, $scope.tweetCount, $scope);
        $scope.tweetCount++;
        // tweet.addEventListener( 'click', function ( event ) {
        //   console.log(event);
        // }, false);
      });
      if ($scope.tweetData.length < $scope.numTweetsToGet) {
        socket.emit('twitter rest search', $scope.keywordStream, 'recent', 100, oldestID, $scope.clientID);
      } else {
        console.log($scope.tweetData.length);
      }
    });

    // given a raw tweet obj from the DB -
    // format it so that 3D Display can process it
    var formatTweetObject = function(tweetObj, i) {
      var tweetFormatted = {};
      tweetFormatted.text = tweetObj.tweet.text;
      tweetFormatted.username = tweetObj.tweet.user_name;
      tweetFormatted.timestamp = tweetObj.tweet.timestamp_ms;
      tweetFormatted.baseLayerResults = tweetObj.layers.Base;
      if (tweetObj.layers.Base) {
        tweetFormatted.baseLayerResults.negativeWords = JSON.parse(tweetObj.layers.Base.negativeWords);
        tweetFormatted.baseLayerResults.positiveWords = JSON.parse(tweetObj.layers.Base.positiveWords);
      } else {
        if (i) {
          console.log('no base layer available for tweetID: ' + i);
        }
      }
      tweetFormatted.emoticonLayerResults = tweetObj.layers.Emoticons;
      if (tweetObj.layers.Emoticons) {
        tweetFormatted.emoticonLayerResults.negativeWords = JSON.parse(tweetObj.layers.Emoticons.negativeWords);
        tweetFormatted.emoticonLayerResults.positiveWords = JSON.parse(tweetObj.layers.Emoticons.positiveWords);
      } else {
        if (i) {
          console.log('no base layer available for tweetID: ' + i);
        }
      }
      tweetFormatted.slangLayerResults = tweetObj.layers.Slang;
      if (tweetObj.layers.Slang) {
        tweetFormatted.slangLayerResults.negativeWords = JSON.parse(tweetObj.layers.Slang.negativeWords);
        tweetFormatted.slangLayerResults.positiveWords = JSON.parse(tweetObj.layers.Slang.positiveWords);
      } else {
        if (i) {
          console.log('no base layer available for tweetID: ' + i);
        }
      }
      tweetFormatted.negationLayerResults = tweetObj.layers.Negation;
      if (tweetObj.layers.Negation) {
        tweetFormatted.negationLayerResults.negativeWords = JSON.parse(tweetObj.layers.Negation.negativeWords);
        tweetFormatted.negationLayerResults.positiveWords = JSON.parse(tweetObj.layers.Negation.positiveWords);
      } else {
        if (i) {
          console.log('no base layer available for tweetID: ' + i);
        }
      }
      return tweetFormatted;
    };

    // start receiving live stream from database
    $scope.startLiveStream = function () {
      if (liveStreamStarted === false) {
        $scope.tweetData = [];
        $scope.tweetCount = 0;
        Display3d.clear();
        Display3d.reinit(25);
      }

      // if off, stops listening for live stream emits from DB
      if ($scope.receivingTweets === 'OFF') {
        $scope.receivingTweets = 'ON';
      } else {
        $scope.receivingTweets = 'OFF';
      }

      // receive live stream
      // don't want to add socket listener twice
      // so just do it the first time live stream listening is started
      if (liveStreamStarted === false) {
        liveStreamStarted = true;
      
        socket.on('tweet added', function (tweetsFromDB) {
          if ($scope.receivingTweets === 'ON') {
            console.log('received tweet');
            console.log(tweetsFromDB);

            var tweetIDs = Object.keys(tweetsFromDB);
            tweetIDs.sort();
            for (var i = 0; i < tweetIDs.length; i++) {
              var tweetObj = tweetsFromDB[tweetIDs[i]];
              var tweetFormatted = formatTweetObject(tweetObj);
              $scope.tweetData.push(tweetFormatted);
              Display3d.addTweet(tweetFormatted, $scope.tweetCount);
              $scope.tweetCount++;
            }
          }
        });
      }
    };

    // sorts all tweets currently in $scope.tweetData
    var sortTweetsByDate = function () {
      $scope.tweetData.sort(function (a,b) {
        if (a.timestamp < b.timestamp) {
          return -1;
        }
        if (a.timestamp > b.timestamp) {
          return 1;
        }
        return 0;
      });
    };

    // displays tweets currently stored in $scope.tweetData
    var displayAllTweets = function() {
      sortTweetsByDate();
      $scope.tweetData.forEach(function (tweet, i) {
        Display3d.addTweet(tweet, i, $scope);
      });
    };

    // request tweets by keyword from DB
    $scope.requestTweetsByKeyword = function (keyword) {
      liveStreamStarted = false;

      // gray out button until all tweets retrieved
      $scope.gettingKeywordTweets = true;

      $scope.tweetData = [];
      $scope.tweetCount = 0;
      Display3d.clear();
      Display3d.reinit(32);

      socketWithRoom(function () {
        console.log('making request for tweet keyword');
        socket.emit('tweet keyword', keyword, $scope.clientID);
      });
    };

    // listens for requested keyword tweets from DB
    socket.on('tweet keyword response', function (tweetsFromDB) {
      console.log('received tweet');
      console.log(tweetsFromDB);

      // if server is telling how many tweets to expect
      if (typeof tweetsFromDB !== 'object') {

        expectedKeywordTweets = +tweetsFromDB;
        $scope.keywordStreamCount.expected = +tweetsFromDB;

      } else {
        // start a timeout timer (cancel any existing one first)
        if (timeoutPromise) {

          console.log('getting new emit, cancelling ' + JSON.stringify(timeoutPromise));
          $timeout.cancel(timeoutPromise);

        }

        timeoutPromise = $timeout( function() { 
          console.log('timed out, displaying keyword tweets');
          $scope.gettingKeywordTweets = false;
          //displayAllTweets();
         }, 5000);

        timeoutPromise.then(
          function() {
            console.log('timeout promise resolved');
          },
          function() {
            console.log('timeout canceled');
          }
        );

        // still getting tweets, store tweets
        var tweetIDs = Object.keys(tweetsFromDB);
        for (var i = 0; i < tweetIDs.length; i++) {
          var tweetObj = tweetsFromDB[tweetIDs[i]];
          var tweetFormatted = formatTweetObject(tweetObj, tweetIDs[i]);
          $scope.tweetData.push(tweetFormatted);
          if ($scope.tweetCount+1 >= expectedKeywordTweets) {
            console.log($scope.tweetCount);
            Display3d.addTweet(tweetFormatted, $scope.tweetCount, true);
          } else {
            Display3d.addTweet(tweetFormatted, $scope.tweetCount);
          }
          $scope.tweetCount++;
        }
        $scope.keywordStreamCount.received = $scope.tweetCount;

        console.log($scope.tweetCount);
        // if we got all the tweets we were expecting
        if ($scope.tweetCount >= expectedKeywordTweets) {
          // cancel timeout
          if (timeoutPromise) {
            console.log('cancelling ' + timeoutPromise);
            $timeout.cancel(timeoutPromise);
          }
          console.log('received all keyword tweets');
          $scope.gettingKeywordTweets = false;
          //displayAllTweets();
        }
      }
    });


    // =====================================
    // CODE FOR LIVE STREAM FROM TWITTER API
    // API limits mean we can't expose this
    // to users (we only get one stream)
    // =====================================
    // $scope.start3DKeywordStream = function () {
    //   // stop any existing stream
    //   socket.emit('twitter stop continuous stream');

    //   // split by commas and trim whitespace
    //   var keywords = $scope.keywordStream.split(',');
    //   keywords = keywords.map(function (item) {
    //     return item.trim();
    //   });

    //   // emit
    //   socket.emit('twitter stream filter continuous', keywords);

    //   // receive
    //   socket.on('tweet results', function (tweetResult) {
    //     $scope.tweetData.push(tweetResult);
    //     Display3d.addTweet(tweetResult, $scope.tweetCount);
    //     $scope.tweetCount++;
    //   });
    // };

    // ====================================
    // CODE FOR GENERATING FAKE TEST TWEETS
    // ====================================
    var fakeScore = function () {
      if (Math.random() < 0.6) {
        return 0;
      }
      return Math.round(-1 + 2 * Math.random());
    };

    var fakeText = function () {
      var length = 10 + 100 * Math.random();
      var chars = "abcdefghijklmnopqurstuvwxyz";
      var text = '';
      for (var i = 0; i < length; i++) {
        if (3 * Math.random() <= 1 && text[text.length-1] !== ' ') {
          text += ' '
        }
        text += chars[Math.floor(chars.length * Math.random())];
      }
      return text;
    };

    var endTime;
    var total = 20000;

    var addFakeTweet = function (last) {
      if ($scope.tweetCount >= total) {
        runFakeTweets = false;
        if (!endTime) {
          endTime = new Date();
          console.log(endTime - timeStart);
        }
      }
      if (runFakeTweets === true) {
        var fakeTweet = {};
        fakeTweet.baseLayerResults = { positiveWords: [], negativeWords: [], score: fakeScore() };
        fakeTweet.emoticonLayerResults = { positiveWords: [], negativeWords: [], score: fakeScore() };
        //fakeTweet.username = 'user' + Math.round(1000 * Math.random());
        fakeTweet.username = 'user' + $scope.tweetCount;
        fakeTweet.text = fakeText();
        $scope.tweetData.push(fakeTweet);
        if (last) {
          Display3d.addTweet(fakeTweet, $scope.tweetCount, true);
        } else {
          Display3d.addTweet(fakeTweet, $scope.tweetCount);
        }
        $scope.tweetCount++;
      }
    };

    var timeStart;

    $scope.batchFakeTweets = function () {
      runFakeTweets = true;
      timeStart = new Date();
      for (var i = 0; i < total; i++) {
        if (i === total-1) {
          addFakeTweet(true);
        } else{
          addFakeTweet();
        }
      }
      endTime = new Date();
      console.log(endTime - timeStart);
    };

    var chunk = function (chunkSize) {
      runFakeTweets = true;
      timeStart = new Date();
      for (var i = 0; i < chunkSize; i++) {
        if ($scope.tweetCount + 1 >= total) {
          addFakeTweet(true);
          runFakeTweets = false;
          if (intervalID) {
            clearInterval(intervalID);
          }
        } else {
          addFakeTweet();
        }
      }
      //endTime = new Date();
      //console.log(endTime - timeStart);
    };

    $scope.chunkStreamFakeTweets = function () {
      // stop any existing stream
      socket.emit('twitter stop continuous stream');
      if (runFakeTweets) {
        runFakeTweets = false;
        if (intervalID) {
          clearInterval(intervalID);
        }
      } else {
        runFakeTweets = true;
        timeStart = new Date();
        intervalID = setInterval(function () {
          chunk(100);
        }, 200);
      }
      
    };

    $scope.streamFakeTweets = function () {
      // stop any existing stream
      socket.emit('twitter stop continuous stream');
      if (runFakeTweets) {
        runFakeTweets = false;
        if (intervalID) {
          clearInterval(intervalID);
        }
      } else {
        runFakeTweets = true;
        timeStart = new Date();
        intervalID = setInterval(addFakeTweet, 2);
      }
      
    };


  });