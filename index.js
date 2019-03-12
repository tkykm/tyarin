var request = require('request');
var jq = require('node-jq');
var dateformat = require('dateformat');
var urlencode = require('urlencode');
var Tyarin = require('./tyarin');

/**
 * Background Cloud Function to be triggered by Pub/Sub.
 *
 * @param {object} data The event payload.
 * @param {object} context The event metadata.
 */
exports.tyarin = async function (data, context) {
    try{
        const pubSubMessage = data;
        const name = pubSubMessage.data ? Buffer.from(pubSubMessage.data, 'base64').toString() : 'Tyarin Published';
        console.log(`${name}`);
        let tyarin = new Tyarin(process.env.AZURE_TENANT);
        await tyarin.initialize(process.env.AZURE_CLIENT_ID, process.env.AZURE_CLIENT_SECRET);
        let subscriptions = await tyarin.getSubscriptions();
        console.log(subscriptions.value);
        subscriptions = subscriptions.value;
        let runs = [];
        for(let i = 0; i <subscriptions.length; i++){
            runs.push(tyarin.run(subscriptions[i].subscriptionId, subscriptions[i].displayName));
        }
        await Promise.all(runs);
    }
    catch(e){
        console.error(e);
        throw e;
    }
};

  