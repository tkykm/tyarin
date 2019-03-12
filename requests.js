'use strict';

var request = require('request');
var jq = require('node-jq');
var dateformat = require('dateformat');
var urlencode = require('urlencode');

const authorityHostUrl = 'https://login.windows.net'
const resource = 'https://management.azure.com/';
const ALLOWED_KEYS = ['identity', 'kind', 'location', 'managedBy', 'plan', 'properties', 'sku', 'tags'];

/**
 * Constructs a new requests object.
 * @constructor
 * @param {string} azureTenant
 */  
function Requests(azureTenant) {
    this._tenant = azureTenant;
    this._authorityUrl = authorityHostUrl + '/' + this._tenant;
    this._authenticationContext = require('adal-node').createAuthenticationContext(this._authorityUrl);
}

// set azure access token
Requests.prototype.setToken = function(token){
    this._token = token;
}

Requests.prototype.getActivityLogs = function(subscriptionId, nextLink){
    let headers = { 
        Authorization: "bearer " + this._token
    };
    let date = new Date();
    let diff = process.env.FROM_DIFF_MINUTES ? process.env.FROM_DIFF_MINUTES : 5;
    let fromDateTime = dateformat((date.setMinutes(date.getMinutes() - diff)), 'isoUtcDateTime');

    let qs = {
        'api-version': '2015-04-01',
        '$filter': `eventTimestamp ge '${fromDateTime}'`,
        '$select': 'correlationId,caller,status,properties,resourceGroupName,resourceId,description,eventname,operationName,eventTimestamp,resourceProviderName,resourceType'
    }    
    let url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/microsoft.insights/eventtypes/management/values`

    let options = {
        url: nextLink ? nextLink :url,
        method: 'get',
        qs: nextLink ? "" : qs,
        headers: headers,
        json: true
    };

    return new Promise((resolve,reject) => {
        request(options, (error, response, body) => {
        if(error) reject('error: '+ response.statusCode);
        if(response.statusCode != 200) reject(JSON.stringify(body));
        resolve(body);
        });
    });
    
}

Requests.prototype.getSubscriptions = function(){
    let headers = { 
        Authorization: "bearer " + this._token
    };
    let url = 'https://management.azure.com/subscriptions?api-version=2016-06-01';
    let options = {
        url: url,
        method: 'get',
        headers: headers,
        json: true
    };

    return new Promise((resolve,reject) => {
        request(options, (error, response, body) => {
        if(error) reject('error: '+ response.statusCode);
        if(response.statusCode != 200) reject(JSON.stringify(body));
        resolve(body);
        });
    });
}

Requests.prototype.getApiVersions = function(subscriptionId){
    let headers = { 
        Authorization: "bearer " + this._token
    };
    let qs = {
        'api-version': '2018-05-01'
    }    
    let url = `https://management.azure.com/subscriptions/${subscriptionId}/providers`;

    let options = {
        url: url,
        method: 'get',
        qs: qs,
        headers: headers,
        json: true
    };

    return new Promise((resolve,reject) => {
        request(options, (error, response, body) => {
        if(error) reject('error: '+ response.statusCode);
        if(response.statusCode != 200) reject(JSON.stringify(body));
        resolve(body);
        });
    });
}

Requests.prototype.getCorrelationIdFromCreatedLog = function(jsonPath, option){
    return jq.run(
        '.value| map(select(.properties.statusCode == "Created"))| [[.[].correlationId], map({id: .correlationId, time:.eventTimestamp})]| map(unique)', 
        jsonPath, 
        option);
        
}

Requests.prototype.getResourcesFromCorrelationId = function(correlationId, jsonPath, option){
    return jq.run(
        `.value | map(select((.correlationId == "${correlationId}") and (.resourceProviderName.value != "Microsoft.Resources") and (.status.value == "Succeeded"))) | [{"resourceId":.[].resourceId, "caller":.[].caller}] | unique`
        , jsonPath, option);
}

Requests.prototype.getApiVerion = function(resourceProvider, resourceType, jsonPath, option){
    return jq.run(
        `.value[] | select(.namespace == "${resourceProvider}") | .resourceTypes[] | select(.resourceType == "${resourceType}") | .apiVersions[0]`,
        jsonPath,
        option);
}
Requests.prototype.getEventTime = function(correlationId, jsonPath, option){
    return jq.run(
        `map(select(.id == "${correlationId}"))[0].time`,
        jsonPath,
        option);
}


Requests.prototype.getResourceProperties = function(resouceId, apiVersion){
    let headers = { 
        Authorization: "bearer " + this._token
    };
    let qs = {
        'api-version': apiVersion
    };    
    let url = `https://management.azure.com/${resouceId}`;
    let options = {
        url: url,
        method: 'get',
        qs: qs,
        headers: headers,
        json: true
    };

    return new Promise((resolve,reject) => {
        request(options, (error, response, body) => {
        if(error) reject('error: '+ response.statusCode);
        if(response.statusCode != 200) reject(JSON.stringify(body) + JSON.stringify(options));
        resolve(body);
        });
    });
}

Requests.prototype.putResourceProperties = function(properties, apiVersion){
    let headers = { 
        Authorization: "bearer " + this._token,
        Accept: 'application/json'
    };
    let qs = {
        'api-version': apiVersion
    }    
    let url = `https://management.azure.com${properties.id}`;
    let body = {};
    for (var key in properties){
        if (ALLOWED_KEYS.indexOf(key) != -1){
            body[key] = properties[key];
        } 
    }
    let options = {
        url: url,
        method: 'put',
        qs: qs,
        headers: headers,
        body: body,
        json: true
    };

    return new Promise((resolve,reject) => {
        request(options, (error, response, body) => {
        if(error) reject('error: '+ response.statusCode);
        if(response.statusCode > 202) reject(`${JSON.stringify(response)}, ${JSON.stringify(body)}`);
        resolve(body);
        });
    }); 
}

Requests.prototype.postSlack = function(url, caller, id, eventTime, SubscriptionName, resourceGroup, resourceType){
    url = process.env.SLACK_WEBHOOK;
    let payload = {
        channel: process.env.SLACK_CHANNEL,
        text: "A resource has created!",
        "attachments": [
            {
            "color": "good",
            title: "Resource Link",
            title_link: `https://portal.azure.com/#@${this._tenant}/resource${id}`,
            "fields": [
                        {
                            "title": "Subscription",
                            "value": SubscriptionName,
                            "short": true
                        },
                        {
                            title: "Resouce Group",
                            value: resourceGroup,
                            "short": true
                        },
                        {
                            title: "Resource Type",
                            value: resourceType,
                            "short": true
                        },
                        {
                            "title": "Caller",
                            "value": caller,
                            "short": true
                        },
                        {
                            "title": "Date",
                            "value": eventTime,
                            "short": true
                        }
                    ]
            }
        ]
    };
        
    let options = {
        url: url,
        method: 'post',
        form: 'payload=' + urlencode(JSON.stringify(payload)),
        json: true
    };
    return new Promise((resolve,reject) => {
        request(options, (error, response, body) => {
            if(error) reject('error: '+ response.statusCode);
            if(response.statusCode != 200) reject(JSON.stringify(body));
            resolve(body);
        });
    }); 
}

/**
 * @param {appid} appid aad appid or clientid
 * @param {secret} secret secret key of appid or clientid
 */
Requests.prototype.getAzureAccessToken = function(appid, secret){
    return new Promise((resolve, reject) => {
        this._authenticationContext.acquireTokenWithClientCredentials(resource, appid, secret, function(err, tokenResponse) {
            if (err) {
                reject('well that didn\'t work: ' + err.stack);
            } else {
                resolve(tokenResponse.accessToken);
            }
        });
    });
}


module.exports = Requests;