'use strict';

const  dbHlpr = require('./database_helper');
var tableName = "Recipes";
module.exports = (function (){
    return {
        "greetWhatsup" : function(data){
            return "What's up yo";
        },
        "getRecipeById":function(data, event,recipeId){
            console.log("Getting recipe from db ra");
            
            // let userId = '';

            // // Long-form audio enabled skills use event.context
            // if (event.context) {
            //     userId = event.context.System.user.userId;
            // } else if (event.session) {
            //     userId = event.session.user.userId;
            // }
            var successObject = '';
            
            dbHlpr(this.dynamoDBClient).get(tableName, recipeId, 
                (err,recipeDbObj) => {
                    console.log("DB callback method");
                    if(err) {
                        console.log("Dynamo se nikali error :"+err);
                        return "Galat ";
                    }
                    console.log("what ijj "+JSON.stringify(recipeDbObj));

                    // // To save the state when AudioPlayer Requests come without sending a response.
                    // if (Object.keys(this.handler.response).length === 0 && this.handler.response.constructor === Object) {
                    //     this.handler.response =  true;
                    // }
                    this.successObject = recipeDbObj ;
                    // if(typeof this.callback === 'undefined') {
                    //     this.context.succeed(this.handler.response);
                    // } else {
                    //     this.callback(null, this.handler.response);
                    // }
            });
            // console.log("Your user ID ijj : "+userId);
            return this.successObject;
        }
    };
    
})();