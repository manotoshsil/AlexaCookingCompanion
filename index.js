"use strict";

const Alexa = require('alexa-sdk');
const AWS = require('aws-sdk');
const R = require('request');
const cheerio = require('cheerio');
var uuidv1 = require('uuid/v1');

var region = "us-east-1";
var accessKeyId = "AKIAIJCBYJNYCE4YLCOQ";
var secretAccessKey = "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";
var tableName = "Recipes";

var recipes = [
    {
        ingredients: [
            "processed cheese grated 3/4th cup",
            "Chicken mince 1 cup",
            "Ginger finely chopped 1/2 inch",
            "Green chillies finely chopped 1-2",
            "Garam masala powder  1/2 teaspoon",
            "green cardamom powder  1/4 teaspoon",
            "Fresh coriander leaves chopped  1 tablespoon",
            "cashewnut powder 2 tablespoon",
            "Egg 1",
            "Salt",
            "oil greasing",
            "Melted butter basting"],
        steps: [
            "Step 1 Put chicken mince in a bowl. Add ginger, garlic, green chillies, garam masala powder, cardamom powder, coriander leaves, cashewnut powder, egg and salt and mix well.",
            "Step 3 Add cheese and mix well.",
            "Step 2 Grease your palms with some oil, divide the mixture into equal portions and wrap them around 2 satay sticks together.",
            "Step 3 Heat a griller. Place the sticks on it and grill, basting with butter, till fully cooked, golden and grill marks appear on sides.",
            "Step 4 Garnish with mint sprig and serve hot with onion rings and lemon slices."
        ]
    },
];

let handlers = {

    "LaunchRequest": function () {
        if(Object.keys(this.attributes).length === 0) {
            this.attributes.user = {
                'searchBy':'',
                'searchParam':'',
                'recipeState':{
                    'recipeIndex': -1,
                    'currentStep' : -1,
                    'ingredientListNo':-1
                },
                'currentRecipe':{
                    'steps':[],
                    'ingredients':[]
                },
                 'listRecipesCache': []
            };
            this.response.speak("Welcome to Cooking Assist. What would you like to prepare?")
                            .listen("Tell me, what would you like to prepare?");
        }else{

            this.response.speak("Welcome back")
                    .listen("Would you like to continue or search a different recipe");
        }
        this.emit(":responseReady");
    },

    // Sets user preferences
    // Mainly search-by and what to search
    // Once this is set, need to start searching
    "SetPreferenceIntent": function () {
        console.log("Let's set preferences for cooking in session");
        var recipeName = '';
    
        if(this.event.request.intent.slots.recipe_name.hasOwnProperty("value")){
            recipeName = this.event.request.intent.slots.recipe_name.value;
        }

        // here goes user preference in session
        if ( recipeName ){
            this.attributes.user.searchBy  = "recipeName";
            this.attributes.user.searchParam = recipeName;
        } else {
            this.attributes.user.searchBy = "invalid";
            this.attributes.user.searchParam = '';
        }

        var searchBy = this.attributes.user.searchBy ;

        this.emitWithState('SearchRecipe'); 
    },

    "ContinueNextStepIntent": function () {
        let recipeIndex = this.attributes.user.recipeState.recipeIndex;
        if (recipeIndex === -1) {
            recipeIndex = 0; // Here it can be recipe of search, this hardcoding shoud go off
        }

        let recipe = this.attributes.user.currentRecipe;
        if (recipe === {})
            recipe = recipes[0];

        let maxSteps = this.attributes.user.currentRecipe.steps.length();

        while (this.attributes.user.recipeState.currentStep < maxSteps) {
            let i = this.attributes.user.recipeState.currentStep;
            let speechText = this.attributes.user.currentRecipe.steps[i];
            this.attributes.user.recipeState.currentRecipe++;
            this.response.speak(speechText).listen("Shell I continue with the next step?");
        }
        this.emit(":responseReady");
    },

    "SearchRecipe": function () {
        if(!this.attributes.user.hasOwnProperty('listRecipesCache'))
            this.attributes.user.listRecipesCache = [];
        var _self = this;

        var recipeName = this.attributes.user.searchParam ;

        var dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: region,
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey
         });

        var params = {
            TableName : "Recipes",
            FilterExpression: "contains(#recipe_name, :recipe_name)",
            ExpressionAttributeNames: {
                "#recipe_name": "Recipe",
            },
            ExpressionAttributeValues: {
                ":recipe_name": recipeName,
            }
        };

        // Hit and miss concept

        // Lets do a DB query first
        dynamoDB.scan(params, function(err, data) {
            if (err) {
                // This is not search failure but technical problem
                // TAG: DB failure
                console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
                let speech = 'Sorry, there was a problem please try again.';
                // Lets nullify session object
                _self.attributes = {} ;
                _self.response.speak(speech);
                _self.emit(":responseReady");
            } else {
                // TAG: DB query
                let cursorLen = data.Items.length ;
                console.log("Query succeeded "+ cursorLen + " matches found");
                if (  cursorLen > 0) {
                    let speech = '';
                    if (cursorLen>5){
                        speech = 'I found ' + cursorLen +' items for ' + recipeName + '. Top five of it reads: ';
                        data.Items.slice(0,4).forEach(function(item,idx) {

                            speech += "Recipe " + (idx + 1) + " " + item.Recipe + ', rated '
                                            + parseFloat(item.ratings).toFixed(1) + ' out of 5 from  ' 
                                            + item.noOfReviews + ' reviews. ';
                            
                            // Caching the list for re-read
                            _self.attributes.user.listRecipesCache[idx] = item ;
                        }
                        );
                    } else {
                        speech = 'I found ' + cursorLen +' items for '+ recipeName + ' and those are ';
                        data.Items.forEach(function(item,idx) {
                            speech += "Recipe " + (idx + 1) + " " + item.Recipe + ', rated '
                                            + parseFloat(item.ratings).toFixed(1) + ' out of 5 from  ' 
                                            + item.noOfReviews + ' reviews. ';
                            // Caching the list for re-read
                            _self.attributes.user.listRecipesCache[idx] = item ;
                        }
                        );                      
                    }
  
                    // TAG: DB success (hit)
                    _self.response.speak(speech);
                    _self.emit(":responseReady");
                } else {
                    // Not in DB
                    // TAG: DB no-record
                    // Let's search the internet
                    // TAG: WEB search trigger

                    _self.emitWithState('WebSearch');
                }
            }
        });

    },

    "WebSearch" : function(){
        var _self = this;

        var recipeName = this.attributes.user.searchParam ;
        var dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: region,
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey
         });

        var params = {
            TableName : "Recipes",
            FilterExpression: "contains(#recipe_name, :recipe_name)",
            ExpressionAttributeNames: {
                "#recipe_name": "Recipe",
            },
            ExpressionAttributeValues: {
                ":recipe_name": recipeName,
            }
        };
        /* TODO
                Below is search logic. Right now we're dependant on allrecipes. We need to
                add generic search in place once entire application is complete
        */
        var searchUrl = "https://www.allrecipes.com/search/results/?wt="+recipeName+"&sort=re" ;
        console.log("Searching : "+ searchUrl);
        R(searchUrl,function (error, response, body) {
            if (!error) {
                const $ = cheerio.load(body);
                // console.log(body);
                let  searchResultlen = $('section.recipe-section article.fixed-recipe-card').length ;
                var speechText = '';
                
                if (searchResultlen>5){
                    speechText = 'I found ' + searchResultlen +' items for ' + recipeName + '. Top five of it reads: ';
                    $('section.recipe-section article.fixed-recipe-card').slice(0, 4).each((i, it) => {
                        // Change next line if changing primary key generation logic needs to be modified
                        var newPrimaryHashKey =  recipeName + ":" + uuidv1();

                        // Meta data of recipe
                        var name = $(it).find('span.fixed-recipe-card__title-link').text().toLowerCase();
                        var userRatings = $(it).find('.fixed-recipe-card__ratings > .stars').attr('data-ratingstars');
                        var totalReviews = $(it).find('span.fixed-recipe-card__reviews > format-large-number').attr('number');
                        var link = $(it).find('a.fixed-recipe-card__title-link').attr('href');

                        speechText += "Recipe " + (i + 1) + " " + name + ', rated '
                                        + parseFloat(userRatings).toFixed(1) + ' out of 5 from  ' 
                                        + totalReviews + ' reviews. ';
                        var params = {
                            Item: {
                                Recipe: name,
                                RecipeBy: "https://www.allrecipes.com",        // hard-coded
                                ratings: parseFloat(userRatings).toFixed(1),
                                url: link,
                                noOfReviews:totalReviews
                            },

                            ReturnConsumedCapacity: "TOTAL",
                            TableName: tableName,
                        };
                        // console.log("Adding into db item : "+JSON.stringify(params));

                        // Caching the list for re-read
                        _self.attributes.user.listRecipesCache[i] = params.Item ;                      
                        dynamoDB.put(params, function (err, data) {
                            console.log(err);
                        });
                    });

                } else {
                    speechText = 'I found ' + searchResultlen +' items for '+ recipeName + ' and those are ';
                    // data.Items.forEach(function(item,idx) {
                    //     speechText += "Recipe " + (idx + 1) + " " + item.Recipe + ', rated '
                    //                     + parseFloat(item.ratings).toFixed(1) + ' out of 5 ' ;
                    // });
                    $('section.recipe-section article.fixed-recipe-card').forEach(function(it, i){

                        // Change next line if changing primary key generation logic needs to be modified
                        var newPrimaryHashKey =  recipeName + ":" + uuidv1();

                        // Meta data of recipe
                        var name = $(it).find('span.fixed-recipe-card__title-link').text().toLowerCase();
                        var userRatings = $(it).find('.fixed-recipe-card__ratings > .stars').attr('data-ratingstars');
                        var totalReviews = $(it).find('span.fixed-recipe-card__reviews > format-large-number').attr('number');
                        var link = $(it).find('a.fixed-recipe-card__title-link').attr('href');

                        speechText += "Recipe " + ( i + 1) + " " + name + ', rated '
                                        + parseFloat(userRatings).toFixed(1) + ' out of 5 from  ' 
                                        + totalReviews + ' reviews. ';
                        var params = {
                            Item: {
                                Recipe: name,
                                RecipeBy: "https://www.allrecipes.com",        // hard-coded
                                ratings: parseFloat(userRatings).toFixed(1),
                                url: link,
                                noOfReviews:totalReviews
                            },

                            ReturnConsumedCapacity: "TOTAL",
                            TableName: tableName,
                        };
                        //console.log("Adding into db item : "+JSON.stringify(params));
                        // Caching the list for re-read
                        _self.attributes.user.listRecipesCache[i] = params.Item ;                        
                        dynamoDB.put(params, function (err, data) {
                            console.log(err);
                        });
                    });
                }
                
                _self.response.speak(speechText);
                _self.emit(":responseReady");
            } else {
                // TAG Search failed
                console.log(error);
            }
        });
    },

    "AMAZON.RepeatIntent": function(){
        // two possibilities : 1) USer has not started recipe detailing .. wants to repeat  entire Recipe search result .
        //                     2) User has started recipe detailing...wants to repeat the previous step.
    },    

    "StartRecipe": function () {
        if(!this.attributes.user.hasOwnProperty('currentRecipe')){
            this.attributes.user.currentRecipe = {};
            this.attributes.user.currentRecipe.steps = [];
            this.attributes.user.currentRecipe.ingredients = [];
        }
        var _self = this;
        var i = this.event.request.intent.slots.found_recipe_number.value - 1;
        
        let k = "You said Number " + (i+1) + " which is " + this.attributes.user.listRecipesCache[i].Recipe;
        k += ". To make this recipe you need ";
        
        R(this.attributes.user.listRecipesCache[i].url, function (error, response, body) {
            if (!error) {
                console.log("we're scrapping");
                // console.log(_self.attributes.user);
                const $ = cheerio.load(body);

                $('ul[id*="lst_ingredients"] span.recipe-ingred_txt').each(function (a, b) {
                    k += $(b).text();
                });

                $('span.recipe-directions__list--item').each(function (idx, item) {
                        console.log($(item).text());
                        $(item).text().split('.').forEach(function (sentence, index) {
                            console.log(sentence);
                            if (!(sentence.trim().indexOf('\n')===-1  && sentence.trim().indexOf('Watch Now')===-1  && sentence.trim()==='')){
                                _self.attributes.user.currentRecipe.steps.push(sentence.trim());
                            }
                        });
                });

                console.log(_self.attributes.user.currentRecipe.steps);

                _self.response.speak(k).listen("Should we start preparing?");
                _self.emit(":responseReady")
            }
        }
        );
    },

    "DirectionIntent" : function(){
        let speech = '' ;
        // let _self = this;
        let recipe = this.attributes.user.currentRecipe ;
        console.log(recipe);
        
        if ( this.attributes.user.recipeState.recipeIndex === -1) {
            console.log("Came to the first step");
        }
        this.attributes.user.recipeState.recipeIndex++;
        let currentStep = this.attributes.user.recipeState.recipeIndex;
        speech += "Please follow this steps : ";
        speech += " Step no " + currentStep  + " " +recipe.steps[currentStep];
        this.response.speak(speech).listen("say next step when you want to proceed");
        this.emit(":responseReady");
    },

    "AMAZON.YesIntent" : function() {
        let speech = '' ;
        let _self = this;
        let recipe = this.attributes.user.currentRecipe ;
        console.log(recipe);
        
        if ( this.attributes.user.recipeState.recipeIndex === -1) {
            console.log("Came to the first step");
        }
        this.attributes.user.recipeState.recipeIndex++;
        let currentStep = this.attributes.user.recipeState.recipeIndex;
        speech += "Please follow this steps : ";
        speech += " Step no " + currentStep  + " " +recipe.steps[currentStep];
        this.response.speak(speech).listen("say next step when you want to proceed");
        this.emit(":responseReady");
    },

    "AMAZON.NextIntent" : function() {
        let speech = '' ;
        let _self = this;
        let recipe = this.attributes.user.currentRecipe ;
        
        let currentStep = this.attributes.user.recipeState.recipeIndex + 1;

        if ((currentStep < recipe.steps.length)) {
            this.attributes.user.recipeState.recipeIndex++;
            speech +=  " Step no " + currentStep  + " " +recipe.steps[currentStep];            
            this.response.speak(speech).listen("say next step when you want to proceed, or previous to back to previous");
            this.emit(":responseReady");
        } else {
            speech += "We've completed. Thank you.";
            this.response.speak(speech).listen("Say previous to go back to previous.");
            this.emit(":responseReady");
        }        
    },
    "AMAZON.PreviousIntent" : function() {
        let speech = '' ;
        let _self = this;
        let recipe = this.attributes.user.currentRecipe ;
        
        let currentStep = this.attributes.user.recipeState.recipeIndex - 1 ;
        
        if ((currentStep  > -1)) {
            this.attributes.user.recipeState.recipeIndex--;
            speech +=  " Step no " + currentStep  + " " +recipe.steps[currentStep];            
            this.response.speak(speech).listen("say next step when you want to proceed, or previous to back to previous");
            this.emit(":responseReady");
        } else {
            speech += "We've reached beginning.";
            this.response.speak(speech).listen("say next step when you want to proceed");
            this.emit(":responseReady");
        }

    },
    "AMAZON.StopIntent": function () {
        this.response.speak("Bye");
        this.emit(":responseReady");
    },

    "AMAZON.HelpIntent": function () {
        this.response.speak("This is Decision Tree. I can help you find the perfect job. " +
            "You can say, recommend a job.").listen("Would you like a career or do you want to be a couch potato?");
        this.emit(":responseReady");
    },

    "AMAZON.CancelIntent": function () {
        this.response.speak("Bye");
        this.emit(":responseReady");
    },

    "AMAZON.StartOverIntent": function () {
        // Clearing off the session and starting over
        console.log("========== attribute has :" + JSON.stringify(this.attributes));
        console.log("======= clearing session now");
        // Lets clear the session before proceeding 
        this.attributes = {} ;
        console.log("========== attribute has :" + JSON.stringify(this.attributes));
        
        this.response.speak("Starting over");
        this.emit(":responseReady");
        this.handler.response.shouldEndSession = true;
        this.emit(':saveState', true);
    },

    "SessionEndedRequest": function () {
        console.log("Session ended with reason: " + this.event.request.reason);
        this.emit(':saveState', true);
    },

    "Unhandled": function () {
        this.response.speak("Sorry, I didn't get that. You can try: 'alexa, ask Cooking Assist to get me recipe of Italian Pizza");
    }
};

exports.handler = function (event, context) {
    // Each time your lambda function is triggered from your skill,
    // the event's JSON will be logged. Check Cloud Watch to see the event.
    // You can copy the log from Cloud Watch and use it for testing.
    console.log("====================");
    console.log("REQUEST: " /* + JSON.stringify(event) */);
    console.log("====================");
    context.callbackWaitsForEmptyEventLoop = false;
    let alexa = Alexa.handler(event, context);
    alexa.dynamoDBTableName = 'CookingAssistIndex';
    // Part 3: Task 4
    // alexa.dynamoDBTableName = 'petMatchTable';
    alexa.registerHandlers(handlers);
    alexa.execute();
};